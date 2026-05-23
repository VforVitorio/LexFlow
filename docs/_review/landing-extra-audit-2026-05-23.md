# LexFlow landing — extra audit (2026-05-23)

Scope: findings BEYOND the 12 animation issues already filed (#150–#161) and the analytics issue #162. Focus areas per the brief: SEO, performance budget, accessibility, copy quality, IA, i18n parity, dark mode, mobile breakpoints, OG assets, favicon/manifest, footer link integrity, branding micro-touches.

Read sources: `LandingPage.tsx`, every `sections/*.tsx`, every `mocks/*.tsx`, `landing.css` (1419 lines), `icons.tsx`, both `landing.json` locales, `frontend/index.html`, `frontend/public/`, `App.tsx`, `deploy-landing.yml`, and the two prior scout reports.

---

## Findings

### A1. SEO metadata is almost entirely missing
- **Where**: `frontend/index.html:1-20`, `frontend/src/pages/landing/LandingPage.tsx:30-35`.
- **What**: `index.html` ships only `<title>`, `theme-color` and `viewport`. There is no `<meta name="description">`, no canonical link, no `<meta name="robots">`, no Open Graph (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`), no Twitter card. The `LandingPage` `useEffect` sets `document.title` once based on language but never touches `<meta name="description">` or `<html lang>` for the SSR-less initial render — so when the page is shared on social platforms, the unfurl is blank/broken.
- **Why it matters**: any Twitter, LinkedIn, Discord or Slack link preview will show an empty card. Google's SERP snippet falls back to the first paragraph, which is body copy in Spanish. The product's first impression on social is bad.
- **Suggested fix**: in `index.html`, add a static EN baseline; let `LandingPage` rewrite `description` + `og:*` per language via a tiny helper.
  ```html
  <meta name="description" content="LexFlow — Spanish legislation, alive and navigable. An open-source platform built on legalize-es."/>
  <link rel="canonical" href="https://vforvitorio.github.io/LexFlow/"/>
  <meta property="og:type" content="website"/>
  <meta property="og:title" content="LexFlow — Spanish legislation, alive and navigable"/>
  <meta property="og:description" content="REST API, knowledge graph, legal chatbot and Plotly dashboards on top of legalize-es."/>
  <meta property="og:image" content="https://vforvitorio.github.io/LexFlow/og.png"/>
  <meta property="og:url" content="https://vforvitorio.github.io/LexFlow/"/>
  <meta name="twitter:card" content="summary_large_image"/>
  ```
- **Effort**: small.

### A2. No Open Graph image asset exists
- **Where**: `frontend/public/` only contains `favicon.svg` (377 B). No `og.png`, no `og.svg`, no `screenshot.png`.
- **What**: even after adding the meta tags from A1, the link unfurl will 404 on `/og.png`. The landing's whole visual identity — the hero graph, the gradient headline — never reaches social.
- **Why it matters**: OG images drive 2–3× the click-through on shared links. For an open-source project recruiting contributors via Twitter/HN, this is the single highest-ROI marketing asset.
- **Suggested fix**: ship a `1200×630` PNG at `frontend/public/og.png` showing the brand mark + headline + `legalize-es` byline on the dark-violet gradient. Author it once in Figma or generate from a `<canvas>` snapshot of the hero. Reference it from A1's meta tags.
- **Effort**: small (asset author) / medium (if doing a `@vercel/og`-style runtime generator).

### A3. JSON-LD `SoftwareApplication` schema absent
- **Where**: `frontend/index.html` (missing).
- **What**: no structured data exists. Adding a single `application/ld+json` block describing the project as `SoftwareApplication` + `Organization` + `SourceCodeRepository` gives Google rich-result eligibility (star badge, license, free-of-charge tag).
- **Why it matters**: for "lexflow" / "legalize spanish law" queries, a rich card stands out against plain blue links. Free, deterministic SEO win.
- **Suggested fix**:
  ```html
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"SoftwareApplication",
   "name":"LexFlow","applicationCategory":"DeveloperApplication",
   "operatingSystem":"Windows, macOS, Linux","offers":{"@type":"Offer","price":"0"},
   "license":"https://www.apache.org/licenses/LICENSE-2.0",
   "codeRepository":"https://github.com/VforVitorio/LexFlow"}
  </script>
  ```
- **Effort**: small.

### A4. Google Fonts loaded render-blocking, three families, every weight
- **Where**: `frontend/index.html:9-14`.
- **What**: a single `<link rel="stylesheet">` pulls Space Grotesk (4 weights), Inter (4 weights) and JetBrains Mono (3 weights) — 11 font files from a third-party origin, render-blocking the first paint. `display=swap` is set, which helps, but the request blocks the parser until it returns.
- **Why it matters**: LCP penalty on slow connections; also a privacy issue (Google logs visitor IPs — illegal under some EU readings post-Schrems-II). For an *open-source Spanish legal* project this is on-brand-bad.
- **Suggested fix**: self-host the three families via `@fontsource/space-grotesk`, `@fontsource/inter`, `@fontsource/jetbrains-mono` (already npm-installable, weights tree-shake). Drop the `<link>` block and keep only the `preconnect` if a CDN is still used; otherwise remove it entirely. Add `font-display: swap` in the local `@font-face`.
- **Effort**: small.

### A5. `<html lang>` is hardcoded to `es` and only updated post-mount
- **Where**: `frontend/index.html:2` (`<html lang="es">`); `LandingPage.tsx:30-35` updates it after mount.
- **What**: search engines and screen readers read the attribute from the initial HTML. EN visitors get `lang="es"` for the whole TTI window, which mis-cues Google Translate and screen-reader pronunciation. There is also no `<link rel="alternate" hreflang>` pair for the bilingual nature of the site.
- **Why it matters**: a11y + SEO. Hreflang specifically helps Google route ES queries to the ES page and EN queries to the EN page.
- **Suggested fix**: keep `lang="es"` as the default in `index.html`, but add `<link rel="alternate" hreflang="es" href="https://…/?lang=es"/>` and `…hreflang="en"…` plus an `x-default`. Persist the language choice in localStorage (probably already done via i18next) and update `<html lang>` synchronously in `main.tsx` before React mounts.
- **Effort**: small.

### A6. Nav `<a href="#layers">` links lack `aria-current` and the brand `#top` anchor doesn't exist
- **Where**: `sections/Nav.tsx:28-32` and `sections/Hero.tsx:9` (`id="top"`).
- **What**: the nav links jump to anchors but never reflect the active section (covered structurally by #151, but the *aria* dimension is independent). Also, the brand link points to `#top` while Hero's id is `top` — fine, but on Pages deploys with `VITE_BASE_PATH=/LexFlow/`, in-page hash navigation works while a hard reload of `/LexFlow/#layers` requires the SPA fallback. Verify.
- **Why it matters**: keyboard + screen-reader users lose the "you are here" signal that #151 will only deliver visually.
- **Suggested fix**: when #151 lands, also set `aria-current="location"` on the active nav link. Independently, add a `<h1 className="sr-only">LexFlow</h1>` to the brand link target so screen readers announce the section.
- **Effort**: small.

### A7. Heading hierarchy: every section uses `<h2>` but the chat / dashboard mocks contain text styled as headings without semantic tags
- **Where**: `mocks/ChatMockup.tsx:38-44`, `mocks/DashboardMockup.tsx:17-25`.
- **What**: `lf-dash-title` ("Reformas por año") and `lf-msg-role` are visually heading-like but rendered as `<div>`. Conversely, the `<h3 className="author-name">` inside Authors and the `<h3>` inside `feature-copy` are correct. Stack uses `<h4>` for column titles which is fine. The outline is sane (h1 → h2 → h3) but check via the browser's "Outline" view to ensure no h2 is skipped on a mobile collapse.
- **Why it matters**: a11y screen-reader navigation by heading.
- **Suggested fix**: keep visual styling but change `lf-dash-title` and `lf-chat-meta` source-of-truth strings to be wrapped in a `<p>` not a `<div>` (they're not headings; the mock is illustrative). Run `axe-core` once via CI (issue #130 already plans this).
- **Effort**: small.

### A8. `alt` text on author avatars mixes Spanish into the EN locale
- **Where**: `sections/Authors.tsx:43` — `alt={\`Avatar de ${a.name}\`}`.
- **What**: the prefix "Avatar de" is hardcoded in Spanish and renders identically when the visitor toggles to English.
- **Why it matters**: small but visible i18n leak; screen readers in EN will narrate Spanish.
- **Suggested fix**: add `authors.avatarAlt` to both locale files (`"avatarAlt": "Avatar of {{name}}"` / `"Avatar de {{name}}"`) and read `t('authors.avatarAlt', { name: a.name })`. Same applies to the Copy/Copied label in `ApiMockup.tsx:43` which is hardcoded with a string switch instead of being a translation key.
- **Effort**: small.

### A9. Footer "Product / Project / Resources" links all go to one of two URLs
- **Where**: `sections/Footer.tsx:22-33`.
- **What**: every productLink href is `#layers`, every projectLink is `GH_URL`, every resourcesLink is `GH_URL`. So "Roadmap", "Architecture", "Changelog", "Issues", "Contributing", "Code of conduct", "API docs", "CLAUDE.md", "License" — nine distinct labels — all resolve to one of two destinations. Users discover the dead-end after clicking.
- **Why it matters**: trust signal. A landing that misrepresents its links reads as a stub or, worse, as deceptive.
- **Suggested fix**: turn the locale arrays from `string[]` into `{label, href}[]` and point each at a real target — `Roadmap` → `#roadmap`, `Architecture` → `https://github.com/VforVitorio/LexFlow/blob/main/docs/architecture.md` (or remove until it exists), `Changelog` → `…/CHANGELOG.md`, `Issues` → `…/issues`, `Contributing` → `…/blob/main/CONTRIBUTING.md`, `Code of conduct` → `…/blob/main/CODE_OF_CONDUCT.md`, `License` → `…/blob/main/LICENSE`, `API docs` → `/docs` (once it exists) or remove, `CLAUDE.md` → `…/blob/main/CLAUDE.md`. Until a link has a real target, drop the row rather than misdirecting.
- **Effort**: small.

### A10. Favicon is fine but no PWA manifest / Apple touch icon / 32×32 PNG fallback
- **Where**: `frontend/public/favicon.svg`; `index.html:5`.
- **What**: only an SVG favicon ships. Safari iOS, older Android home-screen, and many email clients require a PNG. No `apple-touch-icon`, no `manifest.webmanifest`. The "Add to Home Screen" UX is broken.
- **Why it matters**: the project plans to ship as a desktop binary (CLAUDE.md §1) but the marketing page is the front door; a missing manifest forfeits installability and the polished iOS bookmark.
- **Suggested fix**: ship `apple-touch-icon-180.png`, `icon-192.png`, `icon-512.png` and a minimal `manifest.webmanifest` (name, short_name, theme_color `#3140c2`, background_color `#0b0b14`, display `standalone`, start_url `/`). Wire from `index.html`.
- **Effort**: small.

### A11. `hero h1` shimmer animation has no `prefers-reduced-motion` opt-out
- **Where**: `landing.css:301-328`.
- **What**: the gradient-clip headline runs a 9-second infinite `lf-hero-shimmer` keyframe. The global `@media (prefers-reduced-motion: reduce)` block at line 1414 only covers `.author-card` and `.author-link`. Other infinite animations (`lf-graph-edge`, `lf-graph-node-halo`, `pulse-dot`-like patterns) are not gated either.
- **Why it matters**: WCAG 2.3.3. Users who opt out of motion still get an animated gradient.
- **Suggested fix**: extend the reduced-motion block:
  ```css
  @media (prefers-reduced-motion: reduce) {
    .landing-root .hero h1 .accent,
    .landing-root .lf-graph-edge,
    .landing-root .lf-graph-node-halo { animation: none !important; }
  }
  ```
- **Effort**: small. (Touches the same file as #161 but addresses a different concern — a11y vs. token unification.)

### A12. Light-theme contrast on `.hero-badge .pill` is borderline
- **Where**: `landing.css:283-293`.
- **What**: amber on `amber-500 / 0.15` background. In light mode (`#…f59e0b` text on a 15%-alpha amber wash sitting on a near-white surface) the contrast ratio is around 3.2:1 — below WCAG AA for normal text (4.5:1). The dark-mode override at line 293 brightens to `hsl(38 95% 72%)` which is fine on dark.
- **Why it matters**: the pill says "pre-alpha", which is exactly the kind of disclaimer a user must be able to read.
- **Suggested fix**: in light mode use `color: hsl(28 90% 38%)` (amber-700ish) and bump the background to `amber-500 / 0.18`. Verify with a tool like axe DevTools.
- **Effort**: small.

### A13. `HeroGraph` SVG is 520×520 with filter/glow on every node — repaints whole hero on scroll
- **Where**: `mocks/HeroGraph.tsx:42-86`.
- **What**: the hero SVG declares `overflow: visible`, two filled radial gradients, a `feGaussianBlur stdDeviation="6"` filter applied to the three large nodes, and the floating cards (`lf-float-tl`, `lf-float-br`) sit on top. Combined with the existing edge-pulse keyframes (issue #151 territory but live today), this composite layer triggers a full repaint on every scroll on devices without compositing acceleration.
- **Why it matters**: mobile LCP and INP. Lighthouse will dock both.
- **Suggested fix**: (1) wrap the SVG `<g>` carrying the glow filter in `will-change: transform` with `transform: translateZ(0)` to promote to its own layer; (2) replace `feGaussianBlur` on the big nodes with a static `box-shadow` on a sibling div or a pre-baked `<filter>` applied once at the SVG root; (3) lazy-mount `HeroGraph` only after first paint (`IntersectionObserver` or `<Suspense>` with a placeholder).
- **Effort**: medium.

### A14. Author avatars hot-link to `avatars.githubusercontent.com`
- **Where**: `sections/Authors.tsx:41`.
- **What**: visitors leak their IP to GitHub on every landing visit, even before clicking anything. Image dimensions are not validated; GH returns a 460×460 by default which is then scaled to 88×88, wasting 80% of the pixels.
- **Why it matters**: GDPR (third-party connection without consent on the landing surface), plus bandwidth waste.
- **Suggested fix**: vendor `victor.jpg` and `santi.jpg` (or `.webp`) at 176×176 into `frontend/public/avatars/`. Update the loop to `src={\`/avatars/${a.login}.webp\`}`. Add `width/height` (already there) and `decoding="async"`.
- **Effort**: small.

### A15. Tone — three sentences across the landing read as LLM boilerplate
- **Where**:
  1. `landing.json:es:14` — "Plataforma open source para explorar, analizar y consultar legislación española mediante grafos de conocimiento, IA y dashboards interactivos."
  2. `landing.json:en:60` — "Bring your own model — Ollama, LM Studio, OpenAI, Anthropic or Google. A FastMCP server exposes the API as tools, so answers come from real data, not memorized text."
  3. `landing.json:es:144` — "Si te interesa el rumbo del proyecto o quieres contribuir, su perfil en GitHub es el sitio donde el código vive."
- **What**: triplet structures ("explorar, analizar y consultar"), "real data, not memorized text" framing, and the over-soft "su perfil en GitHub es el sitio donde el código vive" feel auto-generated. Strunk would tighten them.
- **Why it matters**: the rest of the copy is sharp; these three lines flatten the voice.
- **Suggested fix**: see Section-by-section pass below for concrete rewrites.
- **Effort**: small.

### A16. Information architecture — no "Why LexFlow" / "Who is this for"; Authors precedes CTA
- **Where**: `LandingPage.tsx:40-50`.
- **What**: section order is Hero → StatBar → Layers → BuiltOn → PoweredBy → Stack → Roadmap → Authors → CTA → Footer. Two issues: (a) there is no "Who is this for" section answering whether the visitor (compliance team, researcher, developer, journalist) should care; (b) Authors sits between Roadmap and the closing CTA, breaking the call-to-action build-up. The conventional flow is Authors → CTA when Authors is the social-proof beat, but here Authors reads as the personal-touch beat and would land better between BuiltOn and PoweredBy.
- **Why it matters**: a first-time visitor scrolling on mobile gives up around section 5–6. The Roadmap → Authors → CTA tail loses the moment the Stack section earned.
- **Suggested fix**: either (a) inject a 90-second "Who it's for" mini-grid between Hero and StatBar (three cards: "Developers building legal tools", "Compliance teams tracking reforms", "Researchers and journalists"); or (b) reorder to Hero → StatBar → Layers → BuiltOn → Stack → PoweredBy → Roadmap → CTA → Authors → Footer. Pick one and ship.
- **Effort**: medium.

### A17. Stack section uses "React Router v6 (component-based)" but CLAUDE.md mandates TanStack Router
- **Where**: `landing.json:en:117` / `:es:117`.
- **What**: the landing advertises the routing tech as "React Router v6". CLAUDE.md §2 explicitly says TanStack Router. App.tsx currently uses `react-router-dom` — so the landing matches the *implementation* but contradicts the *target architecture*. Either the landing is right and CLAUDE.md is stale, or vice versa.
- **Why it matters**: pre-alpha credibility. Visitors reading both the landing and the README will see a contradiction.
- **Suggested fix**: pick one truth. If TanStack Router migration is still planned, change the landing row to "Routing: TanStack Router (file-based, typed)". If react-router is the long-term choice, update CLAUDE.md §2 and the memory note.
- **Effort**: small (text) / medium (if migrating).

### A18. Dashboard mock's "+12% vs 2024" is invented and shown identically in ES and EN
- **Where**: `mocks/DashboardMockup.tsx:8-9` and the rendered chart at `:27-43`.
- **What**: the KPI delta "+12% vs 2024" is hardcoded, the bar values `[42, 51, 67, 58, 73, 81, 76, 64]` are made up. The bar styled in gradient is `i === VALS.length - 2` — index 6, which is 2024 — not 2025 (the visible "current" year). So the mock visually highlights *last* year, not the year the KPI references.
- **Why it matters**: a careful viewer notices the misalignment and the credibility hit is disproportionate. The mock is illustrative but should still be internally consistent.
- **Suggested fix**: highlight `VALS.length - 1` (2025), tweak the value so 2025 is the tallest bar, and adjust the delta to match. Add a small `aria-hidden="true"` note on the chart container or a `<figcaption className="sr-only">Illustrative mockup</figcaption>` so screen-reader users aren't told fake stats are real.
- **Effort**: small.

### A19. i18n: the `nav.github` key exists but is never rendered; ES/EN have one parity gap
- **Where**: `landing.json:es:6` and `:en:6` (`"github": "GitHub"`), `Nav.tsx` (does not use it).
- **What**: `nav.github` is dead in both locales. Also, the `linkLabel` field inside each layer (e.g. `"Abrir el explorador →"`) is documented as "Deprecated — left in the i18n schema for parity" in `ApiFeature.tsx:13` but still ships in both locales adding 4 strings × 2 locales × N future translators of dead copy.
- **Why it matters**: schema rot. Future translators will localise dead strings.
- **Suggested fix**: remove `nav.github` from both locale files; remove the four `linkLabel` keys. Keep `LayerCopy.linkLabel` as optional in the TS type but stop shipping the strings.
- **Effort**: small.

### A20. Mobile: sticky nav (`top:0`) plus 64px height eats 14% of the iPhone SE viewport
- **Where**: `landing.css:71-79, 80-85`.
- **What**: nav is `position: sticky; top: 0` with `height: 64px` and `backdrop-filter: blur(12px)`. On iPhone SE (375×667) the nav consumes 64 of the 667 px viewport at all times. The hero badge + h1 (clamped to 40px at the small end) + sub + two CTAs + meta bar can't fit above the fold below the nav. Worse, the nav has no collapse: `nav-links`, `nav-actions` and the language `seg` all fight for the 375-px width and overflow. There is no `@media (max-width: 640px)` rule hiding `nav-links` or collapsing into a hamburger.
- **Why it matters**: mobile-first. The current layout breaks the moment you open Chrome DevTools' mobile preview.
- **Suggested fix**: at `@media (max-width: 640px)` hide `.nav-links` (the inline anchors), hide the lang `seg` (move it into a hamburger panel), and keep only brand + theme toggle + GitHub + primary CTA. Or compress the primary CTA to icon-only with `aria-label` until ≥640 px.
- **Effort**: small.

### A21. Branding micro-touch — no `<title>` differentiation between landing and app, no version sigil, no easter egg
- **Where**: `LandingPage.tsx:32-34`; `Footer.tsx:36`.
- **What**: the title flips between two static strings. There's no version chip (`v0.1-alpha`) anywhere visible after the hero, and no signature touch (e.g. a `console.log("Hi, builder. Source at github.com/…")` on boot, or a Konami-code easter egg). For a project explicitly courting contributors, a tiny in-DevTools welcome is cheap brand glue.
- **Why it matters**: the people you most want to recruit (other devs) open DevTools first thing. A landing that talks to them there has higher conversion.
- **Suggested fix**: add `useEffect(() => console.log("%c LexFlow ", "background:#3140c2;color:#fff;padding:4px 8px;border-radius:6px;font-weight:600", "Source: https://github.com/VforVitorio/LexFlow"), [])` in `LandingPage`. Add a `v0.1.0-alpha` chip to the footer-bottom row next to the copyright.
- **Effort**: small.

---

## Section-by-section copy pass

**Nav** (`landing.json:nav`):
- ES: "Capas" → consider "Plataforma" — "Capas" reads as technical jargon to non-devs; "Plataforma" matches the layered framing without the metaphor.
- EN: "Features" → leave as is; it's the strongest landing convention.

**Hero** (`hero.*`):
- ES `sub`: "Plataforma open source para explorar, analizar y consultar legislación española mediante grafos de conocimiento, IA y dashboards interactivos. Construida sobre el corpus legalize-es." → "API, grafo, chatbot y dashboards sobre toda la legislación española. Open source. Local-first. Construido sobre legalize-es."
- EN `sub`: "An open-source platform to explore, analyze and query Spanish law…" → "API, graph, chatbot and dashboards over every Spanish law. Open source. Local-first. Built on legalize-es."
- EN `title2`: "alive and navigable." → "alive, linked, navigable." (the three-beat reads stronger than two and echoes the four layers).

**StatBar** (`stats`):
- "4 — Capas integradas — API, grafo, chat y dashboards" reads as a definition; cut the dash: "Capas: API, grafo, chat, dashboards".
- "100% — Código abierto bajo licencia Apache 2.0" → "100% — Apache 2.0. Open source de verdad." (or EN: "100% — Apache 2.0. Open source, no asterisks.").

**Layers** (`layersSub` + per-layer `body`):
- ES `layersSub`: "Cada capa se monta sobre el mismo núcleo FastAPI…" → tight version: "Una sola API tipada. Una sola fuente de datos. Cuatro formas de consultarla."
- Layer 3 EN `body`: "real data, not memorized text" — the "memorized text" framing is LLM-meta and slightly confusing for non-AI readers. Try: "answers cite real articles from the corpus, not generic memory."
- Layer 4 ES `bullets[0]`: "Panel de compliance · normas y alertas por sector" — "compliance" is English in a Spanish sentence; either translate ("cumplimiento") or italicise as a loanword.

**BuiltOn** (`builtOn*`):
- EN `builtOnBody`: "thin, intelligent layer" → "thin, opinionated layer" — "intelligent" sounds like marketing; "opinionated" sounds like infra. Both are true; the latter signals to devs.
- The terminal comment "# → API live at http://localhost:8000/docs" — drop the arrow, add a sigil: "# API ready · http://localhost:8000/docs".

**PoweredBy**: no copy strings — the section is pure logos. Add a tiny eyebrow above it for rhythm: ES "Tecnología sobre la que apoya" / EN "What it stands on".

**Stack** (`stackSub`):
- EN: "No experimental frameworks, no proprietary cloud — every piece is open source, well-documented and easy to replace." → "Every piece is open source, well-documented, and easy to replace. No experimental frameworks. No proprietary cloud." Inverting the order leads with the positive.

**Roadmap** (`roadmapSub`):
- ES: "El backend está completo en funcionalidades; el frontend en React es donde aterrizan los próximos hitos." → "Backend completo. El frontend React es donde aterrizan los próximos hitos." Short sentences beat the semicolon.
- Phase 7 "Standalone distribution · PyInstaller binaries: .exe · .dmg · .AppImage. Docker done." → drop "Docker done."; it confuses the status of *this* phase. Move to a Phase 1 retrofit if it belongs anywhere.

**Authors** (`authors.sub`):
- ES: "su perfil en GitHub es el sitio donde el código vive." → "su GitHub es el código." More confident, fewer words.
- EN: "their GitHub profile is where the code lives." → "their GitHub is where the code lives."

**CTA** (`ctaSub`):
- EN: "Spin it up in under a minute." → keep title; tighten body: "Clone, `uv sync`, run. The full API at localhost:8000 with interactive docs. Star the repo to follow along."

**Footer** (`footer.tagline`, `footer.legal`):
- `footer.legal` ES: "Apache 2.0 · pre-alpha · Hecho con cariño en 2026" — "Hecho con cariño" is sweet but reads as filler. Try: "Apache 2.0 · pre-alpha · Construido en abierto, 2026." EN mirror: "Apache 2.0 · pre-alpha · Built in the open, 2026."

---

## Quick wins (do these first)

- **A1 + A2 + A3**: ship `og.png`, add OG/Twitter/JSON-LD meta tags, set canonical. Half a day, transforms every shared link.
- **A9**: replace fake footer link arrays with real targets (or drop the labels). Builds trust on the spot.
- **A4**: self-host fonts via `@fontsource/*`. Removes the GDPR risk and the render-blocking third-party request.
- **A11**: add the missing `prefers-reduced-motion` rules. One CSS block, ships WCAG 2.3.3 compliance.
- **A20**: collapse the nav on `≤640 px`. Fixes the most-broken mobile state in five minutes.

## Defer to a later iteration

- **A16** (IA reordering / new "Who is this for" section): needs a design decision on whether the audience is dev-only or broader. Either reorder OR add — but not both without a copywriting pass.
- **A13** (HeroGraph layer-promotion + lazy mount): wait for Lighthouse / INP data from the live Pages deploy. Pre-optimising without numbers risks shaving the visual without measurable gain.
- **A17** (Stack copy: TanStack vs react-router): blocks on whether the migration in CLAUDE.md §2 is still on. Until that's decided, freezing the label one way is premature.
