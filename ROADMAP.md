# Roadmap de LexFlow

Este documento describe las fases de desarrollo planificadas para LexFlow, desde los cimientos hasta la distribución como producto final.

Cada fase agrupa trabajo por área funcional. Las fases no son estrictamente secuenciales: pueden solaparse, pero cada una tiene criterios claros de "hecho".

---

## Fase 0 — Fundación del proyecto

**Objetivo:** Tener el repositorio, CI/CD y flujo de desarrollo listos para que cualquier persona pueda contribuir.

| Tarea | Estado |
|-------|--------|
| Estructura del repositorio y paquete Python | Hecho |
| pyproject.toml con dependencias y herramientas | Hecho |
| README, CONTRIBUTING, CODE_OF_CONDUCT | Hecho |
| Issue templates y PR template | Hecho |
| GitHub Actions (test, lint, typecheck) | Hecho |
| Protección de ramas (main, dev) | Hecho |
| Rama `dev` creada y configurada | Hecho |

**Criterio de completado:** Un contribuidor externo puede clonar, instalar, ejecutar tests y abrir un PR sin fricción.

---

## Fase 1 — API base y núcleo de datos

**Objetivo:** Parsear el repositorio legalize-es y exponerlo a través de una API REST funcional.

| Tarea | Estado |
|-------|--------|
| Parser de Markdown para leyes (título, artículos, secciones, metadatos) | Pendiente |
| Modelos Pydantic para Ley, Artículo, Versión, Referencia | Pendiente |
| Clonar/sincronizar legalize-es como submódulo o fuente de datos | Pendiente |
| Endpoints CRUD: listado de leyes, detalle, artículos | Pendiente |
| Endpoint de versiones históricas (git log por ley) | Pendiente |
| Endpoint de diffs entre versiones | Pendiente |
| Búsqueda por texto (full-text search) | Pendiente |
| Tests de integración para todos los endpoints | Pendiente |
| Documentación OpenAPI pulida | Pendiente |

**Criterio de completado:** `GET /laws`, `GET /laws/{id}`, `GET /laws/{id}/articles`, `GET /laws/{id}/versions`, `GET /laws/{id}/diff` funcionan contra datos reales de legalize-es.

---

## Fase 2 — Grafo de conocimiento legal

**Objetivo:** Construir y visualizar un grafo navegable de relaciones entre normas.

| Tarea | Estado |
|-------|--------|
| Extracción de referencias cruzadas entre leyes | Pendiente |
| Modelo de grafo con NetworkX (nodos: leyes, artículos; aristas: referencias) | Pendiente |
| Algoritmos de relevancia y clustering | Pendiente |
| Endpoints de grafo: vecinos, caminos, subgrafos | Pendiente |
| Componente Reflex para visualización interactiva del grafo | Pendiente |
| Filtros por temática, estado, período, tipo de relación | Pendiente |
| Panel lateral de detalle al hacer clic en un nodo | Pendiente |
| Colores y tamaños de nodo según propiedades (estado, categoría, año) | Pendiente |
| Tests unitarios del modelo de grafo | Pendiente |

**Criterio de completado:** Un usuario puede navegar visualmente el grafo, hacer clic en una ley y ver sus relaciones con otras normas.

---

## Fase 3 — Chatbot legal con herramientas

**Objetivo:** Ofrecer un chat que pueda responder preguntas legales usando datos reales del sistema.

| Tarea | Estado |
|-------|--------|
| Integración con Ollama (modelos locales) | Pendiente |
| Integración con LM Studio | Pendiente |
| Integración con APIs externas (OpenAI, Anthropic, Google) | Pendiente |
| Selector de modelo en la interfaz | Pendiente |
| Servidor MCP con FastMCP exponiendo herramientas de la API | Pendiente |
| Tools: buscar ley, obtener artículo, ver diff, consultar grafo, estadísticas | Pendiente |
| Interfaz de chat en Reflex | Pendiente |
| Historial de conversaciones | Pendiente |
| Tests de las herramientas MCP | Pendiente |

**Criterio de completado:** Un usuario puede preguntar "¿Qué cambió en la Ley de Protección de Datos en 2024?" y el chat responde consultando la API real.

---

## Fase 4 — Dashboards de analítica y compliance

**Objetivo:** Paneles visuales para seguimiento legislativo y análisis de tendencias.

| Tarea | Estado |
|-------|--------|
| Dashboard de compliance: normas por sector, alertas, seguimiento | Pendiente |
| Dashboard analítico: reformas por año, leyes más modificadas | Pendiente |
| Gráficos Plotly integrados en Reflex | Pendiente |
| Visualización de densidad de relaciones | Pendiente |
| Evolución histórica del sistema legal | Pendiente |
| Filtros interactivos y exportación de datos | Pendiente |
| Tests de los componentes de dashboard | Pendiente |

**Criterio de completado:** Un analista puede ver tendencias legislativas y un compliance officer puede seguir normas relevantes para su sector.

---

## Fase 5 — Frontend completo con Reflex

**Objetivo:** Unificar todas las capas en una interfaz web coherente y atractiva.

| Tarea | Estado |
|-------|--------|
| Layout principal: navegación, sidebar, áreas de contenido | Pendiente |
| Página de inicio / landing | Pendiente |
| Página de explorador de leyes (listado + detalle) | Pendiente |
| Página del grafo interactivo | Pendiente |
| Página de chat | Pendiente |
| Páginas de dashboards | Pendiente |
| Búsqueda global | Pendiente |
| Tema visual basado en el design system (Space Grotesk, paleta púrpura/azul) | Pendiente |
| Responsive design | Pendiente |
| Accesibilidad básica (ARIA, contraste, navegación por teclado) | Pendiente |

**Criterio de completado:** La aplicación web es navegable, visualmente consistente y funcional en escritorio y móvil.

---

## Fase 6 — Producto: empaquetado y distribución

**Objetivo:** Que cualquier persona pueda descargar y usar LexFlow sin instalar nada.

| Tarea | Estado |
|-------|--------|
| Empaquetado con PyInstaller o Nuitka como binario standalone | Pendiente |
| Instalador Windows (.exe / .msi) | Pendiente |
| Instalador macOS (.dmg) | Pendiente |
| Paquete Linux (.AppImage / .deb) | Pendiente |
| Docker Compose para despliegue en servidor (opción técnica) | Pendiente |
| GitHub Releases con artefactos por plataforma | Pendiente |
| CI/CD para build automático de releases | Pendiente |
| Página de descargas o landing page pública | Pendiente |
| Auto-actualización o mecanismo de notificación de nuevas versiones | Pendiente |
| Documentación de usuario final (no técnica) | Pendiente |

**Criterio de completado:** Un usuario no técnico puede descargar LexFlow desde GitHub, hacer doble clic y empezar a usarlo.

---

## Fase 7 — Búsqueda semántica y RAG avanzado

**Objetivo:** Ir más allá de la búsqueda por texto plano con embeddings y retrieval aumentado.

| Tarea | Estado |
|-------|--------|
| Generación de embeddings para artículos y secciones | Pendiente |
| Índice vectorial (FAISS, ChromaDB o similar) | Pendiente |
| Endpoint de búsqueda semántica | Pendiente |
| RAG pipeline para el chatbot | Pendiente |
| Re-ranking de resultados | Pendiente |
| Tests de calidad de retrieval | Pendiente |

**Criterio de completado:** Las búsquedas devuelven resultados semánticamente relevantes, no solo coincidencias textuales.

---

## Futuro abierto

Estas son ideas que podrían explorarse en fases posteriores:

- **Base de datos de grafos** (Neo4j) para reemplazar NetworkX a escala
- **Notificaciones push** de cambios legislativos
- **API pública** para que terceros integren datos legales
- **Plugins** para que la comunidad añada fuentes de datos (DOUE, BOE histórico)
- **Internacionalización** para legislación de otros países
- **App móvil** nativa o PWA

---

> Este roadmap es un documento vivo. Se actualiza conforme el proyecto avanza y las prioridades evolucionan.
