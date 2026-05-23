# Core domain models

Source: [`src/lexflow/core/models.py`](../../src/lexflow/core/models.py),
[`enums.py`](../../src/lexflow/core/enums.py),
[`schemas.py`](../../src/lexflow/core/schemas.py). All Pydantic v2,
`ConfigDict(frozen=True)`.

## Reference

```python
class Reference(BaseModel):
    target_id: str | None          # BOE id of the referenced law if resolvable
    target_text: str               # raw text as it appears in the source
    source_article: str | None     # article number where the reference lives
```

A cross-reference, the unit that becomes a graph edge.

## Article

```python
class Article(BaseModel):
    number: str                    # normalised: '1', '2 bis' (no 'Artículo' prefix, no trailing dot)
    title: str | None
    text: str
    references: list[Reference]
```

A `field_validator` strips the literal `Artículo`/`Articulo` prefix and a
trailing dot so lookups in [`articles.py`](../../src/lexflow/api/routers/articles.py)
are consistent.

## Section

```python
class Section(BaseModel):
    level: int                     # 1=doc, 2=Título, 3=Capítulo, 4=Sección, 5=Artículo
    heading: str
    articles: list[Article]
    subsections: list[Section]
```

Recursive — sections nest to model the heading hierarchy of the original
Markdown.

## LawMetadata

```python
class LawMetadata(BaseModel):
    identifier: str                # BOE id, e.g. 'BOE-A-1978-31229'
    title: str
    rank: LawRank                  # default LawRank.OTRO
    status: LawStatus              # default LawStatus.IN_FORCE
    publication_date: date | None
    enactment_date: date | None
    last_updated: date | None
    source: str | None             # URL to BOE
    department: str | None
    official_journal: str | None
    journal_issue: str | None
    consolidation_status: ConsolidationStatus
    scope: Scope                   # default Scope.ESTATAL
    jurisdiction: Jurisdiction | None
    country: str = "es"
```

Parsed from the YAML frontmatter of each law file. The fast parser
([`metadata_parser.py`](../../src/lexflow/core/metadata_parser.py)) reads
only the frontmatter — useful when paginating the list endpoint without
parsing full bodies.

## Law

```python
class Law(BaseModel):
    metadata: LawMetadata
    sections: list[Section]
    articles: list[Article]        # flat for quick lookup
    references: list[Reference]    # all references across the law
    raw_text: str                  # markdown body without frontmatter
    file_path: str                 # relative path to the .md file
    # computed
    article_count: int
```

The full parsed unit. `articles` is a flat shortcut; the canonical hierarchy
still lives in `sections`.

## LawVersion

```python
class LawVersion(BaseModel):
    commit_hash: str
    date: date
    message: str
    norma: str | None              # 'Norma:' trailer
    disposicion: str | None        # 'Disposición:' trailer
    articulos_afectados: list[str] # 'Artículos afectados:' trailer, split on , or ;
```

Derived from `git log --follow` over a law file by
[`git_history.GitHistoryReader.get_file_log`](../../src/lexflow/core/git_history.py).
Newest first.

## LawDiff

```python
class DiffStats(BaseModel):
    additions: int
    deletions: int
    changed_articles: list[str]    # detected via 'Artículo N' regex on diff hunks

class LawDiff(BaseModel):
    law_id: str
    from_commit: str
    to_commit: str
    from_date: date | None
    to_date: date | None
    diff_text: str                 # unified diff
    stats: DiffStats
```

## Enums ([`enums.py`](../../src/lexflow/core/enums.py))

All `StrEnum` so the string value is the wire form.

| Enum | Values |
|------|--------|
| `LawRank` | `ley`, `ley_organica`, `real_decreto`, `real_decreto_ley`, `real_decreto_legislativo`, `decreto_legislativo`, `orden`, `otro` |
| `LawStatus` | `in_force`, `repealed`, `partially_repealed`, `pending` |
| `ConsolidationStatus` | `Finalizado`, `En curso`, `unknown` |
| `Scope` | `Estatal`, `Autonómico`, `Local` |
| `Jurisdiction` | `es` + 18 CCAA codes (`es-an`, `es-ar`, …, `es-vc`) plus `es-ce`, `es-ml` |

## Response wrappers ([`schemas.py`](../../src/lexflow/core/schemas.py))

These are the shapes the API actually serialises — the domain models above
are internal.

| Wrapper | Used by |
|---------|---------|
| `PaginatedResponse[T]` | `/laws`, `/laws/{id}/articles` |
| `LawSummary` | items of `/laws` list |
| `LawDetail` | `/laws/{id}` |
| `ArticleResponse` | `/laws/{id}/articles/{num}` |
| `SearchResult`, `SearchResponse` | `/search` |
| `GraphNeighborsResponse`, `GraphSubgraphResponse`, `GraphNodeData`, `GraphEdgeData`, `GraphStatsResponse`, `GraphTopItem` | `/graph/*` |
| `ErrorResponse` | (declared but not currently emitted; the live error format is in `api/error_handlers.py`) |

`PaginatedResponse` derives `total_pages`, `has_next`, `has_previous`
through computed fields.

## Where to change…

| Field rename or new field | `models.py` + `metadata_parser.py` + `parser.py` |
| New filter on `/laws` | add to `LawRegistry.list_laws`, propagate in `routers/laws.py` |
| New enum value | `enums.py` (string value must match what `legalize-es` emits) |
