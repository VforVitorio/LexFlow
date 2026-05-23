# Arquitectura de LexFlow

Este documento describe las decisiones arquitectónicas del proyecto, el razonamiento detrás de cada elección tecnológica y cómo encajan las piezas entre sí.

---

## Visión general

LexFlow es una plataforma modular que transforma legislación española en Markdown (del repositorio [legalize-es](https://github.com/legalize-dev/legalize-es)) en un ecosistema interactivo. La arquitectura se organiza en capas independientes que se comunican a través de una API central.

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

## Decisiones tecnológicas

### Python puro (backend + frontend)

**Decisión:** Todo el stack en Python — sin JavaScript, sin Node.js.

**Razonamiento:**
- Reduce la barrera de entrada para contribuidores (un solo lenguaje)
- Simplifica el empaquetado como aplicación de escritorio (un solo runtime)
- El ecosistema Python tiene todo lo necesario: FastAPI para APIs, Reflex para UI, Plotly para gráficos, NetworkX para grafos
- El objetivo de distribución como producto descargable es más viable con un solo lenguaje

**Trade-offs:**
- La UI no tendrá la flexibilidad total de React/Next.js
- El rendimiento del frontend depende de las capacidades de Reflex
- Se acepta este trade-off a cambio de simplicidad y distribuibilidad

---

### Reflex como framework de frontend

**Decisión:** Usar [Reflex](https://reflex.dev) en lugar de React, Astro o Next.js.

**Razonamiento:**
- Full-stack Python: componentes, estado y lógica en un solo lenguaje
- Compila a una app React internamente (rendimiento web real)
- Soporta exportación como app estática y despliegue sencillo
- Se alinea con la visión de "producto descargable" — el frontend va dentro del binario
- Comunidad activa y en crecimiento

**Alternativas descartadas:**
- **React/Next.js:** Requiere Node.js, añade complejidad al build y al empaquetado
- **Streamlit:** Limitado para UIs complejas, no es una app real
- **Gradio:** Orientado a demos de ML, no a aplicaciones de producto

---

### FastAPI como capa API

**Decisión:** FastAPI como backend REST central.

**Razonamiento:**
- Documentación OpenAPI automática
- Validación con Pydantic integrada
- Async nativo (importante para I/O con archivos y modelos)
- El estándar de facto en Python para APIs modernas
- Compatible con MCP (el chat puede invocar endpoints como herramientas)

---

### NetworkX para el grafo de conocimiento

**Decisión:** NetworkX como motor de grafos en memoria.

**Razonamiento:**
- Sin dependencias externas (no necesita Neo4j ni base de datos separada)
- Suficiente para el volumen de datos de la legislación española (miles de nodos, no millones)
- Algoritmos de grafos listos para usar (centralidad, clustering, caminos)
- Serializable — el grafo puede guardarse como JSON y cargarse al arrancar

**Evolución prevista:**
- Si el volumen crece significativamente, migrar a Neo4j o similar
- La interfaz del módulo `graph/` está diseñada para que el motor sea intercambiable

---

### MCP + FastMCP para el chatbot

**Decisión:** Usar el protocolo MCP (Model Context Protocol) con FastMCP para conectar el chatbot a herramientas reales.

**Razonamiento:**
- MCP es un estándar abierto para conectar modelos de lenguaje con herramientas
- FastMCP simplifica la creación de servidores MCP en Python
- Permite que cualquier modelo (local o API) use las mismas herramientas
- El chatbot no depende de contexto estático — puede consultar la API en tiempo real

**Modelos soportados:**
- **Locales:** Ollama, LM Studio
- **APIs:** OpenAI, Anthropic, Google
- El usuario elige qué modelo usar desde la interfaz

---

### Plotly para dashboards

**Decisión:** Plotly para gráficos interactivos.

**Razonamiento:**
- Gráficos interactivos de alta calidad sin JavaScript custom
- Integración nativa con Reflex
- Soporta gráficos complejos: treemaps, sunbursts, heatmaps, timelines
- Exportable a imagen para reports

---

## Estrategia de distribución

### Objetivo: "descarga y usa"

El objetivo final es que LexFlow sea un producto descargable como cualquier aplicación de escritorio. La estrategia de distribución tiene tres niveles:

| Nivel | Audiencia | Formato |
|-------|-----------|---------|
| **Desarrollador** | Contribuidores | `git clone` + `uv sync` |
| **Técnico** | Sysadmins, DevOps | Docker Compose |
| **Usuario final** | Juristas, compliance, público general | Instalador nativo (.exe, .dmg, .AppImage) |

### Pipeline de empaquetado

```
Source code
    │
    ├── uv sync → entorno de desarrollo
    │
    ├── Docker build → imagen para servidores
    │
    └── PyInstaller / Nuitka → binario standalone
        ├── Windows: .exe / .msi (vía NSIS o WiX)
        ├── macOS: .dmg (vía create-dmg)
        └── Linux: .AppImage / .deb
```

### CI/CD para releases

GitHub Actions construirá los artefactos automáticamente en cada tag de versión:
1. Tests + lint + typecheck
2. Build de binarios para las tres plataformas
3. Publicación en GitHub Releases
4. (Futuro) Publicación en página de descargas

---

## Estructura de módulos

### `src/lexflow/core/`
Modelos de dominio (Ley, Artículo, Versión, Referencia), parsers de Markdown y lógica de negocio. No depende de ningún framework web.

### `src/lexflow/api/`
Endpoints FastAPI. Depende de `core/`. Expone datos vía REST.

### `src/lexflow/graph/`
Modelo de grafo, construcción a partir de referencias cruzadas, algoritmos de análisis. Depende de `core/` y NetworkX.

### `src/lexflow/chat/`
Integraciones con modelos de lenguaje y servidor MCP. Depende de `api/` (a través de herramientas MCP).

### `src/lexflow/dashboards/`
Componentes de visualización con Plotly. Depende de `core/` para datos y `api/` para endpoints.

### `src/lexflow/utils/`
Configuración, logging, helpers de parsing comunes. Sin dependencias de otros módulos de LexFlow.

### Dependencias entre módulos

```
utils ← core ← api ← chat
                 ↑
          graph ──┘
                 ↑
       dashboards┘
```

Regla: las dependencias solo fluyen hacia la izquierda/arriba. Ningún módulo bajo `core/` importa de `api/` o `chat/`.

---

## Fuente de datos

LexFlow no almacena leyes en una base de datos propia. La fuente de verdad es el repositorio [legalize-es](https://github.com/legalize-dev/legalize-es):

- Se clona como subdirectorio o submódulo Git
- Los parsers leen los archivos Markdown directamente
- Las versiones históricas se obtienen vía `git log` / `git diff`
- Se puede sincronizar con `git pull` para obtener actualizaciones

Esta decisión evita duplicar datos y garantiza que LexFlow siempre trabaja con la versión más actualizada de la legislación.

---

> Este documento se actualiza conforme se toman nuevas decisiones arquitectónicas.
