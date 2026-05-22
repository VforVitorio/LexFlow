# Knowledge graph

Source: [`src/lexflow/graph/`](../../src/lexflow/graph/). Backed by
[NetworkX](https://networkx.org/) `DiGraph`.

## Model — [`graph/model.py`](../../src/lexflow/graph/model.py)

```python
class LegalGraph:
    def add_law(self, metadata: LawMetadata) -> None: ...
    def add_reference(self, source_id, target_id, *, source_article=None, reference_text="") -> None: ...
    def get_neighbors(self, law_id: str) -> list[str]: ...        # successors (outgoing references)
    def get_subgraph(self, law_id: str, depth: int = 1) -> nx.DiGraph: ...  # both directions
    def node_count(self) -> int
    def edge_count(self) -> int
    @property
    def graph(self) -> nx.DiGraph                                # escape hatch for algorithm code
```

Nodes carry `title`, `rank`, `status`, `jurisdiction`, `publication_date` as
attributes (string-serialised). Edges carry `source_article`, `reference_text`.

`add_reference` silently ignores edges whose endpoints are not in the graph
yet — the builder relies on this for forward references.

## Builder — [`graph/builder.py`](../../src/lexflow/graph/builder.py)

```python
def build_graph(registry: LawRegistry) -> LegalGraph:
    # Pass 1: add every law as a node using fast metadata-only parse.
    # Pass 2: walk every law fully, add edges for resolvable references.
```

Pass 1 is cheap (frontmatter only). Pass 2 is the expensive part — it
triggers full parses for every law. In the request lifecycle this happens
lazily on the first `/graph/*` call via the singleton in
[`routers/graph.py`](../../src/lexflow/api/routers/graph.py).

## Algorithms — [`graph/algorithms.py`](../../src/lexflow/graph/algorithms.py)

| Function | Returns |
|----------|---------|
| `pagerank(graph, alpha=0.85)` | `dict[str, float]` |
| `top_laws(graph, n=10)` | `list[tuple[str, float]]` sorted desc |
| `shortest_path(graph, source, target)` | `list[str]`; raises `nx.NetworkXNoPath` |
| `community_detection(graph)` | `dict[str, int]` (greedy modularity, undirected projection) |

The router catches `NetworkXNoPath` and `NodeNotFound` from `shortest_path`
and returns 404.

## Cache — [`graph/cache.py`](../../src/lexflow/graph/cache.py)

The graph build over the full corpus is slow. The cache writes the graph as
JSON (NetworkX `node_link_data`) to `data/graph_cache.json`, keyed by the
HEAD commit of the `data/legalize-es` submodule.

```python
def load_or_build(registry: LawRegistry, data_path: Path) -> LegalGraph:
    # load cache; if hash matches → return
    # else → build, save, return
```

`CACHE_VERSION = "1"` — bump this constant when the serialised shape
changes (e.g. new edge attributes). Old caches with a mismatched version are
discarded on load.

`load_or_build` is **not** wired into `routers/graph.py` yet — the router
still rebuilds in-memory on first request. Switching is a one-line change;
held off until the build-time / cache-correctness trade-off is decided. See
the graph epic for the open ticket.

## Where things live

| You want to… | Edit |
|--------------|------|
| Add a new node attribute | `LegalGraph.add_law` + the metadata_parser |
| Add a new edge attribute | `LegalGraph.add_reference` + the parser that emits `Reference` |
| Add a new algorithm endpoint | `algorithms.py` + `routers/graph.py` |
| Change cache schema | `cache.py:CACHE_VERSION` + the serialiser |
| Persist the cache automatically | wire `load_or_build` into `get_graph_dep` in `routers/graph.py` |
