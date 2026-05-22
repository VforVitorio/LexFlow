# Dashboards

Source: [`src/lexflow/dashboards/`](../../src/lexflow/dashboards/). Depends on
the `dashboards` extra (`plotly`).

The dashboards layer returns `plotly.graph_objects.Figure` instances. They
serialise to JSON with `fig.to_json()` and the frontend renders them with
`react-plotly.js`. Figures are **not** yet exposed over HTTP — the layer is
ready, the router is not wired (see [`backend/api-endpoints.md`](api-endpoints.md)
"Mismatches with the frontend mock contract").

## Analytics — [`dashboards/analytics.py`](../../src/lexflow/dashboards/analytics.py)

Each function takes a `LawRegistry` and returns a Plotly `Figure`.

| Function | Chart | What it shows |
|----------|-------|---------------|
| `reforms_by_year(registry)` | Bar | Number of laws per publication year |
| `rank_distribution(registry)` | Pie | Distribution by `LawRank` |
| `status_distribution(registry)` | Bar | Distribution by `LawStatus` |
| `jurisdiction_heatmap(registry)` | Bar (despite the name) | Laws per `Jurisdiction` (CCAA) |

> `jurisdiction_heatmap` is named for the eventual goal of a true heatmap
> (CCAA × rank, for example). The current implementation is a 1D bar chart.

All functions iterate the registry's `law_ids` and read metadata via
`get_metadata`. This is cheap once metadata is preloaded (see
`LawRegistry.preload_all_metadata`).

## Compliance — [`dashboards/compliance.py`](../../src/lexflow/dashboards/compliance.py)

```python
class ComplianceFilter(BaseModel):
    jurisdiction: str | None = None
    rank: LawRank | None = None
    status: LawStatus | None = None

def filter_laws(registry, f: ComplianceFilter) -> list[LawSummary]: ...
def compliance_timeline(registry, f: ComplianceFilter) -> go.Figure: ...
def export_csv(laws: list[LawSummary]) -> str: ...
```

`filter_laws` reuses the registry's `list_laws` with a single-page query
sized to the total count — this is intentional, the registry already
implements filtering. `compliance_timeline` plots a line chart of laws per
year on the filtered set. `export_csv` writes a fixed-schema CSV
(`identifier, title, rank, status, jurisdiction, publication_date`).

## Why no HTTP yet

Three options are on the table; the decision is open:

1. **`GET /api/v1/dashboards/{preset}` returning Plotly JSON.** Easiest;
   what the frontend mock contract assumes.
2. **Aggregated data endpoints + frontend-side chart construction.** More
   flexible; lets the UI design charts that backend code doesn't have to
   know about.
3. **Both.** A `?format=plotly|json` toggle.

Whatever is chosen, the figure builders here stay — they will be wrapped,
not replaced.

## Where things live

| You want to… | Edit |
|--------------|------|
| Add a new analytic chart | new function in `analytics.py`, accept `LawRegistry`, return `go.Figure` |
| Tweak a chart title/axis | the `fig.update_layout(...)` call inside the function |
| Add a compliance filter field | extend `ComplianceFilter` + propagate to `filter_laws` |
| Change CSV columns | `export_csv` (only field source of truth — keep in sync with `LawSummary`) |
