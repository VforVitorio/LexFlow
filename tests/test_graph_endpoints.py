"""Tests for the graph router (issue #103).

Uses ``app.dependency_overrides[get_graph]`` (enabled by the DI refactor
in #101) to inject a small in-memory :class:`LegalGraph` built from the
sample law fixtures — no real submodule, no disk cache.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from lexflow.api.app import app
from lexflow.api.dependencies import get_graph
from lexflow.core.registry import LawRegistry
from lexflow.graph.builder import build_graph
from lexflow.graph.model import LegalGraph


@pytest.fixture()
def graph_from_fixture(sample_law_dir: Path) -> Iterator[LegalGraph]:
    """Build a real :class:`LegalGraph` from the sample law fixture and
    inject it as the FastAPI :func:`get_graph` dependency for the
    duration of the test.
    """
    registry = LawRegistry(sample_law_dir)
    registry.preload_all_metadata()
    graph = build_graph(registry)
    app.dependency_overrides[get_graph] = lambda: graph
    yield graph
    app.dependency_overrides.pop(get_graph, None)


class TestNeighbors:
    def test_returns_neighbours_payload(self, client: TestClient, graph_from_fixture: LegalGraph) -> None:
        # Pick any law_id in the fixture graph.
        law_id = next(iter(graph_from_fixture.graph.nodes))
        response = client.get(f"/api/v1/graph/neighbors/{law_id}")
        assert response.status_code == 200
        body = response.json()
        assert body["law_id"] == law_id
        assert isinstance(body["neighbors"], list)
        assert body["count"] == len(body["neighbors"])

    def test_unknown_law_returns_empty_neighbours(
        self, client: TestClient, graph_from_fixture: LegalGraph
    ) -> None:
        # The endpoint doesn't 404 on unknown ids — the graph layer
        # treats unknown nodes as having zero neighbours. Test the
        # documented contract.
        del graph_from_fixture
        response = client.get("/api/v1/graph/neighbors/UNKNOWN-ID")
        assert response.status_code == 200
        assert response.json()["count"] == 0


class TestSubgraph:
    def test_returns_nodes_and_edges(
        self, client: TestClient, graph_from_fixture: LegalGraph
    ) -> None:
        law_id = next(iter(graph_from_fixture.graph.nodes))
        response = client.get(f"/api/v1/graph/subgraph/{law_id}", params={"depth": 1})
        assert response.status_code == 200
        body = response.json()
        assert "nodes" in body
        assert "edges" in body
        # The seed node is always present in its own subgraph.
        assert any(n["id"] == law_id for n in body["nodes"])

    def test_404_for_unknown_seed(
        self, client: TestClient, graph_from_fixture: LegalGraph
    ) -> None:
        del graph_from_fixture
        response = client.get("/api/v1/graph/subgraph/MISSING-LAW")
        assert response.status_code == 404
        assert "not in graph" in response.json()["detail"]

    def test_rejects_invalid_depth(
        self, client: TestClient, graph_from_fixture: LegalGraph
    ) -> None:
        law_id = next(iter(graph_from_fixture.graph.nodes))
        response = client.get(f"/api/v1/graph/subgraph/{law_id}", params={"depth": 99})
        assert response.status_code == 422

    def test_nodes_carry_community_and_pagerank(
        self, client: TestClient, graph_from_fixture: LegalGraph
    ) -> None:
        """#143 — every node exposes a community id + a pagerank score,
        and the pageranks over the subgraph sum to ~1."""
        law_id = next(iter(graph_from_fixture.graph.nodes))
        body = client.get(f"/api/v1/graph/subgraph/{law_id}", params={"depth": 3}).json()
        assert body["nodes"], "subgraph should have at least the seed node"
        for node in body["nodes"]:
            assert "community" in node
            assert "pagerank" in node
            assert node["community"] is None or isinstance(node["community"], int)
            assert node["pagerank"] is None or isinstance(node["pagerank"], (int, float))
        ranks = [n["pagerank"] for n in body["nodes"] if n["pagerank"] is not None]
        if ranks:
            assert abs(sum(ranks) - 1.0) < 0.05  # rounding tolerance


class TestPath:
    def test_404_when_no_path(self, client: TestClient, graph_from_fixture: LegalGraph) -> None:
        # The sample fixture has two unrelated laws — any path between them
        # raises NetworkXNoPath, mapped to a 404 by the handler.
        del graph_from_fixture
        response = client.get(
            "/api/v1/graph/path",
            params={"from": "DOES-NOT-EXIST", "to": "ALSO-MISSING"},
        )
        assert response.status_code == 404


class TestStats:
    def test_returns_node_edge_density(
        self, client: TestClient, graph_from_fixture: LegalGraph
    ) -> None:
        response = client.get("/api/v1/graph/stats")
        assert response.status_code == 200
        body = response.json()
        assert body["node_count"] == graph_from_fixture.node_count()
        assert body["edge_count"] == graph_from_fixture.edge_count()
        assert 0.0 <= body["density"] <= 1.0
        assert body["weakly_connected_components"] >= 1


class TestTop:
    def test_returns_capped_pagerank_list(
        self, client: TestClient, graph_from_fixture: LegalGraph
    ) -> None:
        del graph_from_fixture
        response = client.get("/api/v1/graph/top", params={"limit": 3, "metric": "pagerank"})
        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert len(body) <= 3
        for item in body:
            assert {"law_id", "score"}.issubset(item.keys())

    def test_rejects_unknown_metric(
        self, client: TestClient, graph_from_fixture: LegalGraph
    ) -> None:
        del graph_from_fixture
        response = client.get("/api/v1/graph/top", params={"metric": "degree"})
        assert response.status_code == 422
