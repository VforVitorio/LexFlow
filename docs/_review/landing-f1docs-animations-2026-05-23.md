# F1 StratLab docs — animations & patterns scouting (2026-05-23)

Source root: `docs/` of the `F1_Strat_Manager` repo (deployed at `docs.f1stratlab.com`). The site is a single‑page React+Babel app served from a static `index.html`; nearly all visual logic lives in `styles/docs.css` (2 100 lines) and `app/*.jsx`.

---

### D1. Fixed dual-layer atmosphere (halo + masked grid)
- **Where in F1 docs**: `styles/docs.css:17-40`.
- **What it does**: `body::before` paints two radial purple/blue halos top-right and bottom-left; `body::after` paints a 56 px grid using two 1 px linear-gradients, then a radial mask fades the grid into the page edges. Both are `position: fixed; z-index: 0; pointer-events: none`.
- **Why it's good**: gives the whole site a "studio backdrop" without a single image, animation, or JS, and it survives scroll because it's `fixed`.
- **Tailwind / framer-motion translation**:
```tsx
<div aria-hidden className="pointer-events-none fixed inset-0 -z-10
  [background:radial-gradient(ellipse_70%_40%_at_70%_-10%,rgba(108,92,231,.18),transparent_60%),radial-gradient(ellipse_60%_35%_at_10%_110%,rgba(51,133,255,.08),transparent_60%)]" />
<div aria-hidden className="pointer-events-none fixed inset-0 -z-10
  [background-image:linear-gradient(to_right,rgba(255,255,255,.018)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.018)_1px,transparent_1px)]
  [background-size:56px_56px]
  [mask-image:radial-gradient(ellipse_100%_80%_at_50%_30%,#000_30%,transparent_85%)]" />
```
- **Suggested LexFlow placement**: site-wide, behind the hero on the landing.
- **Effort**: small.

### D2. Sticky three-pane shell (left nav · article · right TOC)
- **Where in F1 docs**: `styles/docs.css:276-307, 660-710`; consumed in `app/main.jsx:99-133`.
- **What it does**: a 1 440 px `grid-template-columns: 280px minmax(0,1fr) 240px`, the left sidebar and right TOC each `position: sticky; top: 60px; height: calc(100vh - 60px); overflow-y: auto`. Custom thin scrollbars (`scrollbar-width: thin`). At ≤1 280 px the TOC drops; at ≤1 024 px the sidebar goes off-canvas with a backdrop.
- **Why it's good**: long-form content stays readable; both rails scroll independently.
- **Tailwind / framer-motion translation**:
```tsx
<div className="mx-auto grid max-w-[1440px] grid-cols-[280px_minmax(0,1fr)_240px] xl:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-1">
  <aside className="sticky top-[60px] h-[calc(100vh-60px)] overflow-y-auto border-r border-white/10 px-6 py-7" />
  <main className="min-w-0 px-14 py-10" />
  <aside className="sticky top-[60px] h-[calc(100vh-60px)] overflow-y-auto py-10 pl-2 pr-6 xl:hidden" />
</div>
```
- **Suggested LexFlow placement**: the future `/docs` route — *not* the marketing landing.
- **Effort**: medium.

### D3. Scroll-spy right-rail table of contents
- **Where in F1 docs**: `app/components.jsx:320-365`; styles `styles/docs.css:680-710`.
- **What it does**: collects every rendered `h2/h3`, listens to `window.scroll` (passive), and sets the currently-active id by comparing `offsetTop` against `scrollY + 100`. The active item gets a glowing 2 px purple bar (`::before` with `box-shadow: 0 0 6px`).
- **Why it's good**: gives readers a live "you are here" indicator in long articles.
- **Tailwind / framer-motion translation**: replace the manual scroll listener with `IntersectionObserver` for less work per frame; keep the glow bar via a pseudo-element.
```tsx
const [active, setActive] = useState("");
useEffect(() => {
  const obs = new IntersectionObserver(
    es => es.forEach(e => e.isIntersecting && setActive(e.target.id)),
    { rootMargin: "-80px 0px -70% 0px" });
  document.querySelectorAll("article h2,article h3").forEach(h => obs.observe(h));
  return () => obs.disconnect();
}, []);
```
- **Suggested LexFlow placement**: any future long-form page (article view, changelog, legal pages).
- **Effort**: small.

### D4. ⌘K / `/` search overlay with tag chips and arrow-key nav
- **Where in F1 docs**: `app/components.jsx:29-194`; styles `styles/docs.css:90-242`.
- **What it does**: focusable input with `⌘K` and `/` global hotkeys, fuzzy scoring (title 4 · tag 3.5 · section 2 · description 1 · body 0.5), inline `<mark>` highlights, tag-suggestion row with usage counts as pill counters, ArrowUp/Down/Enter navigation, `Escape` blur. Eager-loads all markdown so body matches work.
- **Why it's good**: feels like Linear/Vercel. The "type `#tag`" shortcut is the standout — it's discoverable from the placeholder ("Search docs or #tag…").
- **Tailwind / framer-motion translation**: lift to a `Dialog` (cmdk or shadcn `Command`) bound to a `useHotkeys('mod+k')`. Wrap the dropdown in `<motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .12 }}>`.
- **Suggested LexFlow placement**: docs route once it exists; the landing only needs a static "Try the search" preview screenshot.
- **Effort**: medium.

### D5. Code blocks with macOS chrome + copy-to-clipboard
- **Where in F1 docs**: `app/markdown.jsx:16-34, 187-197`; styles `styles/docs.css:564-633`.
- **What it does**: a custom marked.js renderer wraps every fenced block in a `.code-block` panel with three faux traffic-light dots, a right-aligned language tag, and a `Copy` button. The button uses `navigator.clipboard.writeText`, swaps its text to `Copied` for 1.4 s, then reverts. Prism token colours overridden inline (purple keywords, mint strings, amber numbers).
- **Why it's good**: feels native to the page and is impossible to mistake for "we just embedded a Prism CDN".
- **Tailwind / framer-motion translation**:
```tsx
function CodeBlock({ lang, children }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-5 overflow-hidden rounded-xl border border-white/10 bg-[#0c0d14] shadow-md">
      <div className="flex items-center gap-2 border-b border-white/5 px-3.5 py-2 text-xs">
        <span className="h-2 w-2 rounded-full bg-white/10" /><span className="h-2 w-2 rounded-full bg-white/10" /><span className="h-2 w-2 rounded-full bg-white/10" />
        <span className="ml-auto font-mono uppercase text-white/50">{lang}</span>
        <button onClick={() => { navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 1400); }} className="rounded border border-white/10 px-2 py-0.5 font-mono text-[11px] text-white/60 hover:border-purple-400 hover:text-purple-300">{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre className="overflow-x-auto px-5 py-4 text-[13px] leading-relaxed"><code>{children}</code></pre>
    </div>
  );
}
```
- **Suggested LexFlow placement**: any code snippet on the landing (install command, curl example) and inside docs.
- **Effort**: small.

### D6. Hover-revealed heading permalinks
- **Where in F1 docs**: `app/markdown.jsx:37-41`; styles `styles/docs.css:435-456, 1916-1925`.
- **What it does**: marked's heading renderer appends an `<a class="heading-anchor">#</a>` with `opacity: 0` that becomes `1` on heading hover. On touch devices (`@media (hover: none)`) it stays at `opacity: 0.5` so it remains tappable.
- **Why it's good**: keeps the prose clean but offers a deep link on demand. The touch fallback is the rare accessibility detail people forget.
- **Tailwind / framer-motion translation**: `<h2 className="group scroll-mt-20">Title <a href="#id" className="ml-2 font-mono text-[0.7em] text-purple-300 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-50">#</a></h2>`.
- **Suggested LexFlow placement**: docs only.
- **Effort**: small.

### D7. Article enter animation + skeleton loader
- **Where in F1 docs**: `styles/docs.css:1483-1499`; trigger `app/markdown.jsx:227-234`.
- **What it does**: while markdown is fetched, four `.skel` divs shimmer (`@keyframes shimmer` slides a 200 %-wide gradient horizontally over 1.4 s). When HTML lands, the container gets `.article-enter` which runs `@keyframes article-fade` — 320 ms opacity 0→1 + `translateY(8px)`→`0` — once.
- **Why it's good**: the loader sells "it's working" instead of a blank flash, and the fade-in masks layout reflow.
- **Tailwind / framer-motion translation**:
```tsx
<motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .32, ease: [.2, 0, 0, 1] }}>
  …
</motion.div>
// Skeleton: <div className="h-3.5 w-4/5 animate-[shimmer_1.4s_linear_infinite] rounded bg-[linear-gradient(90deg,#111827,#17192b_50%,#111827)] bg-[length:200%_100%]" />
```
- **Suggested LexFlow placement**: anywhere data is fetched on the landing (e.g. live stats panel) and as the default page transition for docs.
- **Effort**: small.

### D8. Lift-on-hover cards with a single cubic-bezier timing
- **Where in F1 docs**: `styles/docs.css:900-969, 1149-1161`.
- **What it does**: `.layer-card`, `.agent-card`, `.page-footer-link`, `.btn-primary`, `.stratlab-author-card` all share `transition: all 0.15-0.18s cubic-bezier(0.2,0,0,1)`, and on hover: `transform: translateY(-1px)`, border tint shift, optional `box-shadow: var(--shadow-elev)`. On touch devices `@media (hover: none)` suppresses the lift so it doesn't "stick" after tap.
- **Why it's good**: every interactive surface uses the same micro-motion, so the site feels coordinated rather than busy.
- **Tailwind / framer-motion translation**: define one utility class `.card-lift` in `index.css`:
```css
.card-lift { @apply transition-[transform,box-shadow,border-color,background] duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] hover:-translate-y-px hover:shadow-xl hover:border-white/20; }
@media (hover: none) { .card-lift:hover { transform: none; } }
```
- **Suggested LexFlow placement**: every feature card on the landing.
- **Effort**: small.

### D9. Gradient-text H1 with inline accent span
- **Where in F1 docs**: `styles/docs.css:804-822`; usage `app/home.jsx:31-35`.
- **What it does**: the home headline uses `background: linear-gradient(180deg, #fff 0%, #d0c8ff 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;` for a soft white-to-lavender fade. A nested `.accent` span overrides the gradient with `linear-gradient(120deg, #a29bfe, #6c5ce7 55%, #3385ff)` so "real-time" pops in three colours.
- **Why it's good**: gives a hero a "designed" feel without animation; the nested gradient is the cheap trick that makes it look bespoke.
- **Tailwind / framer-motion translation**:
```tsx
<h1 className="bg-gradient-to-b from-white to-purple-200 bg-clip-text text-6xl font-semibold leading-[1.02] tracking-[-0.035em] text-transparent">
  Legal flow for <span className="bg-gradient-to-r from-violet-300 via-purple-500 to-blue-400 bg-clip-text text-transparent">Spanish legislation</span>.
</h1>
```
- **Suggested LexFlow placement**: hero headline.
- **Effort**: small.

### D10. Live status pill with pulsing dot
- **Where in F1 docs**: `styles/docs.css:1467-1481`; usage `app/home.jsx:72-76`.
- **What it does**: `.pill-live` colours a pill green; `.pill-dot` is a 6 px circle with `box-shadow: 0 0 6px currentColor` (glow). The dot loops `@keyframes pulse-dot` — opacity 1 → 0.4 → 1 over 1.8 s.
- **Why it's good**: a 30-byte way to say "this is live". Pairs nicely with a "site live · v0.4.2" meta-strip under the CTA.
- **Tailwind / framer-motion translation**: define `@keyframes pulse-dot` in globals; `<span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-mono text-emerald-400"><span className="h-1.5 w-1.5 animate-[pulse-dot_1.8s_infinite] rounded-full bg-current [box-shadow:0_0_6px_currentColor]" />Site live</span>`.
- **Suggested LexFlow placement**: hero meta strip and the "data freshness" indicator on the dashboards section.
- **Effort**: small.

### D11. Gradient-bordered CTA strip with glow shadow
- **Where in F1 docs**: `styles/docs.css:1037-1062`.
- **What it does**: a full-width "ready to start?" card with `background: linear-gradient(135deg, rgba(108,92,231,.12), rgba(51,133,255,.06))`, a 1 px purple border, and `box-shadow: 0 0 0 1px rgba(108,92,231,.35), 0 12px 40px rgba(108,92,231,.25)` (combined inner ring + outer glow). The shadow is the part that sells it.
- **Why it's good**: gives the closing CTA visual primacy without a busy illustration.
- **Tailwind / framer-motion translation**:
```tsx
<section className="mt-16 flex items-center justify-between gap-7 rounded-2xl border border-purple-500/25 bg-[linear-gradient(135deg,rgba(108,92,231,.12),rgba(51,133,255,.06))] p-8 shadow-[0_0_0_1px_rgba(108,92,231,.35),0_12px_40px_rgba(108,92,231,.25)]">
  …
</section>
```
- **Suggested LexFlow placement**: end-of-page "Try LexFlow" CTA above the footer.
- **Effort**: small.

### D12. Eyebrow + bar pattern for section labels
- **Where in F1 docs**: `styles/docs.css:791-803, 873-896`; usage everywhere on the home (`// Knowledge graph`, `// Meet the agents`, …).
- **What it does**: every section starts with a 12 px uppercased, wide-tracked purple eyebrow preceded by a 24 px × 1 px gradient bar (`linear-gradient(90deg, purple, transparent)`). The eyebrow text uses a `//` comment-style prefix to nod to source code aesthetics.
- **Why it's good**: gives long pages a strong rhythm; the `//` prefix is a tiny brand signature.
- **Tailwind / framer-motion translation**: `<p className="mb-4 inline-flex items-center gap-2.5 text-[11.5px] font-semibold uppercase tracking-[0.18em] text-purple-300"><span className="h-px w-6 bg-gradient-to-r from-purple-400 to-transparent" />// Search Spanish law</p>`.
- **Suggested LexFlow placement**: above each landing section heading.
- **Effort**: small.

### D13. Tag chips as Obsidian-style filter buttons
- **Where in F1 docs**: `styles/docs.css:714-741, 200-242`; usage `app/components.jsx:368-381`.
- **What it does**: every article shows a row of pill-shaped tag chips under the title; click → opens graph overlay filtered by that tag. Search suggestions reuse the same pill with a usage-count badge appended (`stt-count`).
- **Why it's good**: cohesive visual language between article header, search dropdown, and graph filter — one chip pattern, three purposes.
- **Tailwind / framer-motion translation**: a single `<Chip>` component with `data-count` optional slot; hover: `border-purple-400/45 bg-purple-500/8 text-purple-200`.
- **Suggested LexFlow placement**: docs articles and the dashboards-filter section of the landing demo.
- **Effort**: small.

### D14. Print-mode hard reset
- **Where in F1 docs**: `styles/docs.css:2062-2138`.
- **What it does**: `@media print` strips the background atmosphere, hides every chrome element (topnav, sidebars, TOC, footer, CTA strips, graph), forces black-on-white text, removes gradient text fills (`-webkit-text-fill-color: #000`), and applies `page-break-inside: avoid` to code blocks, tables, callouts and figures.
- **Why it's good**: turning a doc page into a printable PDF "just works". For a legal product, this matters disproportionately.
- **Tailwind / framer-motion translation**: copy the rules verbatim into `index.css`; Tailwind's print: prefix can layer on top but a global stylesheet is cleaner here.
- **Suggested LexFlow placement**: site-wide once the article/law-text views exist (not the landing).
- **Effort**: small.

### D15. Prev/next page footer cards
- **Where in F1 docs**: `app/components.jsx:399-427`; styles `styles/docs.css:1140-1177`.
- **What it does**: every article ends with a two-column grid; left card has a `← Previous` eyebrow and the prior page title, right card mirrors it with `Next →` and right-aligned text. Empty side gets `visibility: hidden` so the grid stays even.
- **Why it's good**: classic but well-executed — the eyebrow uses the same mono uppercase treatment as elsewhere, so it feels native.
- **Tailwind / framer-motion translation**: a flexbox `<nav>` with two `<a className="card-lift block rounded-xl border border-white/10 bg-white/[.02] p-4">` blocks; reuse `card-lift` from D8.
- **Suggested LexFlow placement**: docs/article view.
- **Effort**: small.

---

## Patterns the docs site nails

- **One motion budget, applied consistently.** Nearly every interactive surface uses `cubic-bezier(0.2,0,0,1)` and durations between 120 ms and 180 ms. Nothing animates for animation's sake.
- **Tokens-first CSS.** `styles/tokens.css` defines colours, spacing, type and shadows once; `docs.css` only consumes them. Replicating the look in Tailwind = porting tokens to `theme.extend` and the rest follows.
- **Touch and print are first-class.** `@media (hover: none)` neutralises sticky lifts, `@media print` strips chrome. Most landing pages skip both.
- **Single source of truth for nav, search, graph.** `app/nav.js`'s `window.PAGES` array drives the sidebar, search, prev/next, breadcrumb and graph. The data layer is one file.
- **The hero earns its space.** Gradient H1 + inline accent span + meta-strip + a live pill below the CTAs gives the eye three or four anchor points without any image.

## What NOT to port to a marketing landing

- **The three-pane shell (D2) and scroll-spy TOC (D3).** A marketing landing is short, top-to-bottom, and shouldn't make the visitor learn a docs UI just to read the pitch. Save these for `/docs`.
- **The full ⌘K command palette (D4).** Cool but premature on a landing — there's nothing to search yet. Show a screenshot of the palette as a feature instead of shipping the real one.
- **The graph teaser canvas.** Heavy JS (force-directed simulation, custom canvas tick loop) for a hero would tank LCP. Use a static SVG or a `<video poster>` of the graph if you want the look.
