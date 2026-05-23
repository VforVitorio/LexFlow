# Observability

LexFlow's observability surface is intentionally small today and is documented
honestly. Anything below labelled "Plan" is not yet implemented.

## Today

### Logging

Every module uses the standard library `logging`:

```python
import logging
logger = logging.getLogger(__name__)
```

No global `logging.basicConfig` is configured by the application itself —
uvicorn sets the root logger when it starts the server. Effective level is
`info` (overridable through `LEXFLOW_LOG_LEVEL` in
[`docker-compose.yml`](../../docker-compose.yml)).

Format is the stdlib default: plain text, no JSON, no request id, no
structured fields. This is enough for local development and Docker logs,
not enough for aggregation.

### Health endpoint

```
GET /health  →  {"status": "ok", "version": <pyproject.toml version>}
```

Defined in [`src/lexflow/api/app.py`](../../src/lexflow/api/app.py) at the
root of the app (not under `/api/v1`). The Docker healthcheck in
[`docker-compose.yml`](../../docker-compose.yml) polls this endpoint every
30 s.

### Where logs go

`stdout` only. The host decides what to do with them:

- **Local dev:** terminal.
- **Docker:** `docker logs lexflow` or whatever the host log driver does
  (`json-file`, `journald`, ...).
- **Hosted (Loki, CloudWatch, Stackdriver, ...):** ship `stdout` to the
  sink of choice with the host's log agent. LexFlow does not push to any
  sink itself.

### Metrics and tracing

None today.

## Plan

### Structured logging + request id

Tracking: [#92](https://github.com/VforVitorio/LexFlow/issues/92).

- Switch to [`structlog`](https://www.structlog.org/) so every log line is a
  JSON object with stable keys.
- Add a `request_id` middleware: read `X-Request-Id` from the inbound
  request, generate a fresh ULID if absent, bind it to the structlog context,
  echo it on the response, and include it in every log record produced
  during the request.
- Bind useful per-request fields (`method`, `path`, `status`, `duration_ms`)
  on the access log.

Once that lands, the format examples in this page will be replaced with
real ones.

### Metrics

Pending. The likely shape is a `/metrics` Prometheus endpoint that surfaces:

- Per-route request count and latency histogram.
- Graph-cache hit/miss counters.
- legalize-es sync status (last commit, behind count, last run duration).

No issue number assigned yet.

### Tracing

Out of scope until the chat layer matures (MCP tool calls plus model calls
make for the first real distributed trace).

## What to log

Until structured logging lands, follow these rules in new code:

- `logger.info` for one-line events worth seeing in the terminal
  (start-up, sync run start/finish, cache rebuild).
- `logger.warning` for recoverable anomalies (missing optional field,
  fallback path taken).
- `logger.error` with `exc_info=True` only inside an `except` block.
- **Do not** log full request bodies, user prompts, or BOE document text —
  log identifiers and counts.
