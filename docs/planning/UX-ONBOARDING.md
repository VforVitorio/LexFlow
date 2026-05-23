# UX & Onboarding (Fase 8)

Plan detallado para que LexFlow sea utilizable por alguien que nunca ha tocado una terminal. Cubre greeting, tutorial sombreado, wizard de modelos, guided actions y accesibilidad.

---

## 1. Greeting flow (primer arranque)

### Comportamiento

Al primer launch (no hay `lexflow:user:name` en `localStorage`):

1. Aparece un dialog modal sobre la página `/inicio`.
2. Contenido:
   - **Título:** "¡Bienvenido a LexFlow!"
   - **Texto principal:** "¿Cómo prefieres que te llamemos?"
   - **Input de texto** con placeholder "Tu nombre"
   - **Helper text gris pequeño:** "Se guarda solo en este equipo. LexFlow no tiene cuentas y nada se envía a un servidor."
   - **Botones:** "Continuar" (primario), "Saltar" (ghost)
3. Al pulsar Continuar con texto:
   - `localStorage.setItem('lexflow:user:name', value.trim())`
   - Toast de confirmación: `"Hola, {name}. Recuerda que puedes cambiarlo desde Ajustes → Personalización."`
4. Al pulsar Saltar:
   - `localStorage.setItem('lexflow:user:name', '')` (string vacío, para no preguntar de nuevo)
   - Sin toast.

### Inyección en el chat

El system prompt del chat incluye condicionalmente:

```text
{{#if user_name}}
El usuario se llama {{ user_name }}. Trátalo con su nombre cuando suene natural,
sin abusar. No es necesario que lo uses en cada respuesta.
{{/if}}
```

Cargado desde la frontend via `useUserName()` hook y pasado en el body del POST a `/api/v1/chat/stream`.

### Ajustes

- Ruta: Ajustes → Personalización
- Campos:
  - "Nombre" (text input, `lexflow:user:name`)
  - "Borrar mi nombre" (botón secundario → `localStorage.removeItem(...)`)
- Texto recurrente: "Recuerda: LexFlow no usa cuentas. Tu nombre nunca se envía al servidor; solo se inyecta en el prompt del chat que lances."

### Issue tracking

- Issue: `[Feature]: Greeting flow sin cuenta, solo nombre en localStorage` — Fase 8, area: frontend.

---

## 2. Tutorial sombreado (Reactour v3)

### Decisión de framework

Evaluamos 6 frameworks (`react-joyride`, `Driver.js`, `Shepherd.js`, `Intro.js`, `Onborda`, `Reactour v3`). Elegimos **`@reactour/tour`** por:

| Criterio | Razón |
|---|---|
| Bundle | ~8 KB gzipped vs Joyride ~34 KB |
| License | MIT (Intro.js es **AGPL** — descartado) |
| A11y | ARIA configurable, focus management, RTL support |
| Tailwind-friendly | El popover renderiza JSX propio → metemos `<Card>` de shadcn directo |
| Mantenimiento | TypeScript-first rewrite (Reactour v3), modular (`@reactour/mask`, `popover`, `tour`) |
| Caveat | Comunidad más pequeña que Joyride. Edge cases con targets animados → manual `setCurrentStep` |

Segundo lugar: **Shepherd.js + `react-shepherd`** si necesitamos focus management más robusto (~25 KB).
Descartados: Joyride (a11y violations), Onborda (Next-centric), Intro.js (AGPL), Driver.js (wrappers no oficiales).

Fuente: ver `Agent` report en el PR de este roadmap.

### Pasos del tutorial inicial

Al completar el greeting, lanza el tour automáticamente. 6 pasos, cada uno targetea un selector ya existente:

| # | Selector | Mensaje |
|---|----------|---------|
| 1 | `[data-tour="brand"]` | "Bienvenido al panel principal. LexFlow está organizado en 7 áreas — aquí ves la actual." |
| 2 | `[data-tour="left-rail"]` | "El rail izquierdo es tu navegación. Pulsa `Ctrl+\\` para ocultarlo cuando necesites más espacio." |
| 3 | `[data-tour="command-palette-trigger"]` | "Pulsa `Ctrl+K` (o `⌘K` en Mac) para abrir la paleta de comandos. Es el atajo universal a cualquier página o ley." |
| 4 | `[data-tour="search-input"]` | "El buscador global indexa todo el corpus legal. Filtra por rango, estado o fecha." |
| 5 | `[data-tour="nav-graph"]` | "El grafo de conocimiento muestra cómo se referencian las leyes entre sí. Útil para mapear regulación cruzada." |
| 6 | `[data-tour="nav-chat"]` | "El chat puede consultar la API real y leer plantillas que subas. Vamos a configurar el modelo." |

Al cerrar el tutorial, lanza el **wizard de modelos** (sección 3).

### Re-launch

Ajustes → Ayuda → "Repetir tutorial" → `setTourOpen(true)` desde Zustand.

### Tutoriales contextuales (mini-tours)

Cada vez que el usuario entra por primera vez en una página avanzada (Grafo, Chat, Editor), se dispara un mini-tour de 2-3 pasos específico de esa página. Tracked en `localStorage` con flags `lexflow:tour:graph:seen`, `lexflow:tour:chat:seen`, etc.

### Issue tracking

- Issue: `[Feature]: Tutorial sombreado de primer arranque con Reactour v3`
- Sub-issue: `[Feature]: Mini-tours contextuales por página`

---

## 3. Wizard de configuración de modelos

### Detección de hardware

Endpoint backend **`GET /api/v1/system/profile`** que devuelve:

```json
{
  "total_ram_gb": 32,
  "available_ram_gb": 24,
  "cpu_cores_physical": 8,
  "cpu_cores_logical": 16,
  "has_nvidia_gpu": true,
  "vram_gb": 12,
  "is_apple_silicon": false,
  "platform": "Windows-10.0.26200",
  "ollama_running": true,
  "ollama_models": [{"name": "llama3.1:8b", "size_gb": 4.7}],
  "lmstudio_running": false
}
```

Implementación con `psutil` (RAM, CPU), `pynvml` (NVIDIA VRAM, graceful fail), `platform.machine()` (Apple Silicon), y `httpx` con timeout 500 ms contra `localhost:11434/` (Ollama) y `localhost:1234/v1/models` (LM Studio).

### UX: 3 pasos

**Paso 1 — Detect (auto, no input)**
- Muestra resumen del hardware con icons de psutil + nvidia + apple
- Pequeño "diagnóstico": "Detectado: 32 GB de RAM y una GPU NVIDIA con 12 GB de VRAM. Puedes correr modelos de hasta ~30B parámetros localmente."

**Paso 2 — Pick tier** (radio pre-seleccionado según hardware)

| Tier | Pre-selected when | Modelo | Coste |
|------|-------------------|--------|-------|
| Free local, small | `total_ram_gb < 12` | `llama3.2:3b` (~2 GB Q4) | Gratis |
| Best local, balanced | `12 ≤ total_ram_gb < 24` o VRAM ≥ 8 GB | `qwen2.5:7b` (~4.5 GB Q4) | Gratis |
| Best local, large | `vram_gb ≥ 16` o `total_ram_gb ≥ 32` Apple Silicon | `qwen2.5:32b` (~20 GB Q4) | Gratis |
| Best cloud, pay-per-use | Hardware bajo + sin Ollama | Claude Sonnet 4.6 (~$0.018 por 1k tokens Q&A) | API key del usuario |

Siempre se muestran los 4 — el usuario nunca queda "encerrado" en una opción. Justificación de modelos en [`MODELS.md`](MODELS.md).

**Paso 3 — Install + verify**
- Si elige local pero Ollama no está corriendo:
  - Botón "Instalar Ollama" → abre `https://ollama.com/download` en el navegador
  - Polling al `localhost:11434/` cada 5 s, máximo 5 min
  - Cuando responde, paso automáticamente a "Descargar modelo"
- Si Ollama está corriendo:
  - `POST /api/v1/models/pull` con el `model_name` → backend ejecuta `ollama pull` en streaming, frontend muestra progress bar
  - Una vez descargado, "Probar" → envía un prompt de 1 token al modelo → confirma green check
- Si elige cloud:
  - Form con el API key → POST a `/api/v1/models/test` que hace una petición vacía al provider para validar la key
  - Las API keys se guardan en `%APPDATA%/LexFlow/secrets.json` (cifrado con `keyring` Python lib en SO disponible)

### Skip

El wizard es skippable en cualquier momento ("Configurar más tarde"). Si no se completa, el chat muestra un banner "Configura un modelo para empezar" con CTA al wizard.

### Re-launch

Ajustes → Modelos → "Cambiar configuración" → reabre el wizard. También accesible desde el banner del chat.

### Issue tracking

- Issue: `[Feature]: Endpoint /api/v1/system/profile (psutil + pynvml + ollama/lmstudio probe)`
- Issue: `[Feature]: Wizard de configuración de modelos en 3 pasos`
- Issue: `[Feature]: Streaming /api/v1/models/pull para descargar modelos Ollama desde el wizard`
- Issue: `[Feature]: Guardar API keys de cloud providers con python-keyring`

---

## 4. Guided actions (reemplazar manual con botones)

### Principio

Cualquier acción que hoy requiere editar un archivo, ejecutar un comando, o entender un schema, se reemplaza por:

1. **Botón si el backend puede hacerlo.** Ejemplo: instalar un MCP server custom — drag-and-drop de `.mcpb`, no editar `mcp.json` a mano.
2. **Wizard si requiere input del usuario.** Ejemplo: añadir una plantilla con placeholders → editor visual de placeholders, no escribir `{cliente}` a mano.
3. **Tutorial sombreado si requiere acción externa al sistema.** Ejemplo: instalar Ollama → abrir URL + verificar al volver, no "lee la docs".

### Audit pendiente

Sub-issue para listar todos los lugares hoy "manuales" y proponer el equivalente guiado:

- [ ] Configurar MCP servers (hoy: editar `mcp.json` — futuro: drag `.mcpb` o paste JSON)
- [ ] Cambiar tema (hoy: ya es botón ✓)
- [ ] Sincronizar legalize-es (hoy: `git submodule update` — futuro: botón "Sincronizar corpus" → `POST /api/v1/sync/run`, ver #86)
- [ ] Importar plantillas (hoy: no existe — futuro: drag-and-drop con conversión via `mcp-pandoc`)
- [ ] Cambiar de provider de modelo (hoy: editar env vars — futuro: wizard reabrible)

### Issue tracking

- Issue: `[Refactor]: Audit de acciones manuales que deberían ser guiadas`

---

## 5. Accesibilidad (WCAG 2.1 AA)

Plan completo en [`ACCESSIBILITY.md`](ACCESSIBILITY.md). Resumen:

- Auditoría axe-core en CI (job nuevo `a11y`) que falla si hay nuevas violations
- Focus visible siempre (ya en `frontend/src/index.css`)
- Skip-link al `#main` (ya en `AppShell`)
- ARIA labels en todos los interactivos sin texto visible
- `prefers-reduced-motion` (ya respetado)
- Tamaño mínimo de fuente configurable (16/18/20 px)
- Modo "alto contraste" como tema más
- Documentación de hotkeys en Ajustes → Atajos
- Color contrast ≥ 4.5:1 en texto, ≥ 3:1 en componentes
- Validar con NVDA (Windows), VoiceOver (macOS) y Orca (Linux)

---

## 6. Ayuda contextual

- `?` button flotante en cada página (esquina inferior derecha) → drawer con:
  - Sección "Qué es esta página"
  - Sección "Atajos relevantes"
  - Botón "Volver a hacer el tutorial de esta página"
- Tooltips Radix UI en hover ≥500 ms para todos los iconos sin label visible

---

## Criterio de "Fase 8 hecha"

1. Un usuario en Windows 10/11 sin Python ni terminal: descarga el `.exe`, lo abre, completa el greeting, sigue el tutorial, configura un modelo local, hace una pregunta al chat — todo en **menos de 3 minutos**. Métricas se miden manualmente con grabaciones de pantalla.
2. Auditoría `axe-core` en CI: **0 violations WCAG 2.1 AA**.
3. Validación manual: NVDA + VoiceOver + Orca leen la app sin "elemento sin etiqueta" recurrente.

---

## Stack frontend para esta fase

Añadir a `frontend/package.json`:

```bash
npm install @reactour/tour
```

(`@reactour/mask` y `@reactour/popover` vienen como deps transitivas.)

Para tooltips: ya tenemos Radix vía shadcn/ui — `@radix-ui/react-tooltip`.

Para detección de hardware en frontend (fallback): `navigator.hardwareConcurrency` está estandarizado; `navigator.deviceMemory` solo en Chromium y rounded a powers of 2 con cap 8 GB. Usar solo como hint si el backend no responde — la fuente de verdad es siempre `GET /api/v1/system/profile`.

---

## Fuentes consultadas

- [@reactour/tour npm](https://www.npmjs.com/package/@reactour/tour)
- [Reactour v3 docs](https://docs.reactour.dev/)
- [React tour library benchmark 2026](https://usertourkit.com/blog/react-tour-library-benchmark-2026)
- [psutil documentation](https://psutil.readthedocs.io/)
- [Ollama API — list models](https://docs.ollama.com/api/tags)
- [Ollama Windows install docs](https://docs.ollama.com/windows)
- [navigator.deviceMemory — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory)
