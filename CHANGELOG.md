# Changelog

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
