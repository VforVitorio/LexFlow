# Cómo instalar LexFlow

Dos caminos: el fácil (instalador) y el técnico (terminal). Pick your fighter.

> **Este documento es de planificación.** Los instaladores aún no existen — están en la [Fase 6](ROADMAP-v2.md) del roadmap. El README de la raíz indica el estado real en el momento que se lee.

---

## Para usuarios finales (no técnicos)

### Windows

1. Ve a https://github.com/VforVitorio/LexFlow/releases
2. Descarga el archivo **`LexFlow_<versión>_x64-setup.exe`** (~70 MB)
3. Doble clic. Si Windows muestra "Windows protected your PC", pulsa "Más información" → "Ejecutar de todos modos" (estamos firmando con [Azure Trusted Signing](https://v2.tauri.app/distribute/sign/windows/), pero SmartScreen puede tardar en darnos reputación)
4. Instala con los defaults
5. Abre LexFlow desde el menú Inicio

LexFlow se actualiza solo cuando hay una versión nueva — verás un toast en la esquina con "Hay una nueva versión disponible, ¿actualizar ahora?".

### macOS

1. Descarga **`LexFlow_<versión>_aarch64.dmg`** (Apple Silicon M1/M2/M3/M4) o **`LexFlow_<versión>_x64.dmg`** (Intel)
2. Doble clic, arrastra LexFlow a `/Applications`
3. La primera vez, ábrelo con **clic derecho → Abrir** (no doble clic) para saltar el aviso de Gatekeeper. Después, doble clic normal.

> En el primer release tras el alta del Apple Developer Program la app irá notarizada y este paso ya no será necesario.

### Linux

**AppImage (universal):**

1. Descarga **`LexFlow_<versión>_amd64.AppImage`**
2. `chmod +x LexFlow_*.AppImage`
3. Doble clic

**Debian / Ubuntu (`.deb`):**

```bash
sudo dpkg -i LexFlow_<versión>_amd64.deb
sudo apt install -f   # resuelve dependencias si las hay
lexflow
```

---

## Primer arranque

Al abrir LexFlow por primera vez verás:

1. **Greeting** — pequeño dialog que pregunta cómo te llamamos. Es opcional. Solo se guarda en este equipo, nada se envía a un servidor.
2. **Tutorial sombreado** — 6 pasos cortos que enseñan el layout, los hotkeys (`Ctrl+K` es el atajo universal) y dónde está el chat. Skippable.
3. **Wizard de modelo** — detecta tu hardware y te recomienda un modelo. 3 opciones locales gratuitas (corren en tu equipo) + 1 opción cloud (pay-per-use). Detalle en [`MODELS.md`](MODELS.md).

Después de esos 3 pasos ya estás en la app y puedes empezar a usarla.

---

## Para devs (vía terminal)

### Pre-requisitos

- Python 3.12+
- Node 18+ (recomendado: usar `fnm` o `nvm` para gestionar versiones)
- [uv](https://docs.astral.sh/uv/) — gestor de paquetes Python
- Git

### Clonar e instalar

```bash
git clone https://github.com/VforVitorio/LexFlow.git
cd LexFlow

# Inicializar el corpus legalize-es (submódulo)
git submodule update --init --depth 1 --recursive

# Backend
uv sync --all-extras

# Frontend
cd frontend
npm install
cd ..
```

### Arrancar en dev

Dos terminales:

```bash
# terminal 1 — backend
uv run python main.py
# → http://localhost:8000  (API + docs en /docs)
```

```bash
# terminal 2 — frontend
cd frontend
npm run dev
# → http://localhost:5173  (HMR, proxea /api → :8000)
```

Por defecto el frontend usa **datos mock** (`VITE_USE_MOCK=true` en `.env.local`), así que puedes navegar la UI sin tener el backend levantado. Para conectar contra el backend real edita `frontend/.env.local` y pon `VITE_USE_MOCK=false`.

### Arrancar producción-like (un solo proceso)

```bash
cd frontend && npm run build && cd ..
uv run python main.py
# FastAPI sirve la API en /api/v1 y el SPA en /
```

---

## Modelos locales: instalar Ollama (recomendado)

LexFlow no incluye Ollama embebido — es un servicio separado que corre en `localhost:11434`. El wizard te ofrece instalarlo automáticamente al primer arranque, pero también puedes hacerlo a mano:

### Windows

Descarga [ollama-windows-amd64.exe](https://ollama.com/download/windows) e instala. Ollama queda corriendo en background.

### macOS

Descarga [Ollama.dmg](https://ollama.com/download/mac), arrastra a Applications. Se inicia automáticamente.

### Linux

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Tras instalar:

```bash
ollama pull llama3.2:3b   # o el modelo que el wizard te recomiende
```

LexFlow detecta Ollama automáticamente la próxima vez que lo abras.

---

## Modelos cloud

Tres proveedores soportados. Necesitas tu propia API key — LexFlow no incluye una.

| Provider | Dónde sacar la key | Default model |
|---|---|---|
| **Anthropic** (recomendado para español legal) | https://console.anthropic.com/settings/keys | `claude-sonnet-4-6` |
| **OpenAI** | https://platform.openai.com/api-keys | `gpt-5.4` |
| **Google** | https://aistudio.google.com/app/apikey | `gemini-2.5-flash` |

Una vez tengas la key, pégala en Ajustes → Modelos → Cloud → \<Provider\> → API key. Se guarda cifrada via `keyring` del sistema operativo (no en `localStorage`, no en plain JSON). Detalle de costes en [`MODELS.md`](MODELS.md).

---

## Desinstalar

### Windows

Panel de Control → Programas → LexFlow → Desinstalar.

Por defecto deja tus datos en `%APPDATA%\LexFlow\` (plantillas, configuración MCP, logs). Para borrarlos también: borra esa carpeta a mano.

### macOS

Arrastra LexFlow desde `/Applications` a la Papelera.

Datos en `~/Library/Application Support/LexFlow/` — bórralos a mano si quieres.

### Linux

Quita el `.AppImage` o `sudo apt remove lexflow`.

Datos en `~/.config/lexflow/` y `~/.local/share/lexflow/`.

---

## Resolución de problemas

### "El chat dice que no hay modelo configurado"

Abre Ajustes → Modelos. Si el wizard no se completó, vuelve a lanzarlo desde "Cambiar configuración".

### "Ollama no se detecta"

1. Comprueba que esté corriendo: en una terminal, `curl http://localhost:11434/` debe responder
2. Si no responde, abre Ollama desde el icono del system tray (Windows/macOS) o `ollama serve` (Linux)
3. En LexFlow: Ajustes → Modelos → Detectar de nuevo

### "Mi nombre no aparece en el chat"

El nombre se inyecta en el system prompt pero los modelos pequeños (tier 1) pueden ignorarlo. Sube a tier 2 o usa un modelo cloud si quieres tratamiento más personalizado.

### "Quiero usar un MCP server custom"

Ajustes → MCP Servers → "Añadir server". 3 modos: registry slug, drop `.mcpb`, o JSON paste. Detalle en [`MCP-INTEGRATION.md`](MCP-INTEGRATION.md).

### Logs

Ajustes → Avanzado → "Abrir carpeta de logs" — abre el explorador en `<config>/logs/`. El archivo `lexflow.log` tiene los últimos 7 días de actividad. Útil si abres un issue.

---

## Privacidad y datos

- **No hay cuenta.** No te registras, no se te identifica.
- **Tu nombre** (si lo das) vive solo en `localStorage` del navegador embebido. Borrable desde Ajustes.
- **Modelos locales (Ollama/LM Studio):** todo en tu equipo, nada sale.
- **Modelos cloud:** las consultas van al proveedor que elijas. Ellos tienen sus propias políticas (Anthropic / OpenAI / Google). LexFlow no intermedia — la conexión es directa entre tu app y la API del proveedor.
- **Plantillas y documentos:** locales, en la carpeta que elegiste en el primer arranque (`Documents/LexFlow` por defecto).
- **MCP servers externos:** se ejecutan como subprocesos locales en tu equipo. Su comportamiento depende de cada server — LexFlow muestra un consent prompt en la primera invocación de cada tool.

Si esto cambia en el futuro (e.g. añadimos telemetría opt-in), saldrá un anuncio visible y nunca será on por defecto.
