# f1stratlab-web — animation & interaction scout for the LexFlow landing

**Source**: `C:/Users/victo/Desktop/Documents/Cuarto Año/TFG/f1stratlab-web/`
**Scope**: identify motion / layout / interaction patterns we can adapt to the LexFlow marketing landing (React 18 + Tailwind 3, optional framer-motion).
**Date**: 2026-05-23.

---

### F1. Gradient-clip headline with accent split
- **Where in f1stratlab-web**: `landing.css:237-253` (`.hero h1`, `.hero h1 .accent`) and `components/App.jsx:188-191`.
- **What it does**: the H1 itself is a transparent text painted by two gradients. The base words use a vertical white-to-lilac gradient (180 deg, `#ffffff → #d6d0ff`); the second line gets a wide diagonal accent gradient (`#a29bfe → #6c5ce7 → #3385ff`). Combined with `letter-spacing:-0.035em` and a `clamp(44px, 7.6vw, 96px)` size, the headline reads as one continuous beam of light rather than flat text.
- **Why it's good**: gives the hero a premium, "designed not templated" feel without any motion. The split between calm and accent gradients lets the line carry hierarchy by colour, not by font-weight tricks.
- **Tailwind / framer-motion translation**:
  ```tsx
  <h1 className="text-[clamp(44px,7.6vw,96px)] leading-[1.02] tracking-[-0.035em] font-semibold">
    <span className="bg-gradient-to-b from-white to-indigo-200 bg-clip-text text-transparent">
      Spanish law,
    </span>
    <br/>
    <span className="bg-[linear-gradient(120deg,#a29bfe,#6c5ce7_60%,#3385ff)] bg-clip-text text-transparent">
      navigated like a graph.
    </span>
  </h1>
  ```
- **Suggested LexFlow placement**: hero H1. Use indigo + slate gradients instead of purple/blue.
- **Effort**: small.

### F2. Halo + masked grid behind the hero
- **Where in f1stratlab-web**: `landing.css:213-234` (`.hero-halo`, `.hero-grid-lines`) and `colors_and_type.css:65` (`--grad-hero`).
- **What it does**: two pointer-events-none absolute layers under the hero copy. Layer 1 is a 120%×80% radial gradient at the top centre (`rgba(108,92,231,0.28) → transparent`) acting as a soft halo. Layer 2 is a 64 px × 64 px grid built from two `linear-gradient` background images, then faded with a `mask-image: radial-gradient(...)` so the grid only appears in the central oval and dissolves to the edges.
- **Why it's good**: gives the page depth without an image asset. The masked grid hints at "data / structure / lattice" — perfect resonance for a legal-graph product.
- **Tailwind / framer-motion translation**:
  ```tsx
  <section className="relative overflow-hidden">
    <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_120%_80%_at_50%_0%,rgba(99,102,241,0.28),transparent_70%)]"/>
    <div className="absolute inset-0 -z-10 [background:linear-gradient(to_right,rgba(255,255,255,.035)_1px,transparent_1px)_0_0/64px_64px,linear-gradient(to_bottom,rgba(255,255,255,.035)_1px,transparent_1px)_0_0/64px_64px] [mask-image:radial-gradient(ellipse_90%_70%_at_50%_40%,black_30%,transparent_80%)]"/>
    {/* hero content */}
  </section>
  ```
- **Suggested LexFlow placement**: hero and the dashboards section.
- **Effort**: small.

### F3. Scroll-spy underline that slides between nav links
- **Where in f1stratlab-web**: `landing.css:63-74` (`.nav-bar`) + `components/App.jsx:28-63` and `App.jsx:122-136`.
- **What it does**: an `IntersectionObserver` with `rootMargin:'-45% 0px -45% 0px'` picks whichever section's midline crosses the viewport mid-line. A single absolutely-positioned `span.nav-bar` then `transition`s its `left` and `width` (cubic-bezier `0.2,0,0,1`, 320 ms) to slide under the active link, with a soft glow box-shadow.
- **Why it's good**: silent affordance — you always know where you are on the page without ugly border-bottoms toggling on/off. The single moving bar costs less than per-link transitions.
- **Tailwind / framer-motion translation**:
  ```tsx
  const [rect, setRect] = useState({left: 0, width: 0, opacity: 0});
  // useEffect: IntersectionObserver -> measure active link, setRect
  <nav className="relative flex gap-7">
    {sections.map(s => <a key={s.id} ref={r => refs.current[s.id]=r} ...>{s.label}</a>)}
    <motion.span
      className="absolute -bottom-3 h-0.5 rounded bg-indigo-300 shadow-[0_0_8px_rgba(165,180,252,0.45)]"
      animate={rect}
      transition={{type: 'spring', stiffness: 380, damping: 36}}
    />
  </nav>
  ```
- **Suggested LexFlow placement**: top nav across the landing.
- **Effort**: medium (state + observer + measure).

### F4. Reveal-on-scroll using a single CSS class
- **Where in f1stratlab-web**: `landing.css:320-322` (`.reveal`, `.reveal.in`) and `components/App.jsx:85-94`.
- **What it does**: every `<section>` gets `.reveal` added on mount (`opacity:0; transform:translateY(24px)`). An IntersectionObserver with `threshold:0.12` and `rootMargin:'-40px 0px'` adds `.in` once, triggering a 900 ms cubic-bezier ease into final position. No library, no per-element JSX clutter.
- **Why it's good**: cheap, framework-agnostic, and the slow 900 ms easing reads as "calm" not "snappy" — exactly the tone LexFlow needs.
- **Tailwind / framer-motion translation**: easier with framer-motion's `whileInView`:
  ```tsx
  <motion.section
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-40px' }}
    transition={{ duration: 0.9, ease: [0.2, 0, 0, 1] }}
  >
    {children}
  </motion.section>
  ```
- **Suggested LexFlow placement**: every section below the hero — feature cards, dashboards preview, FAQs.
- **Effort**: small.

### F5. Primary CTA with layered shadow + lift
- **Where in f1stratlab-web**: `landing.css:138-160` (`.btn`, `.btn-primary`).
- **What it does**: the primary button stacks two shadows — a 1 px ring (`0 0 0 1px rgba(162,155,254,0.25)`) plus a soft drop-glow (`0 8px 24px rgba(108,92,231,0.35)`). On hover the ring strengthens, the glow grows to `0 12px 32px`, and the button lifts via `translateY(-1px)`. On active it `scale(0.98)`. All in 180 ms.
- **Why it's good**: feels tactile — the button feels physical without resorting to neumorphic gimmicks. The faint ring keeps it readable on dark backgrounds.
- **Tailwind / framer-motion translation**:
  ```tsx
  <a className="inline-flex items-center gap-2 h-10 px-4 rounded-[10px] bg-indigo-600 text-white text-sm font-medium
                shadow-[0_0_0_1px_rgba(165,180,252,0.25),0_8px_24px_rgba(79,70,229,0.35)]
                transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)]
                hover:-translate-y-px hover:bg-indigo-500
                hover:shadow-[0_0_0_1px_rgba(165,180,252,0.4),0_12px_32px_rgba(79,70,229,0.45)]
                active:scale-[0.98]">
    Open LexFlow
  </a>
  ```
- **Suggested LexFlow placement**: hero CTA and "Get started" footer CTA.
- **Effort**: small.

### F6. Pulsing "live" pill with bar accent
- **Where in f1stratlab-web**: `landing.css:163-181` (`.pill`, `.pill-live`, `@keyframes pulse-dot`) and the eyebrow `.eyebrow-bar` at `184-195`.
- **What it does**: a 6 px round dot inside the pill breathes from opacity 1 → 0.4 → 1 over 1.8 s. The pill itself is a rounded 999 px chip with a translucent background, currentColor text and a 28%-opacity border in the same hue. Eyebrows pair a uppercase mono caption with a 24 px hairline gradient that fades into the page.
- **Why it's good**: a single chip communicates "this content is fresh / interactive" without an animation library; the eyebrow-bar adds editorial polish above each section title.
- **Tailwind / framer-motion translation**:
  ```tsx
  <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-medium
                   bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_currentColor] animate-[pulse_1.8s_ease-in-out_infinite]"/>
    Live · v0.1
  </span>
  ```
  Eyebrow bar = `<span className="w-6 h-px bg-gradient-to-r from-transparent to-indigo-400"/>`.
- **Suggested LexFlow placement**: hero status pill ("Open source · v0.1"), section eyebrows ("Architecture", "Dashboards").
- **Effort**: small.

### F7. Card hover that elevates a stat tile (cross-fade of two shadows)
- **Where in f1stratlab-web**: `landing.css:198-210` (`.card`, `.card:hover`).
- **What it does**: resting card uses `--shadow-card` (10 px soft drop) + an inset `1px` highlight. On hover the background brightens (`bg-3 → bg-4`), the border deepens, and shadow swaps to `--shadow-elev` (40 px drop, 0.45 alpha). All transitions ride the same 180 ms `cubic-bezier(0.2,0,0,1)` curve used by the buttons — visual consistency.
- **Why it's good**: cards feel like they "wake up" under the cursor; the inset highlight keeps them legible at any state. The shared easing curve unifies the feel across the entire site.
- **Tailwind / framer-motion translation**:
  ```tsx
  <div className="group rounded-2xl border border-white/10 bg-slate-900 p-6
                  shadow-[0_2px_10px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.06)]
                  transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)]
                  hover:border-white/20 hover:bg-slate-800
                  hover:shadow-[0_12px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]">
    {/* card content */}
  </div>
  ```
- **Suggested LexFlow placement**: feature grid ("Laws API", "Knowledge graph", "Chatbot", "Dashboards"). Use one easing curve site-wide.
- **Effort**: small.

### F8. Detail panel that animates in on tab change
- **Where in f1stratlab-web**: `components/Sections.jsx:114-201` (`#models .models-detail` with `@keyframes detailIn`) and the `model-row::before` scale-Y bar at `:126-136`.
- **What it does**: a long left column of rows, a sticky right column with the active item's detail. Hovering a row sets `active=i`; the right panel re-keys (React `key={active}`) so `animation: detailIn 0.45s` (opacity + 8 px y) replays. The active row grows a 3 px purple vertical accent bar via `transform: scaleY(0 → 1)`, indents 4 px, and its number gets brighter — multiple coordinated changes on a single hover.
- **Why it's good**: turns a static feature matrix into an explorable mini-product. The hover-driven highlight scales — works on a list of 4 or 14.
- **Tailwind / framer-motion translation**:
  ```tsx
  const [active, setActive] = useState(0);
  <div className="grid grid-cols-[1fr_380px] gap-12">
    <ul className="border-t border-white/5">
      {items.map((it, i) => (
        <li key={it.id} onMouseEnter={() => setActive(i)}
            className={`group relative grid grid-cols-[32px_1fr_1fr_100px] gap-5 py-4 border-b border-white/5
                        ${i === active ? 'bg-gradient-to-r from-indigo-500/10 to-transparent' : ''}`}>
          <span className={`absolute -left-6 inset-y-0 w-[3px] origin-center bg-indigo-400 transition-transform duration-300
                            ${i === active ? 'scale-y-100' : 'scale-y-0'}`}/>
          {/* idx, name, algo, value */}
        </li>
      ))}
    </ul>
    <motion.aside key={active} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
                  className="sticky top-24 rounded-2xl border border-white/10 bg-slate-900 p-8">
      {/* details for items[active] */}
    </motion.aside>
  </div>
  ```
- **Suggested LexFlow placement**: a "What's inside" section: list LexFlow's API endpoints / graph features / chatbot tools on the left, detail card on the right.
- **Effort**: medium.

### F9. Scroll-pinned narrative with progress rail and band-keyed scenes
- **Where in f1stratlab-web**: `components/ScrollPinned.jsx:1-200`. Uses a tall section, manual scroll math (`-rect.top / scrollable`), an `ease` cubic, and `bandProg(start, end)` to compute per-phase progress. Side rail shows percentage + three tick marks lighting up at 0.28, 0.48, 0.72. SVG scene + caption swap based on which band is active. Falls back gracefully via `prefers-reduced-motion`.
- **Why it's good**: storytelling without a video — the user *scrolls* to discover the system. The progress rail tells them how much narrative is left, which kills the "is this going to end?" anxiety.
- **Tailwind / framer-motion translation**: framer-motion's `useScroll({ target, offset })` + `useTransform` map progress 0-1 to motion. Lighter version:
  ```tsx
  const ref = useRef(null);
  const {scrollYProgress} = useScroll({target: ref, offset: ['start start', 'end end']});
  const carScale = useTransform(scrollYProgress, [0, 0.3], [0.06, 1]);
  <section ref={ref} className="relative h-[400vh]">
    <div className="sticky top-0 h-screen flex items-center justify-center">
      <motion.svg style={{scale: carScale}}>{/* anchor element */}</motion.svg>
      <ProgressRail progress={scrollYProgress}/>
    </div>
  </section>
  ```
- **Suggested LexFlow placement**: a single "How LexFlow works" scrollytelling section — Markdown source → parser → graph → API → chatbot. Anchor element is the legalize-es logo or a stylised codex.
- **Effort**: large.

### F10. Typewriter + streaming chat (typing → thinking → streaming → chips)
- **Where in f1stratlab-web**: `components/Sections.jsx:339-579` (`RagSection` + `@keyframes ragBlink`, `ragDot`, `chipIn`, `ragIconPulse`).
- **What it does**: a four-phase scripted demo. (1) user query types in 28 ms/char with a blinking caret. (2) "thinking" dot animation for 900 ms. (3) the FIA-rule answer streams in 14 ms/char. (4) article citations pop in as chips with a slight scale + glow ring (`chipIn` keyframe). Cycle restarts on a long delay. Triggered only when the section is in view.
- **Why it's good**: shows the product instead of describing it. The deliberate slow typewriter conveys "this is an AI reasoning over real docs", and the pop-in chips give the eye a reward at the end of each cycle.
- **Tailwind / framer-motion translation**: keep the imperative timer model — framer-motion isn't a good fit here. Use `useEffect` with a queue of `setTimeout`s. Animate chips with `motion.span` + `initial={{opacity:0, y:8, scale:0.92}} animate={{opacity:1, y:0, scale:1}}`.
- **Suggested LexFlow placement**: chatbot teaser section — type a citizen question ("¿Cuándo prescribe el delito de hurto?"), stream a short answer, pop in `Art. 131 CP` chips.
- **Effort**: medium-large.

### F11. Code-block chrome with copy button and syntax tints
- **Where in f1stratlab-web**: `landing.css:324-352` + `components/Sections.jsx:715-738` (`#install .code-copy-btn`).
- **What it does**: a "terminal" chrome — three dots, a mono label, optional pill, rounded top corners. Inside, syntax is hand-tinted with classes `c-comment`, `c-cmd`, `c-str`, `c-flag` (no Prism, no shiki, no JS). A small copy button transitions on hover and `scale(0.94)` on press.
- **Why it's good**: makes install / API examples feel canonical without dragging in a syntax-highlighter dependency. The macOS-style chrome is instantly readable.
- **Tailwind / framer-motion translation**:
  ```tsx
  <div className="rounded-xl border border-white/10 overflow-hidden">
    <div className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-800 border-b border-white/10">
      <span className="w-2.5 h-2.5 rounded-full bg-white/15"/><span className="w-2.5 h-2.5 rounded-full bg-white/15"/><span className="w-2.5 h-2.5 rounded-full bg-white/15"/>
      <span className="ml-2 font-mono text-xs text-slate-400">install.sh</span>
      <button onClick={copy} className="ml-auto w-7 h-7 rounded-md text-slate-400 hover:bg-white/5 hover:text-white active:scale-95 transition">…</button>
    </div>
    <pre className="bg-slate-950 p-5 font-mono text-[13.5px] leading-7 overflow-x-auto">
      <span className="text-slate-500"># install</span>{'\n'}
      <span className="text-indigo-300">$</span> uv tool install lexflow
    </pre>
  </div>
  ```
- **Suggested LexFlow placement**: "Get started" / install section, and an "API example" card.
- **Effort**: small.

### F12. "About author" hover card with translateY + tint
- **Where in f1stratlab-web**: `components/Sections.jsx:1166-1265` (`AboutAuthor`, `.about-card`).
- **What it does**: round avatar with a 4 px purple soft ring (`box-shadow: 0 0 0 4px rgba(108,92,231,0.08)`), short bio, three icon link "cards" laid out horizontally. Each card has its own icon SVG; on hover it lifts 1 px, picks up a purple border and a 8%-opacity purple wash. 180 ms transition.
- **Why it's good**: makes the maintainer feel human and reachable without taking over the page. Same hover idiom as F5/F7 — consistency across the site.
- **Tailwind / framer-motion translation**:
  ```tsx
  <a className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-[10px] bg-slate-800 border border-white/10
                text-slate-300 text-[13px] font-medium
                transition-all duration-200 hover:-translate-y-px hover:border-indigo-400 hover:text-white
                hover:bg-indigo-500/10">
    <Icon className="text-indigo-300"/> GitHub
  </a>
  ```
- **Suggested LexFlow placement**: "Maintainers" strip just above the footer — VforVitorio + Santisoutoo with portfolio / GitHub / LinkedIn buttons.
- **Effort**: small.

### F13. Video demo card that pulses borders on hover and play
- **Where in f1stratlab-web**: `components/Sections.jsx:1010-1050` (`#demo .demo-video-card` + `is-hovered` + `is-playing` classes).
- **What it does**: a chromed video card. At rest it has the standard card shadow; on `:hover` border tints purple, soft glow appears (`--shadow-glow`), card lifts 2 px. When playing, a brighter ring plus a 24 px purple drop-shadow flares. A 1 px gradient hairline at the top fades in via `::before`.
- **Why it's good**: signals "click me to start" without overlaying a giant play button. Once playing, the card feels "alive" without distracting.
- **Tailwind / framer-motion translation**: track `isPlaying` state on the `<video>` element's `onPlay`/`onPause`, swap class names. Use `peer`/`group` classes if you prefer pure CSS.
- **Suggested LexFlow placement**: a demo video section (graph explorer screencast). Currently LexFlow doesn't have one; once a 30 s capture exists, this card is the right wrapper.
- **Effort**: small (if we already have a recording) / medium (record + edit).

### F14. Mobile hint nudge on horizontally-scrollable hero viz
- **Where in f1stratlab-web**: `components/HeroVariants.jsx:240-282` (the `<style>` injected at the end of `AgentGraphViz`).
- **What it does**: on screens < 760 px, the hero diagram becomes horizontally scrollable; a 32 px purple circle with `→` appears at bottom-right and runs `heroVizHintNudge 1.4s ease-in-out 2` (two nudges right), then `heroVizHintFade 0.55s ease 3s forwards` to disappear. Respects `prefers-reduced-motion` (faster fade only).
- **Why it's good**: solves the "users on phones don't realise this scrolls" problem with one small, polite hint that goes away forever.
- **Tailwind / framer-motion translation**: keep CSS — framer-motion is overkill. Drop the keyframes inline once via `globals.css`, then on the carousel:
  ```tsx
  <div className="md:hidden relative overflow-x-auto pb-2 [scrollbar-width:thin]
                  after:content-['→'] after:absolute after:right-3.5 after:bottom-4
                  after:w-8 after:h-8 after:rounded-full after:bg-indigo-500/80
                  after:text-white after:text-center after:leading-8
                  after:shadow-[0_0_18px_rgba(99,102,241,0.55)]
                  after:animate-[hintNudge_1.4s_ease-in-out_2,hintFade_0.5s_ease_3s_forwards]">
  ```
- **Suggested LexFlow placement**: the law-graph preview SVG on phones — same pattern, same affordance.
- **Effort**: small.

---

## Overall patterns

- **Single design ramp, used everywhere**: f1stratlab-web defines one set of CSS custom properties (background ramp `--bg-0..5`, FG ramp `--fg-1..4`, purple scale 50..900, semantic tokens) and *every* component reads from it. No off-palette colour appears anywhere. LexFlow should adopt this discipline before writing any landing CSS.
- **Motion is calm, not assertive**: every transition rides the same `cubic-bezier(0.2, 0, 0, 1)` over 180–450 ms; pulses are 1.4–1.8 s; scroll reveal is a slow 900 ms. Nothing whips. The one place it gets fast is per-character typing (14–28 ms) where slowness would feel broken.
- **Typography hierarchy by gradient + tracking, not weight**: H1s use `font-weight:600` and a `letter-spacing:-0.035em` plus a clip-path gradient. Subheads carry their own gradient on the accent word. This avoids the trap of stacking 700/800/900 weights to fake hierarchy.
- **SVG-first over canvas / WebGL**: every diagram (architecture, lap chart, circuit, scrollytelling car) is hand-built SVG with linear/radial gradient defs and `mask-image`. Zero runtime libraries beyond React 18 UMD itself. LexFlow can keep its bundle small by following this rule.
- **Editorial density**: each section pairs an eyebrow (uppercase 12 px mono, 0.18 em tracking, purple) + a short H2 + one-sentence dek + the actual content. The eyebrow + bar device is repeated everywhere — it's the site's signature.

## What NOT to port

- **Racing-themed colour accents and chrome**: the tire-soft red `#ff2d3a`, tire-medium amber, the pulsing green "live" pill, and the F1-front SVG car. LexFlow is "calm legal infrastructure" — replace red/amber/green with neutral or indigo states and drop any motorsport iconography.
- **Aggressive scrollytelling and the per-lap ticker**: the pinned section with the car zooming in, telemetry rays radiating, and the dashboard's 900 ms lap incrementer are too cinematic for legal tooling. Adopt F9's *technique* (scroll-pinned, progress rail, band scenes) but make the anchor element a static codex / graph node, not a moving vehicle.
- **The `tweaks-panel` floating in production**: it's a dev-only edit-mode dock (postMessage protocol). Strip it on the LexFlow build — it leaks UI state and is irrelevant to public visitors.
