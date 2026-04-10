# Legalize ES Platform

## Resumen ejecutivo

Legalize ES Platform es una plataforma open source para convertir el repositorio `legalize-es` en un sistema completo de exploración, análisis y asistencia sobre legislación española.

La idea es transformar un repositorio de leyes en Markdown, versionado con Git, en una experiencia interactiva con cuatro capas principales:

1. **API REST en FastAPI** para exponer leyes, artículos, versiones, diffs, búsqueda y estadísticas.
2. **Grafo interactivo tipo Obsidian** para navegar relaciones entre leyes, artículos y referencias.
3. **Chat legal inteligente** con soporte para modelos locales y APIs externas.
4. **Dashboards analíticos y de compliance** para seguimiento legislativo, métricas y alertas.

El objetivo es crear una base técnica sólida, modular y extensible, totalmente orientada a open source, que pueda evolucionar con nuevas decisiones de producto y arquitectura.

---

## Elevator pitch

Legalize ES Platform convierte legislación española en una experiencia viva: una API para consultar leyes, un grafo interactivo para explorar relaciones, un chatbot legal con herramientas reales y dashboards para análisis legislativo y compliance. Todo ello construido en Python, con una arquitectura modular, preparada para crecer y adaptarse a las decisiones que se tomen durante el desarrollo.

---

## Visión del proyecto

El repositorio original `legalize-es` ya ofrece una base muy potente: leyes en Markdown, versionado en Git y metadatos estructurados. Sobre esa base se propone construir una plataforma que permita:

- consultar contenido legal de forma estructurada,
- visualizar relaciones entre normas como un grafo navegable,
- analizar cambios y tendencias legislativas,
- automatizar casos de uso de compliance,
- y ofrecer un chatbot que responda usando datos reales y herramientas conectadas.

La intención no es sustituir el repositorio original, sino convertirlo en el núcleo de un ecosistema más grande.

Repositorio original: https://github.com/legalize-dev/legalize-es

---

## Partes principales del sistema

### 1. API REST con FastAPI

FastAPI será el backend principal del sistema. Desde ahí se expondrán endpoints para:

- listado de leyes,
- detalle de una ley concreta,
- artículos y secciones,
- versiones históricas,
- diffs entre versiones,
- búsqueda por texto o por semántica,
- estadísticas agregadas,
- y acceso a datos para el grafo y el chatbot.

La API será la capa central de integración para el frontend, el chatbot y los dashboards.

---

### 2. Grafo interactivo tipo “cerebro” de Obsidian

La interfaz visual no usará Obsidian directamente, sino que reproducirá la idea de su vista de grafo y la adaptará al dominio legal.

El grafo permitirá:

- ver nodos de leyes, artículos, capítulos y referencias,
- navegar por relaciones entre normas,
- cambiar colores según estado, categoría, año o tipo de relación,
- hacer clic en nodos para ver detalles en un panel lateral,
- filtrar por temática, estado o periodo,
- y explorar la red legal de forma visual e intuitiva.

---

### 3. Chatbot legal con herramientas

El sistema incluirá un chatbot que pueda trabajar con diferentes motores:

- modelos locales con **Ollama**,
- modelos locales con **LM Studio**,
- API de **OpenAI**,
- API de **Anthropic**,
- API de **Google**.

Además, el chat podrá acceder dinámicamente a la API del sistema a través de **MCP** usando **FastMCP**, de forma que el modelo pueda invocar herramientas cuando lo considere necesario.

Esto permite que el chatbot no dependa solo de contexto estático, sino que pueda consultar:

- el grafo,
- leyes concretas,
- diffs,
- estadísticas,
- y cualquier endpoint útil del backend.

---

### 4. Dashboards de analítica y compliance

La parte de dashboards se centrará en dos bloques:

#### Compliance
Un panel para:

- detectar normas relevantes por sector,
- seguir cambios legislativos importantes,
- marcar leyes críticas,
- y generar alertas o vistas de seguimiento.

#### Analítica legislativa
Un panel para:

- ver reformas por año,
- detectar leyes más modificadas,
- estudiar patrones de cambio normativo,
- visualizar densidad de relaciones entre leyes,
- y analizar la evolución histórica del sistema legal.

---

## Stack tecnológico propuesto

### Backend
- **Python**
- **FastAPI**
- **Pydantic**
- **Uvicorn**

### Grafo y relaciones
- **NetworkX**
- (posible evolución a base de datos de grafos)

### Chat / RAG / tools
- **FastMCP**
- **Ollama**
- **LM Studio**
- APIs externas (OpenAI, Anthropic, Google)

### Frontend
- **Reflex** como opción recomendada
- Alternativas: React, Astro, Next.js

### Dashboards
- **Plotly**
- Visualizaciones integradas en el frontend

---

## Estructura base del proyecto

```text
legalize-platform/
├── src/
│   ├── api/
│   ├── core/
│   ├── dashboards/
│   ├── frontend/
│   └── utils/
├── tests/
├── .github/
│   └── workflows/
├── pyproject.toml
└── README.md
```

---

## Flujo de desarrollo

- `main`: rama protegida.
- `dev`: rama de integración.
- Toda feature → issue + rama dedicada.
- Al terminar: cerrar issue → PR a `dev`.
- **Sin squash**: todos los commits pasan tal cual.
- Tras merge: borrar la rama.
- Solo se hace PR a `main` desde `dev`.

---

## CI/CD con GitHub Actions

```yaml
name: CI

on:
  push:
    branches: [main, dev, "feat/**", "fix/**"]
  pull_request:
    branches: [main, dev]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
        with:
          version: "latest"
      - run: uv python install 3.12
      - run: uv sync --all-extras
      - run: uv run pytest -v

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync --all-extras
      - run: uv run ruff check .
      - run: uv run ruff format --check .

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync --all-extras
      - run: uv run mypy src/rag/.
```

---

## Nota final

Toda esta estructura, stack y organización puede cambiar según las decisiones que se adopten durante el desarrollo asistido por **Claude Code**.

