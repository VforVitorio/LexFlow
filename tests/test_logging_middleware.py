"""Tests for the structured-logging stack (#92).

Covers:
  * `RequestIdMiddleware` sets `X-Request-Id` on every response.
  * Inbound `X-Request-Id` is honoured when shaped correctly.
  * The `_JsonFormatter` produces one parseable JSON object per record
    with the contract documented in `logging_config.py`.
  * `RequestIdFilter` injects the active context var into the record.
"""

from __future__ import annotations

import io
import json
import logging

import pytest
from fastapi.testclient import TestClient

from lexflow.utils.logging_config import (
    RequestIdFilter,
    _ConsoleFormatter,
    _JsonFormatter,
    request_id_var,
)


@pytest.fixture(name="client")
def _client() -> TestClient:
    from lexflow.api.app import app

    return TestClient(app)


# ─── Middleware ──────────────────────────────────────────────────────────


class TestRequestIdMiddleware:
    def test_response_carries_x_request_id_header(self, client: TestClient) -> None:
        response = client.get("/health")
        assert response.status_code == 200
        rid = response.headers.get("X-Request-Id")
        assert rid is not None
        # UUID4 hex (32 chars) — middleware generates this shape.
        assert len(rid) == 32
        assert all(c in "0123456789abcdef" for c in rid)

    def test_inbound_x_request_id_is_honoured_when_valid_hex32(self, client: TestClient) -> None:
        inbound = "abcdef0123456789abcdef0123456789"
        response = client.get("/health", headers={"X-Request-Id": inbound})
        assert response.headers["X-Request-Id"] == inbound

    def test_inbound_x_request_id_is_honoured_when_valid_canonical_uuid(self, client: TestClient) -> None:
        inbound = "12345678-1234-1234-1234-123456789012"
        response = client.get("/health", headers={"X-Request-Id": inbound})
        assert response.headers["X-Request-Id"] == inbound

    def test_garbage_inbound_x_request_id_is_replaced(self, client: TestClient) -> None:
        response = client.get("/health", headers={"X-Request-Id": "DROP TABLE users;"})
        rid = response.headers["X-Request-Id"]
        # The replacement is a fresh UUID4 hex, never the inbound garbage.
        assert "DROP" not in rid
        assert len(rid) == 32


# ─── Formatters + filter ─────────────────────────────────────────────────


def _make_record(**kwargs: object) -> logging.LogRecord:
    base = {
        "name": "lexflow.test",
        "level": logging.INFO,
        "pathname": __file__,
        "lineno": 1,
        "msg": kwargs.pop("msg", "hello"),
        "args": (),
        "exc_info": None,
    }
    record = logging.LogRecord(**base)
    for key, value in kwargs.items():
        setattr(record, key, value)
    return record


class TestRequestIdFilter:
    def test_pulls_active_request_id_into_record(self) -> None:
        token = request_id_var.set("deadbeef" * 4)
        try:
            record = _make_record()
            RequestIdFilter().filter(record)
            assert record.request_id == "deadbeef" * 4
        finally:
            request_id_var.reset(token)

    def test_record_carries_none_when_no_request_in_flight(self) -> None:
        record = _make_record()
        RequestIdFilter().filter(record)
        assert record.request_id is None


class TestJsonFormatter:
    def test_emits_one_parseable_object_per_record(self) -> None:
        formatter = _JsonFormatter()
        record = _make_record(request_id="abc")
        line = formatter.format(record)
        payload = json.loads(line)
        assert payload["level"] == "INFO"
        assert payload["event"] == "lexflow.test"
        assert payload["msg"] == "hello"
        assert payload["request_id"] == "abc"
        assert "ts" in payload and payload["ts"].endswith("Z")

    def test_groups_extra_kwargs_under_extra_key(self) -> None:
        formatter = _JsonFormatter()
        record = _make_record(request_id=None, path="/x", duration_ms=12.5)
        payload = json.loads(formatter.format(record))
        assert payload["extra"] == {"path": "/x", "duration_ms": 12.5}

    def test_appends_exception_traceback_when_present(self) -> None:
        formatter = _JsonFormatter()
        try:
            raise ValueError("boom")
        except ValueError:
            import sys

            record = _make_record(exc_info=sys.exc_info(), request_id=None)
        payload = json.loads(formatter.format(record))
        assert "exc" in payload
        assert "ValueError: boom" in payload["exc"]


class TestConsoleFormatter:
    def test_appends_short_request_id_suffix(self) -> None:
        formatter = _ConsoleFormatter()
        record = _make_record(request_id="0123456789abcdef" * 2)
        line = formatter.format(record)
        assert "[req=01234567]" in line

    def test_no_suffix_when_request_id_is_none(self) -> None:
        formatter = _ConsoleFormatter()
        record = _make_record(request_id=None)
        assert "[req=" not in formatter.format(record)


# ─── End-to-end through the middleware ──────────────────────────────────


class TestRequestIdReachesLoggerInsideRequest:
    def test_access_log_record_carries_the_request_id(self, client: TestClient) -> None:
        """The access log line emitted by the middleware itself must carry
        the same request id we surface in the response header."""
        # Wire a capturing handler onto the access logger.
        buffer = io.StringIO()
        handler = logging.StreamHandler(buffer)
        handler.setFormatter(_JsonFormatter())
        handler.addFilter(RequestIdFilter())
        access_logger = logging.getLogger("lexflow.access")
        access_logger.addHandler(handler)
        try:
            inbound = "11112222333344445555666677778888"
            response = client.get("/api/v1/system/warmup", headers={"X-Request-Id": inbound})
        finally:
            access_logger.removeHandler(handler)
        assert response.status_code == 200
        # The handler captured at least one line; the last one is the
        # access log emitted by the middleware after the response.
        lines = [json.loads(line) for line in buffer.getvalue().strip().split("\n") if line]
        assert lines, "expected at least one log line"
        access = lines[-1]
        assert access["request_id"] == inbound
        assert access["extra"]["method"] == "GET"
        assert access["extra"]["path"] == "/api/v1/system/warmup"
        assert access["extra"]["status"] == 200
