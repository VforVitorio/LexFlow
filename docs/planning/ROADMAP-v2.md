# LexFlow — Roadmap v2

> **Estado (2026-06-05): superseded.** Las fases 0-5 + 8 + 9 ya están ✅ cerradas en `main` (release 0.36.x). La fuente de verdad actualizada vive en [`../../ROADMAP.md`](../../ROADMAP.md), que ahora refleja el estado real de cada fase + un sub-table de strands transversales (observability / rate-limit / keyring / MCP client / telemetry / i18n) que se shippearon en Sprints 9-14.
>
> Este documento queda como contexto histórico — sirvió para planificar los sprints, pero ya no se actualiza. Lee `ROADMAP.md` si solo quieres saber qué está hecho.

---

Documento vivo. Actualizado el 2026-05-23 tras consolidar las Fases 0-4 backend y el scaffold del frontend React.

El roadmap original en [`ROADMAP.md`](../../ROADMAP.md) está desfasado: lista todo como "Pendiente" cuando Fases 1-4 backend ya están cerradas. Esta v2 lo reemplaza y añade las fases 8 y 9, descubiertas mientras se diseñaba el producto para usuarios no técnicos.

---

## Estado consolidado

| Fase | Título | Estado |
|------|--------|--------|
| 0 | Fundación (repo, CI/CD, branch protection, dependabot) | Hecho |
| 1 | API base + parser legalize-es + búsqueda full-text | Hecho |
| 2 | Grafo de conocimiento — backend (NetworkX, PageRank, MCP tools) | Backend hecho |
| 3 | Chatbot — providers (Ollama, LM Studio, OpenAI, Anthropic, Google) + FastMCP server | Backend hecho |
| 4 | Dashboards Plotly (compliance + analytics) | Backend hecho |
| 5 | Frontend React (scaffold + wiring + features) | Scaffold listo, wiring en curso |
| 6 | Empaquetado y distribución como app de escritorio | Docker listo, instaladores pendientes |
| 7 | Búsqueda semántica y RAG | Planificado |
| **8** | **UX & Onboarding** (greeting, tour, wizard de modelos, accesibilidad guiada) | Nueva — planificada |
| **9** | **Personalización & MCP extensibility** (templates de usuario, MCP servers externos, `.mcpb` bundles) | Nueva — planificada |

---

## Principios de producto

Tres reglas que ordenan todas las decisiones futuras:

1. **Cero cuentas.** LexFlow se descarga, se abre y funciona. No hay registro, no hay login, no hay PII al servidor. El único dato personal es el **nombre de pila** que se pregunta en el primer arranque y se guarda en `localStorage` del navegador. Sirve para que el chat trate al usuario con su nombre — nada más. Borrable desde Ajustes.

2. **Doble distribución:**
   - **Vía terminal** para devs (mantenemos `uv sync && uv run python main.py`).
   - **Vía instalador** para todo el resto: `.exe` (Windows), `.dmg` (macOS), `.AppImage` (Linux). Doble clic, instala, abre, listo.

3. **Guía siempre que sea manual.** Si una acción no se puede automatizar todavía, no se le pide al usuario que "edite un JSON" — se le abre un wizard, un dialog o un tooltip que le explique paso a paso. Botones siempre que el backend pueda hacerlo solo; tutoriales sombreados (Reactour) cuando no.

---

## Fase 5 — Frontend React

Sub-epics ya creadas:

- **#71 — Fase 5A: Frontend boot y herramientas**
  - #65 — OpenAPI TS type generation
  - #66 — FastAPI mount del build de React (single-process producción)
  - #75 — `frontend-build` y `frontend-lint` jobs en CI
- **#72 — Fase 5B: Conectar frontend con backend**
  - #79 — wire `api.ts` laws/articles/versions/diff/references (cerrado por #95)
  - #80 — wire `api.ts` search
  - #81 — wire `api.ts` graph
  - #82 — `GET /api/v1/models` endpoint
  - #84 — SSE chat streaming + MCP tool loop
  - #85 — dashboards endpoint
  - #86 — `/sync/status` + `/sync/run`
- **#73 — Fase 5C: Polish, accesibilidad, performance**
  - #77 — Polish palette / logo / favicon / OG image
  - #87 — **Obsidian-style graph renderer** (D3-force + PIXI.js — ver [comentario](https://github.com/VforVitorio/LexFlow/issues/87#issuecomment-4525516729))
  - #88 — Toast system + global ErrorBoundary
  - #89 — Mobile bottom-tab navigation
  - #90 / #91 — Vitest + Playwright e2e tests
  - #94 — i18n con react-i18next
  - #108 — Editor de documentos legales con citas tipadas

Criterio de "Fase 5 hecha": las 7 páginas (Inicio, Explorador, LawDetail, Diff, Grafo, Chat, Dashboards) consumen el backend real, no mock, y pasan los e2e de Playwright en los flujos golden.

---

## Fase 6 — Distribución como app de escritorio

**Decisión técnica: Tauri 2 + PyInstaller sidecar.** Ver [`DISTRIBUTION.md`](DISTRIBUTION.md) para el análisis detallado de las 4 opciones evaluadas (PyInstaller-only, Tauri+sidecar, Electron+sidecar, BeeWare/Briefcase).

Resumen del stack elegido:

- **Shell**: Tauri 2 (Rust + system WebView). ~8-12 MB.
- **Backend**: FastAPI empaquetado con PyInstaller como sidecar (~35-40 MB). Tauri lo arranca via `externalBin` en `tauri.conf.json`.
- **Frontend**: el build de Vite (`frontend/dist/`) se sirve directamente desde Tauri.
- **Tamaño total del installer**: 50-70 MB antes de bundlear SDKs de LLMs. Comparado: Electron+sidecar ~200 MB.
- **Auto-update**: plugin oficial [Tauri Updater](https://v2.tauri.app/plugin/updater/) — firma `update.json` con keypair, app polea y aplica deltas.

Sub-tareas:

- Bundlear backend con PyInstaller (#38)
- Mount estático del SPA en FastAPI (#66) — sirve como fallback "modo navegador" para devs sin Tauri
- Configurar Tauri sidecar (issue nuevo)
- Code signing Windows: [Azure Trusted Signing](https://v2.tauri.app/distribute/sign/windows/) ~$10/mes
- Code signing macOS: Apple Developer Program $99/año
- Auto-updater wired
- GitHub Releases con artefactos por plataforma vía release-please (#40 ya cerrado)
- Landing page de descargas

Criterio de "Fase 6 hecha": un usuario en Windows 10/11, macOS 12+, o Ubuntu 22.04+ descarga el binario desde GitHub Releases, hace doble clic, instala, abre, y ya está en la pantalla de greeting.

---

## Fase 7 — Búsqueda semántica y RAG

Sin cambios respecto al plan original. Se desbloquea cuando Fase 5B esté lista (chat SSE + persistencia).

- Embeddings por artículo/sección (#42)
- Índice vectorial (decisión: FAISS local vs `sqlite-vec` vs Chroma — favorito: `sqlite-vec` para evitar deps cloud y empaquetar bien)
- `GET /api/v1/search/semantic?q=...` con reranking (#43)
- RAG pipeline integrado al chat vía MCP tool: la herramienta devuelve top-k chunks + scores + metadata
- Modelo de embeddings — decisión: `text-embedding-3-small` (multilingüe, cloud, $0.02/1M tokens) o `roberta-base-bne` del BSC (local, español puro). Probable: ambos opcionales.

---

## Fase 8 — UX & Onboarding (nueva)

**Objetivo:** LexFlow se siente nativo para alguien que nunca ha tocado una terminal. Onboarding completo, tutoriales contextuales, wizard de modelos, accesibilidad guiada.

Detalles completos en [`UX-ONBOARDING.md`](UX-ONBOARDING.md). Resumen:

1. **Greeting flow** (primer arranque)
   - Dialog modal: "¿Cómo te llamamos?" + checkbox "Recordar para tratarme con mi nombre".
   - Texto explícito: "Tu nombre se guarda solo en este equipo (`localStorage`). LexFlow no usa cuentas y nada se envía a un servidor."
   - Botón "Saltar" siempre visible. Cambio desde Ajustes → Personalización.
   - Inyectado en el system prompt del chat: `"El usuario se llama {name}. Trátalo con su nombre cuando suene natural."`

2. **Tutorial sombreado de primer arranque**
   - Stack: **Reactour v3** (`@reactour/tour`). MIT, ~8 KB, ARIA built-in, Tailwind-friendly. Ver [`UX-ONBOARDING.md`](UX-ONBOARDING.md) para el porqué de descartar Joyride/Onborda/Intro.js.
   - 6-7 pasos: layout, hotkeys (Ctrl+K), buscador, grafo, chat, ajustes. Skippable.
   - Re-launch desde Ajustes → Ayuda → Repetir tutorial.

3. **Wizard de configuración de modelos** (post-greeting, pre-chat)
   - Endpoint backend `GET /api/v1/system/profile` que devuelve RAM, CPU cores, GPU + VRAM, Apple Silicon flag, Ollama running, LM Studio running.
   - 3 pasos: Detect → Pick tier (radio pre-seleccionado por hardware) → Install + verify.
   - 4 tiers expuestos: **Free local — small**, **Best local — balanced**, **Best local — large**, **Best cloud — pay-per-use**.
   - Modelos por tier en [`MODELS.md`](MODELS.md).

4. **Guided actions**
   - Donde hoy se le pide al usuario "edita este archivo de config", reemplazar con un wizard. Ejemplo: añadir un MCP server custom → drag-and-drop de `.mcpb` o paste de JSON, no editar `mcp.json` a mano.
   - Cuando una acción es genuinamente manual (instalar Ollama), el wizard abre el navegador en la URL oficial + verifica al volver que la instalación funcionó.

5. **Accesibilidad**
   - Auditoría axe-core en CI (job nuevo `a11y`)
   - Focus visible siempre (`:focus-visible`), skip-link al `#main` (ya existe), ARIA labels en todos los interactivos
   - `prefers-reduced-motion` respetado (ya respetado en `index.css`)
   - Modo "alto contraste" como un tema más
   - Navegación por teclado: todos los hotkeys documentados en Ajustes → Atajos
   - Tamaño mínimo de fuente configurable (16px / 18px / 20px) desde Ajustes

6. **Ayuda contextual**
   - `?` button flotante en cada página → drawer con tips relevantes + link al tutorial
   - Tooltips en hover para iconos sin label visible

Criterio de "Fase 8 hecha":
- Usuario nuevo en Windows abre LexFlow → en <3 minutos tiene su nombre puesto, tutorial completado, modelo local descargado, y primera pregunta respondida en el chat. Sin tocar terminal ni JSON.
- Auditoría axe-core: 0 violations WCAG 2.1 AA.

---

## Fase 9 — Personalización & MCP extensibility (nueva)

**Objetivo:** El usuario puede traer sus propias plantillas (escritos de demanda, dictámenes, minutas) y conectar MCP servers externos sin tocar código. LexFlow se vuelve un cliente MCP de pleno derecho, no solo un servidor.

Detalles completos en [`MCP-INTEGRATION.md`](MCP-INTEGRATION.md). Resumen:

1. **Editor de documentos legales con plantillas user-uploaded** (#108, ya planificada en Fase 5C — aquí extendida)
   - Subida de plantillas: drag-and-drop de `.md`, `.docx`, `.pdf` → conversión a Markdown con `mcp-pandoc` o Docling
   - Placeholders detectados automáticamente: `{cliente}`, `{tribunal}`, `{fecha}`, `{LEY:X}` → formulario para rellenar al instanciar
   - Galería de plantillas con tags y búsqueda
   - **Plantillas comunitarias** (futuro): un repo `lexflow-templates` paralelo donde la comunidad PR-ea plantillas; LexFlow las puede importar con un click

2. **MCP client interno**
   - `fastmcp.Client` ya está en deps (FastMCP 2.x). Se añade soporte para consumir servers externos vía `MCPConfig`.
   - 4 servers shippeados por defecto:
     - `fetch` — fetch web (BOE, EUR-Lex, jurisprudencia)
     - `filesystem` — scoped a una carpeta `Documents/LexFlow` que el usuario elige en primer arranque (native folder picker)
     - `mcp-pandoc` — conversión PDF/DOCX/HTML/MD
     - `boe-mcp` — queries directas al BOE
   - Cada server: stdio, sin cuenta ni API key requeridas.

3. **Bring-your-own MCP**
   - Settings → MCP Servers → "Añadir server"
   - 3 modos: paste registry slug (`@modelcontextprotocol/server-foo`), drop `.mcpb` bundle, paste JSON (mismo schema que `claude_desktop_config.json` — portable entre Claude Desktop y LexFlow)
   - Persistido en `%APPDATA%/LexFlow/mcp.json` (no en el bundle de la app)
   - Por-tool consent prompt en primera invocación con "Recordar para esta sesión" — no consent fatigue pero nunca silent-grant para destructive tools

4. **`.mcpb` bundle support**
   - El formato oficial de Anthropic para extension bundles (Desktop Extensions)
   - LexFlow desempaqueta `.mcpb` y registra el server. Compatible con cualquier `.mcpb` que ya funcione en Claude Desktop

Criterio de "Fase 9 hecha":
- Usuario sube una plantilla `escrito-demanda.docx` → aparece en su galería → la instancia con el formulario → el resultado tiene citas a leyes resueltas via `{LEY:BOE-A-2018-16673}` → exportar a DOCX
- Usuario instala un `.mcpb` externo (e.g., calendar MCP) → aparece en el chat → permission prompt → invocación

---

## Documentos relacionados

- [`UX-ONBOARDING.md`](UX-ONBOARDING.md) — greeting, tour, wizard, accesibilidad
- [`MODELS.md`](MODELS.md) — recomendación de modelos por tier de hardware
- [`MCP-INTEGRATION.md`](MCP-INTEGRATION.md) — registry, servers, `.mcpb`, FastMCP client
- [`DISTRIBUTION.md`](DISTRIBUTION.md) — Tauri + PyInstaller sidecar, code signing, auto-update
- [`INSTALL.md`](INSTALL.md) — guía de instalación para usuario final
- [`ACCESSIBILITY.md`](ACCESSIBILITY.md) — principios, checklist WCAG 2.1, auditoría CI

---

> Este roadmap es un documento vivo. Cualquier cambio sustantivo debe venir acompañado de PR + actualización de las milestones de GitHub.
