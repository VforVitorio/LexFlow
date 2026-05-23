# MCP Integration (Fase 9)

LexFlow ya **expone** un servidor MCP (`src/lexflow/chat/mcp_server.py`) con tools propias (`search_law`, `get_law`, `get_article`, `get_stats`, `get_neighbors`).

Lo que falta — y es lo que esta fase añade — es que **LexFlow también consuma servidores MCP externos**: filesystem, fetch web, parsing de documentos, queries directas al BOE, plantillas de usuario, etc. Y que el usuario pueda traer los suyos sin tocar código.

---

## El registro oficial (2026)

Existe un registro oficial desde finales de 2025:

- **Registro oficial:** [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/)
- **API REST + OpenAPI spec:** otros registros (Smithery, Glama) pueden implementarlo
- **Reference servers:** [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)

Catálogos de terceros (mejores para descubrimiento UX):

- [smithery.ai](https://smithery.ai) — 18k+ servers con `npx`-style install
- [glama.ai/mcp/servers](https://glama.ai/mcp/servers) — gateway model (servers hosted)
- [pulsemcp.com](https://www.pulsemcp.com), [mcp.so](https://mcp.so) — directorios curados

**Fuente de verdad para LexFlow:** `registry.modelcontextprotocol.io`. Smithery sirve de inspiración UX.

---

## Servidores que LexFlow ship por defecto

4 servers, todos stdio (subproceso local), ninguno requiere cuenta o API key:

### 1. `fetch` (oficial, Python)

- Repo: [`modelcontextprotocol/servers/src/fetch`](https://github.com/modelcontextprotocol/servers/tree/main/src/fetch)
- Para qué: el chat puede leer URLs externas (BOE, EUR-Lex, jurisprudencia citada)
- Permisos: `read-only`, sin POST. No requiere consent prompt (lectura).

### 2. `filesystem` (oficial, Node)

- Repo: [`modelcontextprotocol/servers/src/filesystem`](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)
- Para qué: leer y escribir plantillas + documentos en una carpeta acotada
- **Scope crítico:** en el primer arranque, LexFlow abre un native folder picker — el usuario elige (e.g. `~/Documents/LexFlow/`). Esa ruta y solo esa se pasa al server como allow-list (`--allowed-paths`)
- Consent prompt en primera escritura/borrado

### 3. `mcp-pandoc` (community, Python)

- Repo: [`vivekVells/mcp-pandoc`](https://github.com/vivekVells/mcp-pandoc)
- Para qué: convertir plantillas que el usuario sube en distintos formatos (`.docx`, `.pdf`, `.html`, `.md`) a Markdown limpio
- Alternativa para OCR / scans: [Docling MCP (IBM)](https://github.com/DS4SD/docling) o [MarkItDown (Microsoft)](https://github.com/microsoft/markitdown). Decisión a tomar al implementar — `mcp-pandoc` es lo más simple para empezar.

### 4. `boe-mcp` (community, dominio español)

- Repo: [`AnCode666/boe-mcp`](https://github.com/AnCode666/boe-mcp)
- Para qué: queries directas a la API oficial del BOE. Complementa el corpus estático de `legalize-es` con sumarios diarios y disposiciones que aún no están en el dataset
- Permisos: read-only

### Excluidos del default (opt-in)

- **`memory`** ([repo](https://github.com/modelcontextprotocol/servers/tree/main/src/memory)) — knowledge-graph en memoria. Solaparía con NetworkX de LexFlow → dos stores compitiendo. Mejor como add-on opcional para casos de uso "memoria persistente del usuario en el chat".
- **`time`** — trivial; usamos `zoneinfo` de Python en proceso, no aporta.
- **`spanish-law-mcp`** ([repo](https://github.com/Ansvar-Systems/spanish-law-mcp)) — redundante con `legalize-es`.

---

## FastMCP como cliente

`fastmcp` (la lib que LexFlow ya usa en el server) **también** expone una clase `Client` para consumir servers externos. **No** hace falta añadir Anthropic SDK ni `mcp-client`.

Patrón:

```python
# src/lexflow/chat/mcp_client.py (a crear)
from fastmcp import Client
from fastmcp.client.config import MCPConfig

config = MCPConfig.from_dict({
    "mcpServers": {
        "fetch": {"command": "python", "args": ["-m", "mcp_server_fetch"]},
        "filesystem": {"command": "npx", "args": ["@modelcontextprotocol/server-filesystem", "/path/to/scope"]},
        "pandoc": {"command": "uvx", "args": ["mcp-pandoc"]},
        "boe": {"command": "python", "args": ["-m", "boe_mcp"]},
    }
})

async with Client(config) as client:
    tools = await client.list_tools()
    # ... invocar en el loop del chat
```

Docs: [gofastmcp.com/clients/client](https://gofastmcp.com/clients/client).

LexFlow consume **todos** los servers (los 4 built-in + los del usuario) a través de **un único** `fastmcp.Client`, así el agente de chat ve un toolset merged y la UI puede listar todas las tools en un sitio.

---

## Schema portable: `claude_desktop_config.json`

LexFlow adopta verbatim el schema de `claude_desktop_config.json` para su `mcp.json`. Beneficio: cualquier server que ya funcione en Claude Desktop puede importarse a LexFlow copiando el JSON. Y al revés.

Forma:

```json
{
  "mcpServers": {
    "nombre-amigable": {
      "command": "comando",
      "args": ["arg1", "arg2"],
      "env": { "API_KEY": "..." }
    }
  }
}
```

Ubicación en disco (por SO, siguiendo la convención XDG / Apple / Windows):

| SO | Ruta |
|----|------|
| Windows | `%APPDATA%\LexFlow\mcp.json` |
| macOS | `~/Library/Application Support/LexFlow/mcp.json` |
| Linux | `$XDG_CONFIG_HOME/lexflow/mcp.json` (default `~/.config/lexflow/mcp.json`) |

---

## Bring-your-own MCP: UX

Settings → MCP Servers (página nueva). Lista:

- **Built-in (read-only):** los 4 que ship LexFlow, marcados con badge y toggle on/off
- **De usuario (CRUD):** los añadidos manualmente

Botón "+ Añadir server" abre un modal con 3 modos en tabs:

1. **Registry slug** — pega `@modelcontextprotocol/server-foo`, LexFlow consulta el registro oficial, muestra metadata (descripción, autor, license), confirma, instala
2. **`.mcpb` bundle** — drop del archivo, LexFlow lo desempaqueta, valida `manifest.json`, registra
3. **JSON manual** — paste del bloque (mismo schema que Claude Desktop), validación on-the-fly

Al añadir, el server arranca como subproceso y se prueba con `list_tools()`. Si falla, error claro: "El server no respondió. Mira los logs (Ajustes → Logs)".

---

## `.mcpb` bundles (Anthropic Desktop Extensions)

Formato oficial desde 2025-2026:

- Spec: [github.com/modelcontextprotocol/mcpb](https://github.com/modelcontextprotocol/mcpb)
- Anuncio: [Desktop Extensions](https://www.anthropic.com/engineering/desktop-extensions)

Un `.mcpb` es un zip con:

- `manifest.json` (server name, description, command, args, permissions)
- El propio binario / código del server

LexFlow:
- Acepta drop de `.mcpb` en Settings → MCP Servers
- Valida la firma si la trae (algunos bundles vienen firmados por Anthropic)
- Lo extrae a `<config-dir>/mcp-bundles/<server-name>/`
- Añade su entrada a `mcp.json`

---

## Permission model

Sigue las [best practices oficiales](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices):

1. **Local-first.** Preferir stdio (subproceso local) sobre remoto. Los 4 default son stdio.
2. **Scope at connect time.** Filesystem recibe allow-list de paths como CLI args. El usuario elige la ruta con folder picker nativo — nunca tecleando.
3. **Per-tool consent prompt** en primera invocación con opción "Recordar para esta sesión". Para tools destructive (write, delete, network POST) **nunca** silent-grant.
4. **OAuth con scope tokens** para servers remotos. Nunca tokens en `localStorage` — siempre `keyring` (lib `python-keyring` ya recomendada en [`UX-ONBOARDING.md`](UX-ONBOARDING.md) §3 para API keys cloud).
5. **Audit log.** Cada invocación de tool registra { timestamp, server, tool, args, result_size, duration } a `<config-dir>/mcp.log`. UI accesible en Ajustes → Logs.

---

## Roadmap de implementación

| Sub-issue | Descripción | Prioridad |
|-----------|-------------|-----------|
| `[Feature]: MCP client interno con fastmcp.Client + MCPConfig` | Wrapper en `src/lexflow/chat/mcp_client.py`. Endpoint `GET /api/v1/mcp/tools` que lista tools merged | alta |
| `[Feature]: Built-in MCP servers (fetch, filesystem, mcp-pandoc, boe-mcp)` | Bundlear los 4 con la app, arrancar/parar lifecycle | alta |
| `[Feature]: Settings → MCP Servers page (list, add, remove, toggle)` | Frontend CRUD sobre `<config-dir>/mcp.json` | media |
| `[Feature]: Add server via JSON paste + native folder picker for filesystem scope` | El modal "+ Añadir" con los 3 modos | media |
| `[Feature]: .mcpb bundle support (drop, validate, extract, register)` | Parser + extractor + integración con UI | media |
| `[Feature]: Per-tool consent prompts + audit log` | Sistema de permisos en runtime, página de logs | media |
| `[Feature]: User-uploaded templates en el editor (#108)` | Drop plantillas, conversión via mcp-pandoc, formulario de placeholders | alta — ya tracked en #108 |

---

## Fuentes

- [Official MCP Registry](https://registry.modelcontextprotocol.io/)
- [MCP Reference Servers](https://github.com/modelcontextprotocol/servers)
- [FastMCP — The Client](https://gofastmcp.com/clients/client)
- [FastMCP ↔ FastAPI integration](https://gofastmcp.com/integrations/fastapi)
- [MCP Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
- [MCPB / Desktop Extensions](https://github.com/modelcontextprotocol/mcpb)
- [Anthropic — Desktop Extensions announcement](https://www.anthropic.com/engineering/desktop-extensions)
- [Claude Desktop config docs](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)
- [BOE MCP](https://github.com/AnCode666/boe-mcp)
- [mcp-pandoc](https://github.com/vivekVells/mcp-pandoc)
- [Smithery directory](https://smithery.ai)
