<p align="center">
  <img src="assets/lexflow-banner.jpeg" alt="LexFlow" width="700" />
</p>

<h3 align="center">Legislacion espanola, viva y navegable.</h3>

<p align="center">
  Plataforma open source para explorar, analizar y consultar legislacion espanola mediante grafos de conocimiento, IA y dashboards interactivos.
</p>

<p align="center">
  <a href="https://github.com/VforVitorio/LexFlow/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/python-3.12+-blue.svg" alt="Python" /></a>
  <a href="https://github.com/VforVitorio/LexFlow/issues"><img src="https://img.shields.io/github/issues/VforVitorio/LexFlow" alt="Issues" /></a>
  <img src="https://img.shields.io/badge/status-pre--alpha-orange" alt="Status" />
</p>

---

## Que es LexFlow

LexFlow transforma el repositorio [legalize-es](https://github.com/legalize-dev/legalize-es) — una coleccion de leyes espanolas en Markdown versionada con Git — en una plataforma interactiva con cuatro capas:

| Capa | Descripcion |
|------|-------------|
| **API REST** | Endpoints FastAPI para leyes, articulos, versiones, diffs, busqueda y estadisticas |
| **Grafo interactivo** | Visualizacion tipo Obsidian de relaciones entre normas, articulos y referencias |
| **Chat legal** | Chatbot con acceso a herramientas reales via MCP (Ollama, LM Studio, OpenAI, Anthropic, Google) |
| **Dashboards** | Paneles de compliance y analitica legislativa con Plotly |

Todo construido en **Python puro** (backend + frontend con [Reflex](https://reflex.dev)), pensado para ser descargado y usado por cualquier persona — sin necesidad de Docker, terminales ni dependencias.

---

## Inicio rapido

### Requisitos

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) (gestor de paquetes recomendado)

### Instalacion

```bash
# Clonar el repositorio
git clone https://github.com/VforVitorio/LexFlow.git
cd LexFlow

# Instalar dependencias
uv sync --all-extras

# Arrancar el servidor de desarrollo
uv run python main.py
```

La API estara disponible en `http://localhost:8000`. Documentacion interactiva en `/docs`.

> **Nota:** En futuras versiones LexFlow se distribuira como aplicacion de escritorio descargable (`.exe`, `.dmg`, `.AppImage`) para que no necesites instalar nada.

---

## Arquitectura

```text
LexFlow/
├── src/lexflow/
│   ├── api/          # FastAPI — endpoints REST
│   ├── core/         # Modelos de dominio, parsers, logica de negocio
│   ├── chat/         # Chatbot legal con MCP tools
│   ├── graph/        # Grafo de conocimiento (NetworkX)
│   ├── dashboards/   # Paneles analiticos (Plotly + Reflex)
│   └── utils/        # Configuracion, logging, helpers
├── tests/            # Test suite
├── docs/             # Documentacion del proyecto
├── assets/           # Imagenes y recursos estaticos
├── .github/          # CI/CD, issue templates, PR template
├── main.py           # Punto de entrada
└── pyproject.toml    # Configuracion del proyecto
```

---

## Stack tecnologico

| Componente | Tecnologia |
|------------|------------|
| Backend | FastAPI, Pydantic, Uvicorn |
| Frontend | Reflex |
| Grafo | NetworkX |
| Chat / RAG | FastMCP, Ollama, LM Studio, OpenAI, Anthropic, Google |
| Dashboards | Plotly |
| Testing | pytest, pytest-asyncio |
| Linting | Ruff |
| Type checking | mypy |
| Packaging | uv, PyInstaller |

---

## Roadmap

Consulta el [ROADMAP.md](ROADMAP.md) completo para ver todas las fases, hitos y objetivos del proyecto.

**Resumen de fases:**

1. **Cimientos** — API base, parseo de leyes, modelos de dominio
2. **Grafo** — Construccion y visualizacion del grafo de relaciones legales
3. **Chat** — Chatbot legal con herramientas MCP conectadas a la API
4. **Dashboards** — Paneles de compliance y analitica legislativa
5. **Producto** — Empaquetado como app de escritorio, instaladores, distribucion

---

## Contribuir

Las contribuciones son bienvenidas. Lee la [guia de contribucion](CONTRIBUTING.md) antes de empezar.

**Flujo rapido:**

1. Abre o busca un [issue](https://github.com/VforVitorio/LexFlow/issues)
2. Crea una rama desde `dev` (`feat/xxx` o `fix/xxx`)
3. Desarrolla y anade tests
4. Abre PR hacia `dev`
5. Review y merge (sin squash)

---

## Creditos

Este proyecto existe gracias a [legalize-es](https://github.com/legalize-dev/legalize-es), el repositorio open source que recopila y versiona legislacion espanola en Markdown. LexFlow construye sobre esa base para convertirla en una plataforma interactiva completa.

---

## Licencia

LexFlow se distribuye bajo la licencia [Apache 2.0](LICENSE).

```
Copyright 2026 VforVitorio

Licensed under the Apache License, Version 2.0
```
