# Arquitectura de LexFlow

Este documento describe las decisiones arquitectonicas del proyecto, el razonamiento detras de cada eleccion tecnologica y como encajan las piezas entre si.

---

## Vision general

LexFlow es una plataforma modular que transforma legislacion espanola en Markdown (del repositorio [legalize-es](https://github.com/legalize-dev/legalize-es)) en un ecosistema interactivo. La arquitectura se organiza en capas independientes que se comunican a traves de una API central.

```
┌─────────────────────────────────────────────────┐
│                   Frontend (Reflex)              │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Grafo   │  │   Chat   │  │  Dashboards   │  │
│  └────┬─────┘  └────┬─────┘  └──────┬────────┘  │
│       │              │               │           │
│       └──────────────┼───────────────┘           │
│                      │                           │
├──────────────────────┼───────────────────────────┤
│              API REST (FastAPI)                   │
│  /laws  /articles  /graph  /search  /stats       │
├──────────────────────┼───────────────────────────┤
│              Core (dominio + parsers)             │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Parsers  │  │  Models  │  │  Graph Engine │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
├──────────────────────────────────────────────────┤
│          Fuente de datos: legalize-es            │
│          (repositorio Git con Markdown)           │
└──────────────────────────────────────────────────┘
```

---

## Decisiones tecnologicas

### Python puro (backend + frontend)

**Decision:** Todo el stack en Python — sin JavaScript, sin Node.js.

**Razonamiento:**
- Reduce la barrera de entrada para contribuidores (un solo lenguaje)
- Simplifica el empaquetado como aplicacion de escritorio (un solo runtime)
- El ecosistema Python tiene todo lo necesario: FastAPI para APIs, Reflex para UI, Plotly para graficos, NetworkX para grafos
- El objetivo de distribucion como producto descargable es mas viable con un solo lenguaje

**Trade-offs:**
- La UI no tendra la flexibilidad total de React/Next.js
- El rendimiento del frontend depende de las capacidades de Reflex
- Se acepta este trade-off a cambio de simplicidad y distribuibilidad

---

### Reflex como framework de frontend

**Decision:** Usar [Reflex](https://reflex.dev) en lugar de React, Astro o Next.js.

**Razonamiento:**
- Full-stack Python: componentes, estado y logica en un solo lenguaje
- Compila a una app React internamente (rendimiento web real)
- Soporta exportacion como app estatica y despliegue sencillo
- Se alinea con la vision de "producto descargable" — el frontend va dentro del binario
- Comunidad activa y en crecimiento

**Alternativas descartadas:**
- **React/Next.js:** Requiere Node.js, anade complejidad al build y al empaquetado
- **Streamlit:** Limitado para UIs complejas, no es una app real
- **Gradio:** Orientado a demos de ML, no a aplicaciones de producto

---

### FastAPI como capa API

**Decision:** FastAPI como backend REST central.

**Razonamiento:**
- Documentacion OpenAPI automatica
- Validacion con Pydantic integrada
- Async nativo (importante para I/O con archivos y modelos)
- El estandar de facto en Python para APIs modernas
- Compatible con MCP (el chat puede invocar endpoints como herramientas)

---

### NetworkX para el grafo de conocimiento

**Decision:** NetworkX como motor de grafos en memoria.

**Razonamiento:**
- Sin dependencias externas (no necesita Neo4j ni base de datos separada)
- Suficiente para el volumen de datos de la legislacion espanola (miles de nodos, no millones)
- Algoritmos de grafos listos para usar (centralidad, clustering, caminos)
- Serializable — el grafo puede guardarse como JSON y cargarse al arrancar

**Evolucion prevista:**
- Si el volumen crece significativamente, migrar a Neo4j o similar
- La interfaz del modulo `graph/` esta disenada para que el motor sea intercambiable

---

### MCP + FastMCP para el chatbot

**Decision:** Usar el protocolo MCP (Model Context Protocol) con FastMCP para conectar el chatbot a herramientas reales.

**Razonamiento:**
- MCP es un estandar abierto para conectar modelos de lenguaje con herramientas
- FastMCP simplifica la creacion de servidores MCP en Python
- Permite que cualquier modelo (local o API) use las mismas herramientas
- El chatbot no depende de contexto estatico — puede consultar la API en tiempo real

**Modelos soportados:**
- **Locales:** Ollama, LM Studio
- **APIs:** OpenAI, Anthropic, Google
- El usuario elige que modelo usar desde la interfaz

---

### Plotly para dashboards

**Decision:** Plotly para graficos interactivos.

**Razonamiento:**
- Graficos interactivos de alta calidad sin JavaScript custom
- Integracion nativa con Reflex
- Soporta graficos complejos: treemaps, sunbursts, heatmaps, timelines
- Exportable a imagen para reports

---

## Estrategia de distribucion

### Objetivo: "descarga y usa"

El objetivo final es que LexFlow sea un producto descargable como cualquier aplicacion de escritorio. La estrategia de distribucion tiene tres niveles:

| Nivel | Audiencia | Formato |
|-------|-----------|---------|
| **Desarrollador** | Contribuidores | `git clone` + `uv sync` |
| **Tecnico** | Sysadmins, DevOps | Docker Compose |
| **Usuario final** | Juristas, compliance, publico general | Instalador nativo (.exe, .dmg, .AppImage) |

### Pipeline de empaquetado

```
Source code
    │
    ├── uv sync → entorno de desarrollo
    │
    ├── Docker build → imagen para servidores
    │
    └── PyInstaller / Nuitka → binario standalone
        ├── Windows: .exe / .msi (via NSIS o WiX)
        ├── macOS: .dmg (via create-dmg)
        └── Linux: .AppImage / .deb
```

### CI/CD para releases

GitHub Actions construira los artefactos automaticamente en cada tag de version:
1. Tests + lint + typecheck
2. Build de binarios para las tres plataformas
3. Publicacion en GitHub Releases
4. (Futuro) Publicacion en pagina de descargas

---

## Estructura de modulos

### `src/lexflow/core/`
Modelos de dominio (Ley, Articulo, Version, Referencia), parsers de Markdown y logica de negocio. No depende de ningun framework web.

### `src/lexflow/api/`
Endpoints FastAPI. Depende de `core/`. Expose datos via REST.

### `src/lexflow/graph/`
Modelo de grafo, construccion a partir de referencias cruzadas, algoritmos de analisis. Depende de `core/` y NetworkX.

### `src/lexflow/chat/`
Integraciones con modelos de lenguaje y servidor MCP. Depende de `api/` (a traves de herramientas MCP).

### `src/lexflow/dashboards/`
Componentes de visualizacion con Plotly. Depende de `core/` para datos y `api/` para endpoints.

### `src/lexflow/utils/`
Configuracion, logging, helpers de parsing comunes. Sin dependencias de otros modulos de LexFlow.

### Dependencias entre modulos

```
utils ← core ← api ← chat
                 ↑
          graph ──┘
                 ↑
       dashboards┘
```

Regla: las dependencias solo fluyen hacia la izquierda/arriba. Ningun modulo bajo `core/` importa de `api/` o `chat/`.

---

## Fuente de datos

LexFlow no almacena leyes en una base de datos propia. La fuente de verdad es el repositorio [legalize-es](https://github.com/legalize-dev/legalize-es):

- Se clona como subdirectorio o submodulo Git
- Los parsers leen los archivos Markdown directamente
- Las versiones historicas se obtienen via `git log` / `git diff`
- Se puede sincronizar con `git pull` para obtener actualizaciones

Esta decision evita duplicar datos y garantiza que LexFlow siempre trabaja con la version mas actualizada de la legislacion.

---

> Este documento se actualiza conforme se toman nuevas decisiones arquitectonicas.
