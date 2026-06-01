# Changelog

## [0.25.0](https://github.com/VforVitorio/LexFlow/compare/v0.24.0...v0.25.0) (2026-06-01)


### Features

* **api:** GET /system/profile for hardware + local LLM detection (closes [#117](https://github.com/VforVitorio/LexFlow/issues/117)) ([56e5919](https://github.com/VforVitorio/LexFlow/commit/56e59190bf85d154e1c00dcfa40b98d359b489a0))
* **api:** GET /system/profile for hardware + local LLM detection (closes [#117](https://github.com/VforVitorio/LexFlow/issues/117)) ([2cfae89](https://github.com/VforVitorio/LexFlow/commit/2cfae8947a70c90914e4ba5bcdb5ba2d446988e9))
* **onboarding:** 3-step model wizard with hardware-aware tier recommendation (closes [#118](https://github.com/VforVitorio/LexFlow/issues/118)) ([1ce8b2a](https://github.com/VforVitorio/LexFlow/commit/1ce8b2a3684a813dc3be48d3e041bc687263f21a))
* **onboarding:** 3-step model wizard with hardware-aware tier recommendation (closes [#118](https://github.com/VforVitorio/LexFlow/issues/118)) ([424435c](https://github.com/VforVitorio/LexFlow/commit/424435c99c5a88d09407810d5f18c24b778e27f1))


### Refactoring

* **backend:** polish pack — commit hash validation, LegalGraph encapsulation, Anthropic IDs, parser warning ([#104](https://github.com/VforVitorio/LexFlow/issues/104)) ([457ff32](https://github.com/VforVitorio/LexFlow/commit/457ff32da55b9f52406a73d4af529dcc081710a7))
* **backend:** polish pack — fully drains [#104](https://github.com/VforVitorio/LexFlow/issues/104) (8 items) ([f5459cf](https://github.com/VforVitorio/LexFlow/commit/f5459cf5746c4f6ee4b003229e6f1b8a35b23234))
* **backend:** polish pack 2 — [#8](https://github.com/VforVitorio/LexFlow/issues/8) Annotated DI, [#10](https://github.com/VforVitorio/LexFlow/issues/10) services.find_article, [#13](https://github.com/VforVitorio/LexFlow/issues/13) dashboards summary table ([#104](https://github.com/VforVitorio/LexFlow/issues/104)) ([8b6ec7d](https://github.com/VforVitorio/LexFlow/commit/8b6ec7df83861ad98dbdf11146e5e72f166349f2))

## [0.24.0](https://github.com/VforVitorio/LexFlow/compare/v0.23.0...v0.24.0) (2026-06-01)


### Features

* **brand:** favicons, apple-touch-icon, og:image + meta tags (closes [#77](https://github.com/VforVitorio/LexFlow/issues/77)) ([bbdd4c5](https://github.com/VforVitorio/LexFlow/commit/bbdd4c58fe536d9c017443f71e06621b2599bedc))
* **brand:** favicons, apple-touch-icon, og:image + meta tags (closes [#77](https://github.com/VforVitorio/LexFlow/issues/77)) ([141d662](https://github.com/VforVitorio/LexFlow/commit/141d662adef08c56664a5fb302d563ba4e8585ce))


### Bug Fixes

* **frontend:** refresh package-lock for vitest devDeps so npm ci passes ([ce30e05](https://github.com/VforVitorio/LexFlow/commit/ce30e0527739d3cc185aba23100735f704436113))
* **frontend:** regenerate lockfile with optional emnapi + vitest esbuild ([1bd6659](https://github.com/VforVitorio/LexFlow/commit/1bd665952f4c2fee2e797e99a588d5e4fe73454b))


### Refactoring

* **frontend:** split api.ts into per-resource modules + extract ExplorerPage FilterRail (closes [#202](https://github.com/VforVitorio/LexFlow/issues/202)) ([0e71fb7](https://github.com/VforVitorio/LexFlow/commit/0e71fb7344391c7f279ce8c03ee05445ee407265))
* **frontend:** split api.ts into per-resource modules + extract ExplorerPage FilterRail (closes [#202](https://github.com/VforVitorio/LexFlow/issues/202)) ([3d566ad](https://github.com/VforVitorio/LexFlow/commit/3d566ad0fb954a937e24f6605a2aef71cc4a2e28))

## [0.23.0](https://github.com/VforVitorio/LexFlow/compare/v0.22.0...v0.23.0) (2026-05-31)


### Features

* **ui:** Settings → Personalización with name editor + language switcher (closes [#115](https://github.com/VforVitorio/LexFlow/issues/115), [#133](https://github.com/VforVitorio/LexFlow/issues/133)) ([af6b4dc](https://github.com/VforVitorio/LexFlow/commit/af6b4dc47cd44c594fbcfb2df59bbb03340954a1))
* **ui:** Settings → Personalización with name editor + language switcher (closes [#115](https://github.com/VforVitorio/LexFlow/issues/115), [#133](https://github.com/VforVitorio/LexFlow/issues/133)) ([eab26a8](https://github.com/VforVitorio/LexFlow/commit/eab26a81c023aa8239a56bdfc2c561ccc9706bc2))


### Bug Fixes

* **security:** sanitise exception in chat-stream log line (CodeQL [#4](https://github.com/VforVitorio/LexFlow/issues/4)) ([8bdc496](https://github.com/VforVitorio/LexFlow/commit/8bdc496a8afecad7ab3924b0d38a962dcb9e0682))
* **security:** sanitise exception in chat-stream log line (CodeQL [#4](https://github.com/VforVitorio/LexFlow/issues/4)) + dismiss [#2](https://github.com/VforVitorio/LexFlow/issues/2) as FP ([8a5f56e](https://github.com/VforVitorio/LexFlow/commit/8a5f56eaf5713e1a5cdf9e56101260c0b3f820d3))
* **security:** switch %r format spec to explicit repr() for CodeQL recognition ([30696ba](https://github.com/VforVitorio/LexFlow/commit/30696ba30ba96968ff3d14561e977e2b4ad80fc1))

## [0.22.0](https://github.com/VforVitorio/LexFlow/compare/v0.21.0...v0.22.0) (2026-05-31)


### Features

* **ui:** randomised welcome messages pool with no-repeat guard (closes [#248](https://github.com/VforVitorio/LexFlow/issues/248)) ([cadc55e](https://github.com/VforVitorio/LexFlow/commit/cadc55e7660d9d1f13b323c5ce35b49aa9655f8d))


### Bug Fixes

* **security:** close 3 CodeQL alerts (regex anchor + stack-trace exposure + log injection) ([49c3b2f](https://github.com/VforVitorio/LexFlow/commit/49c3b2fa7bb689be32e580870db3f1718237f79f))

## [0.21.0](https://github.com/VforVitorio/LexFlow/compare/v0.20.1...v0.21.0) (2026-05-31)


### Features

* **ci:** security hardening pack — CodeQL + OSV + gitleaks + pip-audit + npm in Dependabot ([#252](https://github.com/VforVitorio/LexFlow/issues/252)) ([e36b6cc](https://github.com/VforVitorio/LexFlow/commit/e36b6cc78e7a6addb93b202c550aba3d72f17a8f))
* **ci:** security hardening pack — CodeQL + OSV + gitleaks + pip-audit + npm in Dependabot (closes [#252](https://github.com/VforVitorio/LexFlow/issues/252)) ([edb0f6b](https://github.com/VforVitorio/LexFlow/commit/edb0f6b3f4a1fda4bd6e344372a2c6c57a3e7175))
* **ui:** GraphPage seed-miss fallback + ChatPage empty-rail hint (Sprint 2) ([79c36a0](https://github.com/VforVitorio/LexFlow/commit/79c36a0bd7831ed0b25e28cd23cd12924b40cdd6))
* **ui:** GraphPage seed-miss fallback + ChatPage empty-rail hint (Sprint 2) ([7ba1e7b](https://github.com/VforVitorio/LexFlow/commit/7ba1e7b225cce4f228deb7550c9b92f24b52f00a))
* **ui:** shape-matched loading skeletons for Explorer + LawDetail + Dashboard (Sprint 2) ([12d1c85](https://github.com/VforVitorio/LexFlow/commit/12d1c852f80da069c923fc4507ea2b67644ae10b))
* **ui:** shape-matched loading skeletons for Explorer + LawDetail + Dashboard (Sprint 2) ([978d11c](https://github.com/VforVitorio/LexFlow/commit/978d11ce1aee4ff53150f1b86c242f4d5a79f2b0))

## [0.20.1](https://github.com/VforVitorio/LexFlow/compare/v0.20.0...v0.20.1) (2026-05-31)


### Bug Fixes

* **test:** correct Agent_Sudo interop install command (agent-sudo → agent-sudo-mcp) ([9e4f653](https://github.com/VforVitorio/LexFlow/commit/9e4f65368ffe5b5750c892d1c66a234107782396))

## [0.20.0](https://github.com/VforVitorio/LexFlow/compare/v0.19.0...v0.20.0) (2026-05-31)


### Features

* **ci:** add frontend-build to required branch-protection contexts ([7043ff3](https://github.com/VforVitorio/LexFlow/commit/7043ff368e16bc87ec410ec05c4dad9a5872c6e6))
* **frontend:** HomePage real corpus feed + dynamic greeting (drop hardcoded Laura + mock changes) ([2e68644](https://github.com/VforVitorio/LexFlow/commit/2e68644f07c6b7280fb733e3cd354a572bc3f615))
* **frontend:** replace HomePage mock data with real corpus feed + dynamic greeting ([dba58fb](https://github.com/VforVitorio/LexFlow/commit/dba58fb76a179937b6565b1cb4d44bf088dd1d8b))
* **frontend:** tegaki handwritten welcome + name prompt (closes [#229](https://github.com/VforVitorio/LexFlow/issues/229)) ([fd3cccc](https://github.com/VforVitorio/LexFlow/commit/fd3cccc212e14624530b4cf939de1bdfb944da63))
* **frontend:** tegaki handwritten welcome + name prompt (closes [#229](https://github.com/VforVitorio/LexFlow/issues/229)) ([e514a0a](https://github.com/VforVitorio/LexFlow/commit/e514a0a03aec1e120a8cbd2f2d2caf0bc15d7f27))

## [0.19.0](https://github.com/VforVitorio/LexFlow/compare/v0.18.0...v0.19.0) (2026-05-30)


### Features

* **api:** serve React SPA from FastAPI in production single-process mode ([aaf57fd](https://github.com/VforVitorio/LexFlow/commit/aaf57fdd5787171190f357c65e8c1a707f403a2d))
* **api:** serve React SPA from FastAPI in production single-process mode ([#66](https://github.com/VforVitorio/LexFlow/issues/66)) ([104affc](https://github.com/VforVitorio/LexFlow/commit/104affc441a31794530566222b7d035b31d0c623))
* **frontend:** generate OpenAPI TS types + decide snake/camelCase mapping ([b91ef0d](https://github.com/VforVitorio/LexFlow/commit/b91ef0de6cdb40f594a4ba955be0435d024e2abb))
* **frontend:** generate OpenAPI TS types + decide snake/camelCase mapping ([#65](https://github.com/VforVitorio/LexFlow/issues/65), [#98](https://github.com/VforVitorio/LexFlow/issues/98)) ([a10128b](https://github.com/VforVitorio/LexFlow/commit/a10128b75f2f3acba41bcf85567f57f583f04127))

## [0.18.0](https://github.com/VforVitorio/LexFlow/compare/v0.17.0...v0.18.0) (2026-05-30)


### Features

* **api+frontend:** what's-new corpus diff during splash warm-up ([#228](https://github.com/VforVitorio/LexFlow/issues/228)) ([52f7a02](https://github.com/VforVitorio/LexFlow/commit/52f7a020008a1e92fc31e25362c1c0bfc8390f0d))
* **api+frontend:** what's-new corpus diff during splash warm-up ([#228](https://github.com/VforVitorio/LexFlow/issues/228)) ([7d58bd0](https://github.com/VforVitorio/LexFlow/commit/7d58bd0887f0b8d3565dcd3bff9fdacdb0675a79))

## [0.17.0](https://github.com/VforVitorio/LexFlow/compare/v0.16.0...v0.17.0) (2026-05-30)


### Features

* **frontend:** SplashGate with 3-segment warm-up progress bar ([#227](https://github.com/VforVitorio/LexFlow/issues/227)) ([40afaa3](https://github.com/VforVitorio/LexFlow/commit/40afaa3804633dee1aa9141d84aa5ec994760430))
* **frontend:** SplashGate with 3-segment warm-up progress bar ([#227](https://github.com/VforVitorio/LexFlow/issues/227)) ([99f6290](https://github.com/VforVitorio/LexFlow/commit/99f6290233a03a46d2099d2438096d2b9c356c0f))


### Documentation

* record assumed-API / broken-commit lesson ([#230](https://github.com/VforVitorio/LexFlow/issues/230) post-mortem) ([2912437](https://github.com/VforVitorio/LexFlow/commit/2912437c660b366777ec720c187ff4f33de7015f))

## [0.16.0](https://github.com/VforVitorio/LexFlow/compare/v0.15.0...v0.16.0) (2026-05-30)


### Features

* **api:** incremental cache updates from legalize-es deltas ([#230](https://github.com/VforVitorio/LexFlow/issues/230)) ([38e0c5e](https://github.com/VforVitorio/LexFlow/commit/38e0c5e08a10fb14d953a62942bdf25e05773598))
* **api:** incremental cache updates from legalize-es deltas ([#230](https://github.com/VforVitorio/LexFlow/issues/230)) ([476a4af](https://github.com/VforVitorio/LexFlow/commit/476a4aff40f3f81b367aaa8569680a72a7acc5cf))

## [0.15.0](https://github.com/VforVitorio/LexFlow/compare/v0.14.0...v0.15.0) (2026-05-30)


### Features

* **api:** persist metadata + search caches to disk for warm starts ([#231](https://github.com/VforVitorio/LexFlow/issues/231)) ([e1fa891](https://github.com/VforVitorio/LexFlow/commit/e1fa8912303f8982e7e54a550acc9204fe0c9db6))
* **api:** persist metadata + search caches to disk for warm starts ([#231](https://github.com/VforVitorio/LexFlow/issues/231)) ([5c61221](https://github.com/VforVitorio/LexFlow/commit/5c61221f01b433e4a50f2ce1839f75f356826110))


### Documentation

* mark workflow trunk-based (retire dev branch) ([ac71968](https://github.com/VforVitorio/LexFlow/commit/ac71968255ab571add72dd82f6e93e5549cb2aa0))

## [0.14.0](https://github.com/VforVitorio/LexFlow/compare/v0.13.0...v0.14.0) (2026-05-29)


### Features

* **api:** three-tier startup warm-up + /system/warmup + skeleton loaders ([#222](https://github.com/VforVitorio/LexFlow/issues/222) part 1) ([8c413a5](https://github.com/VforVitorio/LexFlow/commit/8c413a54b3d5ca5c6b817c54236d89e9c59dae89))
* **api:** three-tier startup warm-up so cold launches stop surprising users ([#222](https://github.com/VforVitorio/LexFlow/issues/222) part 1) ([6ebec87](https://github.com/VforVitorio/LexFlow/commit/6ebec87650118e7c1c796b5ecd57611b357a1333))
* **ui:** Opera Air glass language on floating surfaces ([2bdc612](https://github.com/VforVitorio/LexFlow/commit/2bdc61279bf08b7c349f5ac167269424b2b6ee92))
* **ui:** Opera Air glass language on floating surfaces (graph overlays, palette, mobile sheet) ([751d2c4](https://github.com/VforVitorio/LexFlow/commit/751d2c4eb2ab9828b5afa2bd5544a469e5c65e0d))


### Bug Fixes

* **graph:** dynamic seed from /graph/top instead of hardcoded CE-1978 (closes [#221](https://github.com/VforVitorio/LexFlow/issues/221)) ([45b83e8](https://github.com/VforVitorio/LexFlow/commit/45b83e85f07f16115765a3fb4adee4fb152306b8))
* **graph:** seed GraphPage from /graph/top instead of hardcoded "CE-1978" (closes [#221](https://github.com/VforVitorio/LexFlow/issues/221)) ([ae2d934](https://github.com/VforVitorio/LexFlow/commit/ae2d9345d7c36afd39dbb7facb20f4458b3e584c))

## [0.13.0](https://github.com/VforVitorio/LexFlow/compare/v0.12.0...v0.13.0) (2026-05-29)


### Features

* **mcp-audit:** emit hash-chained audit log for every MCP tool call ([#124](https://github.com/VforVitorio/LexFlow/issues/124) Phase 1) ([6ccf10b](https://github.com/VforVitorio/LexFlow/commit/6ccf10b0e102bd2f386ab9163215c841ff690b67))
* **mcp-audit:** hash-chained audit log for MCP tool calls ([#124](https://github.com/VforVitorio/LexFlow/issues/124) Phase 1) ([bb6c7c5](https://github.com/VforVitorio/LexFlow/commit/bb6c7c54492add06871071527c8133735ef2258c))

## [0.12.0](https://github.com/VforVitorio/LexFlow/compare/v0.11.0...v0.12.0) (2026-05-28)


### Features

* **search:** match offsets for query highlighting in the UI ([ac9b0d9](https://github.com/VforVitorio/LexFlow/commit/ac9b0d98b4b9800d6d87d56db048e7aa54feab72))


### Bug Fixes

* **chat:** narrow Ollama exception handler to SDK error surface ([9b47dae](https://github.com/VforVitorio/LexFlow/commit/9b47dae1a49a30ada7b985591a726e42e51e4176))

## [0.11.0](https://github.com/VforVitorio/LexFlow/compare/v0.10.0...v0.11.0) (2026-05-27)


### Features

* **frontend:** mobile bottom-tab navigation (closes [#89](https://github.com/VforVitorio/LexFlow/issues/89)) ([33a64bc](https://github.com/VforVitorio/LexFlow/commit/33a64bc9eb19abeeee4f246eb0f11a1ea6605536))

## [0.10.0](https://github.com/VforVitorio/LexFlow/compare/v0.9.0...v0.10.0) (2026-05-27)


### Features

* **api:** /api/v1/tags vocabulary + parser tag extraction ([#145](https://github.com/VforVitorio/LexFlow/issues/145)) ([79beaa8](https://github.com/VforVitorio/LexFlow/commit/79beaa8397a12c05ea26c080ae5e10a044260f74))
* **api:** /api/v1/tags vocabulary + parser tag extraction (closes [#145](https://github.com/VforVitorio/LexFlow/issues/145)) ([46d7099](https://github.com/VforVitorio/LexFlow/commit/46d7099f02b36cf19840ae9fd280539be03fd496))
* **graph:** enrich /subgraph with per-node community + pagerank ([#143](https://github.com/VforVitorio/LexFlow/issues/143)) ([a87e846](https://github.com/VforVitorio/LexFlow/commit/a87e8464158bf9736c64540851c4c7f578deba26))
* **graph:** enrich /subgraph with per-node community + pagerank (closes [#143](https://github.com/VforVitorio/LexFlow/issues/143)) ([555ec69](https://github.com/VforVitorio/LexFlow/commit/555ec69b8fed6aa880eef3e5936182bd9884a59f))


### Refactoring

* **api:** nest search under /laws/search, keep /search as deprecated alias ([#102](https://github.com/VforVitorio/LexFlow/issues/102)) ([8a332b9](https://github.com/VforVitorio/LexFlow/commit/8a332b9379a6a60d0bf745c5f4d09e1ed2b25cbb))
* **api:** nest search under /laws/search, keep /search as deprecated alias (closes [#102](https://github.com/VforVitorio/LexFlow/issues/102)) ([2da535d](https://github.com/VforVitorio/LexFlow/commit/2da535d92265f985bbb663d082d89b56b0713134))

## [0.9.0](https://github.com/VforVitorio/LexFlow/compare/v0.8.1...v0.9.0) (2026-05-26)


### Features

* **frontend:** toast system + global ErrorBoundary (closes [#88](https://github.com/VforVitorio/LexFlow/issues/88)) ([2166419](https://github.com/VforVitorio/LexFlow/commit/2166419ab2ad1da3ef1a47bd72102953baf6f64a))
* **frontend:** toast system + global ErrorBoundary surfacing FastAPI {detail} ([c49bbc1](https://github.com/VforVitorio/LexFlow/commit/c49bbc102c8d56caff6d12e6c8eb755f0ae89009))


### Refactoring

* **api:** consolidate 3 graph singletons into one DI provider ([854c6ef](https://github.com/VforVitorio/LexFlow/commit/854c6ef76f0b38cb5152cac362e5abc8bfdb75b5))
* **api:** consolidate 3 graph singletons into one DI provider (closes [#101](https://github.com/VforVitorio/LexFlow/issues/101)) ([93e16fb](https://github.com/VforVitorio/LexFlow/commit/93e16fbe2f8b30b572e6823171aa45369c290840))

## [0.8.1](https://github.com/VforVitorio/LexFlow/compare/v0.8.0...v0.8.1) (2026-05-25)


### Refactoring

* clean-code audit pass — dedup providers, narrow exceptions, share graph palette ([b3c1099](https://github.com/VforVitorio/LexFlow/commit/b3c10994fd950ce20b5ef3a7bc6ddcf3e88982fa))
* clean-code audit pass — dedup providers, narrow exceptions, share graph palette ([4c4f486](https://github.com/VforVitorio/LexFlow/commit/4c4f4866785248623b01576be57f486c0dd62d09))

## [0.8.0](https://github.com/VforVitorio/LexFlow/compare/v0.7.0...v0.8.0) (2026-05-24)


### Features

* **api:** /api/v1/sync/status + /sync/run for legalize-es ([1dcf79d](https://github.com/VforVitorio/LexFlow/commit/1dcf79ddeec7a4001a8fab92e594b4f6ec20dbfd))
* **api:** /api/v1/sync/status + /sync/run for legalize-es (closes [#86](https://github.com/VforVitorio/LexFlow/issues/86)) ([b95c24c](https://github.com/VforVitorio/LexFlow/commit/b95c24cdf62c4e0ee40e918c0bdd89b89cdbf466))
* **api:** GET /api/v1/dashboards/{preset} + wire frontend ([710ac4b](https://github.com/VforVitorio/LexFlow/commit/710ac4befdb3b2f193df228740a6920d055cec9c))
* **api:** GET /api/v1/dashboards/{preset} + wire frontend (closes [#85](https://github.com/VforVitorio/LexFlow/issues/85)) ([7ccfb33](https://github.com/VforVitorio/LexFlow/commit/7ccfb3335d5ec932bc8cb9bd8f48a556eadff1c6))
* **api:** SSE chat streaming endpoint with persistence ([8d4fc27](https://github.com/VforVitorio/LexFlow/commit/8d4fc27b39ec896b72393d1398e787759b0ca3a4))
* **api:** SSE chat streaming endpoint with persistence (closes [#84](https://github.com/VforVitorio/LexFlow/issues/84)) ([6cf06f3](https://github.com/VforVitorio/LexFlow/commit/6cf06f388b5a89d89061cf5444ce920dbe3e33e9))
* **frontend:** Obsidian-style graph canvas via @xyflow/react ([ed56281](https://github.com/VforVitorio/LexFlow/commit/ed56281f1ed658a03ac4d6db32dad291945de08c))
* **frontend:** Obsidian-style graph canvas via @xyflow/react (closes [#87](https://github.com/VforVitorio/LexFlow/issues/87)) ([d36c612](https://github.com/VforVitorio/LexFlow/commit/d36c612ef818ad205f804be20f31a4e49ca90ffd))

## [0.7.0](https://github.com/VforVitorio/LexFlow/compare/v0.6.0...v0.7.0) (2026-05-24)


### Features

* **api:** chat thread persistence — SQLite + CRUD endpoints ([1d71c0f](https://github.com/VforVitorio/LexFlow/commit/1d71c0ffbb99d5c8531863ebfb446f49d60f696d))
* **api:** chat thread persistence — SQLite + CRUD endpoints (closes [#83](https://github.com/VforVitorio/LexFlow/issues/83)) ([d555eb1](https://github.com/VforVitorio/LexFlow/commit/d555eb1f944fefe70ede8ec4fdca6f33dbe53187))

## [0.6.0](https://github.com/VforVitorio/LexFlow/compare/v0.5.1...v0.6.0) (2026-05-24)


### Features

* **api:** GET /api/v1/models — list chat providers + their models (closes [#82](https://github.com/VforVitorio/LexFlow/issues/82)) ([6b77a5d](https://github.com/VforVitorio/LexFlow/commit/6b77a5da1dc6f166e7f91ac8f5f78920f509c8f6))
* **api:** GET /api/v1/models — list chat providers and their models ([4ab7172](https://github.com/VforVitorio/LexFlow/commit/4ab7172bcf64fbfc05288471043e12dc15b3d83b))
* **frontend:** wire api.ts graph endpoints — neighbors/path/top/stats (closes [#81](https://github.com/VforVitorio/LexFlow/issues/81)) ([9202855](https://github.com/VforVitorio/LexFlow/commit/92028555a0ed3dd68cde6481c03bb598c757f75c))
* **frontend:** wire api.ts to /api/v1/search + /api/v1/models (closes [#80](https://github.com/VforVitorio/LexFlow/issues/80)) ([b6cbe80](https://github.com/VforVitorio/LexFlow/commit/b6cbe80601a1b9f8d90a502f9c7a0c29d295beb0))
* **frontend:** wire api.ts to /api/v1/search and /api/v1/models ([6c36248](https://github.com/VforVitorio/LexFlow/commit/6c362487939d9b5db7da403d44424223ca510c6e))
* **frontend:** wire api.ts to /graph/neighbors, /path, /top, /stats ([5768106](https://github.com/VforVitorio/LexFlow/commit/576810662b34ff3cedd13ebf9c5f66d9f4224185))
* **landing:** "Qué es esto" + DevContrib banner + chat typewriter + persona icons ([e913164](https://github.com/VforVitorio/LexFlow/commit/e913164a081a29cab537b36289c1035ea9136357))
* **landing:** full product reorientation — Personas, problem-framed Layers, UserFlow, SPA previews, cozy animations ([a2d201e](https://github.com/VforVitorio/LexFlow/commit/a2d201e9545260453d16e57f72bfdbbd8c5ab221))
* **landing:** macOS-style window chrome on every preview + chat overflow fix ([42e3da0](https://github.com/VforVitorio/LexFlow/commit/42e3da028db9577ce068a4ca9832959c72e69a01))
* **landing:** reorient hero-to-CTA flow around product (Personas, UserFlow), demote dev sections ([c369974](https://github.com/VforVitorio/LexFlow/commit/c36997465845d6627b52c218bc19d0377ead3e2e))
* **landing:** SPA-mirror previews ([#185](https://github.com/VforVitorio/LexFlow/issues/185), Obsidian-style graph) + cozy animation layer ([4e2c6d2](https://github.com/VforVitorio/LexFlow/commit/4e2c6d2ae2013308df70a9f1a684a3ac3ee50e26))


### Bug Fixes

* **landing:** chat typewriter pauses (not restarts), title color palette, WhatIs left-aligned ([635850f](https://github.com/VforVitorio/LexFlow/commit/635850fb1d8b01edfa0a57f39b5c3919f529153d))

## [0.5.1](https://github.com/VforVitorio/LexFlow/compare/v0.5.0...v0.5.1) (2026-05-23)


### Refactoring

* **landing:** drop HeroGraph mockup, centre the hero like f1stratlab ([551649b](https://github.com/VforVitorio/LexFlow/commit/551649b1576698931d995c70edda5ac5a1ba123f))

## [0.5.0](https://github.com/VforVitorio/LexFlow/compare/v0.4.2...v0.5.0) (2026-05-23)


### Features

* **landing:** pin navbar, working scroll-spy, mobile sweep, ES/EN copy rewrite ([750b0ba](https://github.com/VforVitorio/LexFlow/commit/750b0bace1e994b241ff515568d315abb55bccf0))
* **landing:** pin the navbar, get scroll-spy working, mobile sweep, ES/EN copy ([3c9156e](https://github.com/VforVitorio/LexFlow/commit/3c9156e0651499f4622b92d963e4f5d25db2f482))

## [0.4.2](https://github.com/VforVitorio/LexFlow/compare/v0.4.1...v0.4.2) (2026-05-23)


### Bug Fixes

* **landing:** drop leftover 280vh sticky CSS that left a black gap below HowItWorks ([1b623fe](https://github.com/VforVitorio/LexFlow/commit/1b623fe20ae9f0c383be9f62b6d9885cf3882301))
* **landing:** drop leftover 280vh sticky-scroll CSS from HowItWorks ([ae103e7](https://github.com/VforVitorio/LexFlow/commit/ae103e737863d0f3b740fc285fba44c3ce96a7d0))

## [0.4.1](https://github.com/VforVitorio/LexFlow/compare/v0.4.0...v0.4.1) (2026-05-23)


### Refactoring

* extract marketing landing into standalone landing/ project ([13e049d](https://github.com/VforVitorio/LexFlow/commit/13e049da9c9755ab75226c1547b31a10e4596f6b))

## [0.4.0](https://github.com/VforVitorio/LexFlow/compare/v0.3.0...v0.4.0) (2026-05-23)


### Features

* **landing:** new brand mark + live version pill + hover graph + nav polish ([5b3fabb](https://github.com/VforVitorio/LexFlow/commit/5b3fabbef55c88c1cf9171c97c8b3684e5b4388b))
* **landing:** node-graph logo, version pill, ApiFeature auto-rotate, HeroGraph hover, nav polish ([d85e7fe](https://github.com/VforVitorio/LexFlow/commit/d85e7fe8001355a13ad8252e2dada447a1648dcf))

## [0.3.0](https://github.com/VforVitorio/LexFlow/compare/v0.2.0...v0.3.0) (2026-05-23)


### Features

* **landing:** animations + extras — close [#150](https://github.com/VforVitorio/LexFlow/issues/150)-[#162](https://github.com/VforVitorio/LexFlow/issues/162) ([3b3d6e6](https://github.com/VforVitorio/LexFlow/commit/3b3d6e657c3fbb910b05284ef5f894d5fe6b6548))
* **landing:** animations + extras — closes [#150](https://github.com/VforVitorio/LexFlow/issues/150)-[#162](https://github.com/VforVitorio/LexFlow/issues/162) (13 issues) ([dd6877b](https://github.com/VforVitorio/LexFlow/commit/dd6877b01b27c4a54ae469443907e2471139e24b))


### Bug Fixes

* **landing:** stop feature cards from navigating into the SPA + add 'Authors' section ([6ebf1b0](https://github.com/VforVitorio/LexFlow/commit/6ebf1b032902438c55472694a78c09faae4b0ebc))
* **landing:** stop feature cards from navigating into the SPA + add 'Meet the authors' ([#148](https://github.com/VforVitorio/LexFlow/issues/148)) ([d9a6c57](https://github.com/VforVitorio/LexFlow/commit/d9a6c5742b1b9d62c469a55d5345d8a89c0167d3))


### Refactoring

* **api:** align error envelope to {detail} + handlers to sync def (closes [#99](https://github.com/VforVitorio/LexFlow/issues/99), [#100](https://github.com/VforVitorio/LexFlow/issues/100)) ([a1a5d44](https://github.com/VforVitorio/LexFlow/commit/a1a5d448b4406ecfc86b9a20f83aa70af69005f0))
* **api:** align error envelope to {detail} + handlers to sync def (closes [#99](https://github.com/VforVitorio/LexFlow/issues/99), [#100](https://github.com/VforVitorio/LexFlow/issues/100)) ([571e2d4](https://github.com/VforVitorio/LexFlow/commit/571e2d4257bc8f21560aff56f8c0cf32b95dc8fd))

## [0.2.0](https://github.com/VforVitorio/LexFlow/compare/v0.1.0...v0.2.0) (2026-05-23)


### Features

* add analytics and compliance dashboards ([3ae923e](https://github.com/VforVitorio/LexFlow/commit/3ae923e10a3ebc8e83fcc3667ecec100414fbd0e))
* add ChatProvider base contract and local providers (Ollama, LM Studio) ([f6dd260](https://github.com/VforVitorio/LexFlow/commit/f6dd26068d8e8d6350e9a8332d4a48ec2d0b4efb))
* add cloud providers (OpenAI, Anthropic, Google) and FastMCP server ([a15f232](https://github.com/VforVitorio/LexFlow/commit/a15f23298463aeff2ba25722ee4bec73a735ab75))
* add Docker and Docker Compose for server deployment ([e5476e6](https://github.com/VforVitorio/LexFlow/commit/e5476e606639db0da48f6c05797f1a453cccc0d0))
* add graph algorithms and JSON cache ([56a85f9](https://github.com/VforVitorio/LexFlow/commit/56a85f910bac4b477420010b374bb725161440b3))
* add graph and dashboard tests ([bd8df6a](https://github.com/VforVitorio/LexFlow/commit/bd8df6ac70653a72f12b021a5e1ebf9d42357fc1))
* add graph REST API endpoints ([e2f12c3](https://github.com/VforVitorio/LexFlow/commit/e2f12c313dd0010566d5d6c21b537de2c4d30b0f))
* bring in React frontend scaffold from Claude Design handoff (closes [#67](https://github.com/VforVitorio/LexFlow/issues/67)) ([5d3f2d7](https://github.com/VforVitorio/LexFlow/commit/5d3f2d78c92e594234fcba2a38f1f2f658107198))
* implement LegalGraph model and builder ([0ed8001](https://github.com/VforVitorio/LexFlow/commit/0ed80015a408b4e4513d1698b07408cb220ba80b))


### Bug Fixes

* align release-please workflow with F1_Strat_Manager working setup ([fd3a530](https://github.com/VforVitorio/LexFlow/commit/fd3a5303ffbc3f4791023b54b7c36a815c61130f))
* migrate frontend ESLint to v9 flat config ([7f09497](https://github.com/VforVitorio/LexFlow/commit/7f09497ef2c7b54a496e755491dca89a406d6ee0))
* resolve Copilot follow-ups from PR [#68](https://github.com/VforVitorio/LexFlow/issues/68) + release-please credentials ([896c400](https://github.com/VforVitorio/LexFlow/commit/896c40019eb1a331ef71dfcc66bff77ede7e9ccc))


### Documentation

* add 'Fire and check, never block' rule to CLAUDE.md ([fa77883](https://github.com/VforVitorio/LexFlow/commit/fa7788360d133066c376d26f191b14d697683955))
* add initial English docs/ tree (14 files, getting-started + architecture + backend) ([2522422](https://github.com/VforVitorio/LexFlow/commit/2522422ff7d397f03794e8c23fb95e3fedc2700b))
* add workflow rule "never idle on long-running work" to CLAUDE.md ([471d572](https://github.com/VforVitorio/LexFlow/commit/471d572d00c63267ef66a0891fadd4570d092d41))
* bring README up to date (React stack, Phase 2/3/4 backend done) ([7de9591](https://github.com/VforVitorio/LexFlow/commit/7de95919e20833cc28210d696c1aca103a2ce267))
* complete English docs/ tree (frontend, operations, contributing) ([f78cbe5](https://github.com/VforVitorio/LexFlow/commit/f78cbe5fca2bb84fbe3fb9929a87e87274ca5650))
* ultra-roadmap v2 (Phases 8 & 9), planning markdowns, emoji cleanup ([f00e242](https://github.com/VforVitorio/LexFlow/commit/f00e2422a8b748bc0b5bce43ae099b67afc50795))
* ultra-roadmap v2 (Phases 8 and 9, planning markdowns, 19 issues) ([ee283f5](https://github.com/VforVitorio/LexFlow/commit/ee283f50c6623e9eb90cfa852de57128b8a0ce0d))
