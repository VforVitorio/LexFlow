"""Tests for the global graph endpoint (#146).

``GET /api/v1/graph`` returns the whole graph (no seed) with optional
metadata filters and an optional top-by-PageRank limit. Test fixture
reuses ``graph_from_fixture`` from ``test_graph_endpoints.py`` semantics —
small ``LegalGraph`` built from the sample law dir, injected via DI.
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
    registry = LawRegistry(sample_law_dir)
    registry.preload_all_metadata()
    graph = build_graph(registry)
    app.dependency_overrides[get_graph] = lambda: graph
    yield graph
    app.dependency_overrides.pop(get_graph, None)


class TestGlobalGraphShape:
    def test_returns_subgraph_response_shape(
        self,
        client: TestClient,
        graph_from_fixture: LegalGraph,
    ) -> None:
        response = client.get("/api/v1/graph")
        assert response.status_code == 200
        body = response.json()
        assert "nodes" in body
        assert "edges" in body
        assert "total_available" in body
        assert isinstance(body["nodes"], list)
        assert isinstance(body["edges"], list)

    def test_no_filters_returns_every_node(
        self,
        client: TestClient,
        graph_from_fixture: LegalGraph,
    ) -> None:
        body = client.get("/api/v1/graph").json()
        assert len(body["nodes"]) == graph_from_fixture.node_count()
        assert body["total_available"] == graph_from_fixture.node_count()

    def test_nodes_carry_pagerank_and_community(
        self,
        client: TestClient,
        graph_from_fixture: LegalGraph,
    ) -> None:
        # Same enrichment as the seeded subgraph endpoint.
        body = client.get("/api/v1/graph").json()
        for node in body["nodes"]:
            assert "pagerank" in node
            assert "community" in node


class TestGlobalGraphFilters:
    def test_rank_filter_keeps_only_matching(
        self,
        client: TestClient,
        graph_from_fixture: LegalGraph,
    ) -> None:
        body = client.get("/api/v1/graph", params={"rank": "ley_organica"}).json()
        # Every returned node was a ley_organica in the fixture — the
        # filter must NOT leak anything else through.
        ids = {n["id"] for n in body["nodes"]}
        for nid in ids:
            assert graph_from_fixture.graph.nodes[nid]["rank"] == "ley_organica"

    def test_filter_with_no_matches_returns_empty(
        self,
        client: TestClient,
        graph_from_fixture: LegalGraph,
    ) -> None:
        # ``orden`` is a valid rank but absent from the fixture.
        body = client.get("/api/v1/graph", params={"rank": "orden"}).json()
        assert body["nodes"] == []
        assert body["edges"] == []
        assert body["total_available"] == 0

    def test_scope_filter_uses_node_attribute(
        self,
        client: TestClient,
        graph_from_fixture: LegalGraph,
    ) -> None:
        # The fixture's national law lives in ``Scope.ESTATAL``; the
        # regional one lives in ``Scope.AUTONOMICO``. Filtering by one
        # must drop the other. ``Scope`` is a StrEnum with TitleCase
        # Spanish values, so the wire payload uses those literally.
        estatal = client.get("/api/v1/graph", params={"scope": "Estatal"}).json()
        autonomico = client.get("/api/v1/graph", params={"scope": "Autonómico"}).json()
        assert estatal["total_available"] + autonomico["total_available"] == graph_from_fixture.node_count()


class TestGlobalGraphLimit:
    def test_limit_truncates_to_top_n(
        self,
        client: TestClient,
        graph_from_fixture: LegalGraph,
    ) -> None:
        body = client.get("/api/v1/graph", params={"limit": 1}).json()
        assert len(body["nodes"]) == 1
        # total_available reflects the unfiltered/untruncated count.
        assert body["total_available"] == graph_from_fixture.node_count()

    def test_limit_above_node_count_is_a_noop(
        self,
        client: TestClient,
        graph_from_fixture: LegalGraph,
    ) -> None:
        body = client.get("/api/v1/graph", params={"limit": 999}).json()
        assert len(body["nodes"]) == graph_from_fixture.node_count()


class TestGlobalGraphEdges:
    def test_edges_only_between_selected_nodes(
        self,
        client: TestClient,
        graph_from_fixture: LegalGraph,
    ) -> None:
        body = client.get("/api/v1/graph").json()
        node_ids = {n["id"] for n in body["nodes"]}
        for edge in body["edges"]:
            assert edge["source"] in node_ids
            assert edge["target"] in node_ids
