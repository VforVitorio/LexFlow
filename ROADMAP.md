# Roadmap de LexFlow

Este documento describe las fases de desarrollo planificadas para LexFlow, desde los cimientos hasta la distribucion como producto final.

Cada fase agrupa trabajo por area funcional. Las fases no son estrictamente secuenciales: pueden solaparse, pero cada una tiene criterios claros de "hecho".

---

## Fase 0 — Fundacion del proyecto

**Objetivo:** Tener el repositorio, CI/CD y flujo de desarrollo listos para que cualquier persona pueda contribuir.

| Tarea | Estado |
|-------|--------|
| Estructura del repositorio y paquete Python | Hecho |
| pyproject.toml con dependencias y herramientas | Hecho |
| README, CONTRIBUTING, CODE_OF_CONDUCT | Hecho |
| Issue templates y PR template | Hecho |
| GitHub Actions (test, lint, typecheck) | Hecho |
| Proteccion de ramas (main, dev) | Hecho |
| Rama `dev` creada y configurada | Hecho |

**Criterio de completado:** Un contribuidor externo puede clonar, instalar, ejecutar tests y abrir un PR sin friccion.

---

## Fase 1 — API base y nucleo de datos

**Objetivo:** Parsear el repositorio legalize-es y exponerlo a traves de una API REST funcional.

| Tarea | Estado |
|-------|--------|
| Parser de Markdown para leyes (titulo, articulos, secciones, metadatos) | Pendiente |
| Modelos Pydantic para Ley, Articulo, Version, Referencia | Pendiente |
| Clonar/sincronizar legalize-es como submódulo o fuente de datos | Pendiente |
| Endpoints CRUD: listado de leyes, detalle, articulos | Pendiente |
| Endpoint de versiones historicas (git log por ley) | Pendiente |
| Endpoint de diffs entre versiones | Pendiente |
| Busqueda por texto (full-text search) | Pendiente |
| Tests de integracion para todos los endpoints | Pendiente |
| Documentacion OpenAPI pulida | Pendiente |

**Criterio de completado:** `GET /laws`, `GET /laws/{id}`, `GET /laws/{id}/articles`, `GET /laws/{id}/versions`, `GET /laws/{id}/diff` funcionan contra datos reales de legalize-es.

---

## Fase 2 — Grafo de conocimiento legal

**Objetivo:** Construir y visualizar un grafo navegable de relaciones entre normas.

| Tarea | Estado |
|-------|--------|
| Extraccion de referencias cruzadas entre leyes | Pendiente |
| Modelo de grafo con NetworkX (nodos: leyes, articulos; aristas: referencias) | Pendiente |
| Algoritmos de relevancia y clustering | Pendiente |
| Endpoints de grafo: vecinos, caminos, subgrafos | Pendiente |
| Componente Reflex para visualizacion interactiva del grafo | Pendiente |
| Filtros por tematica, estado, periodo, tipo de relacion | Pendiente |
| Panel lateral de detalle al hacer clic en un nodo | Pendiente |
| Colores y tamanos de nodo segun propiedades (estado, categoria, ano) | Pendiente |
| Tests unitarios del modelo de grafo | Pendiente |

**Criterio de completado:** Un usuario puede navegar visualmente el grafo, hacer clic en una ley y ver sus relaciones con otras normas.

---

## Fase 3 — Chatbot legal con herramientas

**Objetivo:** Ofrecer un chat que pueda responder preguntas legales usando datos reales del sistema.

| Tarea | Estado |
|-------|--------|
| Integracion con Ollama (modelos locales) | Pendiente |
| Integracion con LM Studio | Pendiente |
| Integracion con APIs externas (OpenAI, Anthropic, Google) | Pendiente |
| Selector de modelo en la interfaz | Pendiente |
| Servidor MCP con FastMCP exponiendo herramientas de la API | Pendiente |
| Tools: buscar ley, obtener articulo, ver diff, consultar grafo, estadisticas | Pendiente |
| Interfaz de chat en Reflex | Pendiente |
| Historial de conversaciones | Pendiente |
| Tests de las herramientas MCP | Pendiente |

**Criterio de completado:** Un usuario puede preguntar "Que cambio en la Ley de Proteccion de Datos en 2024?" y el chat responde consultando la API real.

---

## Fase 4 — Dashboards de analitica y compliance

**Objetivo:** Paneles visuales para seguimiento legislativo y analisis de tendencias.

| Tarea | Estado |
|-------|--------|
| Dashboard de compliance: normas por sector, alertas, seguimiento | Pendiente |
| Dashboard analitico: reformas por ano, leyes mas modificadas | Pendiente |
| Graficos Plotly integrados en Reflex | Pendiente |
| Visualizacion de densidad de relaciones | Pendiente |
| Evolucion historica del sistema legal | Pendiente |
| Filtros interactivos y exportacion de datos | Pendiente |
| Tests de los componentes de dashboard | Pendiente |

**Criterio de completado:** Un analista puede ver tendencias legislativas y un compliance officer puede seguir normas relevantes para su sector.

---

## Fase 5 — Frontend completo con Reflex

**Objetivo:** Unificar todas las capas en una interfaz web coherente y atractiva.

| Tarea | Estado |
|-------|--------|
| Layout principal: navegacion, sidebar, areas de contenido | Pendiente |
| Pagina de inicio / landing | Pendiente |
| Pagina de explorador de leyes (listado + detalle) | Pendiente |
| Pagina del grafo interactivo | Pendiente |
| Pagina de chat | Pendiente |
| Paginas de dashboards | Pendiente |
| Busqueda global | Pendiente |
| Tema visual basado en el design system (Space Grotesk, paleta purpura/azul) | Pendiente |
| Responsive design | Pendiente |
| Accesibilidad basica (ARIA, contraste, navegacion por teclado) | Pendiente |

**Criterio de completado:** La aplicacion web es navegable, visualmente consistente y funcional en escritorio y movil.

---

## Fase 6 — Producto: empaquetado y distribucion

**Objetivo:** Que cualquier persona pueda descargar y usar LexFlow sin instalar nada.

| Tarea | Estado |
|-------|--------|
| Empaquetado con PyInstaller o Nuitka como binario standalone | Pendiente |
| Instalador Windows (.exe / .msi) | Pendiente |
| Instalador macOS (.dmg) | Pendiente |
| Paquete Linux (.AppImage / .deb) | Pendiente |
| Docker Compose para despliegue en servidor (opcion tecnica) | Pendiente |
| GitHub Releases con artefactos por plataforma | Pendiente |
| CI/CD para build automatico de releases | Pendiente |
| Pagina de descargas o landing page publica | Pendiente |
| Auto-actualizacion o mecanismo de notificacion de nuevas versiones | Pendiente |
| Documentacion de usuario final (no tecnica) | Pendiente |

**Criterio de completado:** Un usuario no tecnico puede descargar LexFlow desde GitHub, hacer doble clic y empezar a usarlo.

---

## Fase 7 — Busqueda semantica y RAG avanzado

**Objetivo:** Ir mas alla de la busqueda por texto plano con embeddings y retrieval aumentado.

| Tarea | Estado |
|-------|--------|
| Generacion de embeddings para articulos y secciones | Pendiente |
| Indice vectorial (FAISS, ChromaDB o similar) | Pendiente |
| Endpoint de busqueda semantica | Pendiente |
| RAG pipeline para el chatbot | Pendiente |
| Re-ranking de resultados | Pendiente |
| Tests de calidad de retrieval | Pendiente |

**Criterio de completado:** Las busquedas devuelven resultados semanticamente relevantes, no solo coincidencias textuales.

---

## Futuro abierto

Estas son ideas que podrian explorarse en fases posteriores:

- **Base de datos de grafos** (Neo4j) para reemplazar NetworkX a escala
- **Notificaciones push** de cambios legislativos
- **API publica** para que terceros integren datos legales
- **Plugins** para que la comunidad aada fuentes de datos (DOUE, BOE historico)
- **Internacionalizacion** para legislacion de otros paises
- **App movil** nativa o PWA

---

> Este roadmap es un documento vivo. Se actualiza conforme el proyecto avanza y las prioridades evolucionan.
