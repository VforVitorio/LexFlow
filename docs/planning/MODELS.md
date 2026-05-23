# Modelos LLM — recomendación por hardware

Guía para elegir qué modelo correr en cada máquina. La aplica el **wizard de modelos** (Fase 8, [`UX-ONBOARDING.md`](UX-ONBOARDING.md) §3) pero también es útil leerla directamente.

Estado a 2026-05-23. Los precios cloud cambian; revisar las URLs oficiales antes de un release público.

---

## Filosofía

**4 tiers visibles, uno pre-seleccionado por hardware.** El usuario nunca queda encerrado en una opción — siempre puede pasar a cloud aunque tenga GPU, o forzar un modelo grande en una máquina pequeña (lento, pero permitido).

---

## Tier 1 — Free local, small

**Para quién:** Cualquier portátil moderno. Mínimo 4-8 GB de RAM. Sin GPU dedicada.

**Modelo por defecto:** `llama3.2:3b` en Ollama (cuantizado Q4_K_M, ~2 GB).

**Alternativas (mismo tier):**

| Modelo | Tamaño Q4 | Notas |
|--------|-----------|-------|
| `llama3.2:3b` | ~2 GB | **Default.** Buen balance, español decente |
| `phi3:mini` (3.8B) | ~2.3 GB | Mejor razonamiento, español mediocre |
| `qwen2.5:3b` | ~2 GB | Mejor multilingüe que Llama 3.2 |
| `gemma3:4b` | ~2.5 GB | Google, español decente |

**Limitaciones para uso legal:**
- Respuestas correctas para preguntas simples ("¿qué es la LOPDGDD?")
- Síntesis pobre en cadenas largas (>3 párrafos)
- No cites palabra por palabra — paráfrasis aceptable, citas literales no fiables
- Sin razonamiento sobre múltiples normas a la vez

---

## Tier 2 — Best local, balanced

**Para quién:** Portátiles con 16 GB RAM unificada (Apple Silicon M1/M2/M3) o equipos con 16 GB + GPU integrada / GPU dedicada con 8 GB VRAM.

**Modelo por defecto:** `qwen2.5:7b` en Ollama (~4.5 GB Q4).

**Alternativas:**

| Modelo | Tamaño Q4 | Notas |
|--------|-----------|-------|
| `qwen2.5:7b` | ~4.5 GB | **Default.** Mejor español + razonamiento del tier |
| `llama3.1:8b` | ~4.7 GB | Sólido, español ligeramente peor que Qwen |
| `qwen2.5:14b` (Q4) | ~9 GB | Cabe en 16 GB unificada — siguiente paso si la RAM lo permite |

**Apto para:**
- Análisis de artículos individuales con contexto de la ley completa
- Síntesis de un par de normas relacionadas
- Generación de borradores cortos (escritos, comunicaciones)

**Limitaciones:**
- Cadenas de razonamiento muy largas siguen fallando
- Sin RAG aún (Fase 7), no puede citar literalmente del corpus

---

## Tier 3 — Best local, large

**Para quién:** Workstation. GPU NVIDIA con ≥16 GB VRAM (RTX 4080/4090, A4000+) o Apple Silicon con ≥32 GB unificada (M2/M3 Pro/Max/Ultra).

**Modelo por defecto:** `qwen2.5:32b` en Ollama (~20 GB Q4).

**Alternativas:**

| Modelo | Tamaño Q4 | Hardware mínimo | Notas |
|--------|-----------|-----------------|-------|
| `qwen2.5:32b` | ~20 GB | 24 GB VRAM o 32 GB unificada | **Default.** Ratio cabe en una sola GPU consumidor |
| `llama3.3:70b` | ~40 GB | 48 GB VRAM (2×24 GB) o 64 GB unificada | Mejor en inglés. En español queda parejo o por debajo de Qwen 32B |
| `qwen2.5:72b` | ~42 GB | 48 GB VRAM o 64 GB unificada | Mejor del local actualmente para español legal |

**Apto para:**
- Análisis cruzado de múltiples normas
- Generación de documentos largos (dictámenes, informes)
- Razonamiento sobre interacciones legales complejas
- Buen comportamiento con tool-use (MCP) en cadena

**Limitaciones:**
- Latencia: 1-5 segundos por respuesta corta, hasta 30-60 s para largas
- Sin RAG aún

---

## Tier 4 — Best cloud, pay-per-use

**Para quién:** Cualquiera sin hardware suficiente, o que prefiera consistencia y velocidad sobre privacidad. **Requiere API key del proveedor.**

### Modelo por defecto: **Claude Sonnet 4.6** (Anthropic)

| Métrica | Valor |
|---------|-------|
| Precio input | $3 / 1M tokens |
| Precio output | $15 / 1M tokens |
| Coste estimado de una Q&A típica (~500 in + 500 out) | ~$0.009 |
| Coste de un documento largo (~3k in + 3k out) | ~$0.054 |
| Calidad en español legal | Excelente |
| Latencia | ~1-3 s primer token, streaming muy fluido |

Razón del default: mejor balance precio/calidad para español jurídico. Anthropic suele ser conservador con alucinaciones legales.

### Alternativas

| Proveedor | Modelo | Input $/1M | Output $/1M | Notas |
|-----------|--------|------------|-------------|-------|
| Anthropic | Claude Opus 4.7 | $5 | $25 | Top calidad. Tokenizer puede emitir ~35% más tokens — coste real es más alto |
| Anthropic | Claude Haiku 4.5 | $1 | $5 | Más barato, calidad razonable para chat conversacional |
| OpenAI | GPT-5.4 | $2.50 | $15 | Comparable a Sonnet 4.6 en calidad, ligeramente mejor en código |
| OpenAI | GPT-4o | $2.50 | $10 | Económico, calidad menor en razonamiento legal complejo |
| Google | Gemini 2.5 Flash | ~$0.10 | ~$0.40 | El más barato del cuadro. Calidad aceptable para tareas simples |

> **Atención:** Gemini 2.0 Flash queda obsoleto el 2026-06-01 (deprecated Feb 2026, shutdown June 1). Si elegimos Gemini, default = 2.5 Flash. Codigicar en el wizard para no hardcodear 2.0.

### Privacidad y compliance

Antes de mandar una consulta a un proveedor cloud, el chat muestra una banderita "Consulta enviada a Anthropic / OpenAI / Google. Tus datos no se quedan guardados aquí." con link al privacy policy del proveedor. Para clientes legales sensibles, esto es decisivo.

LexFlow nunca envía la consulta a un proveedor cloud sin que el usuario haya configurado explícitamente esa opción en el wizard.

---

## Tabla resumen para el wizard

| Tier | Default modelo | Hardware mínimo | Coste | Latencia típica |
|------|---------------|-----------------|-------|-----------------|
| Free local, small | `llama3.2:3b` | 8 GB RAM | Gratis | 500ms-2s |
| Best local, balanced | `qwen2.5:7b` | 16 GB RAM o 8 GB VRAM | Gratis | 1-3s |
| Best local, large | `qwen2.5:32b` | 24 GB VRAM o 32 GB unificada | Gratis | 2-10s |
| Best cloud, pay-per-use | Claude Sonnet 4.6 | Solo internet | ~$0.01-0.05 por consulta | 1-3s primer token |

---

## Recomendaciones por perfil de usuario

| Perfil | Sugerencia |
|--------|------------|
| Estudiante de derecho con portátil estándar | Tier 1 o 2 según RAM. Cloud (Haiku) si necesita rapidez puntual |
| Abogado en bufete pequeño | Tier 2 local + cloud (Sonnet 4.6) para consultas serias |
| Despacho que maneja datos sensibles | Tier 3 local, **nunca** cloud — privacidad como prioridad |
| Periodista cubriendo legislación | Tier 4 cloud (Sonnet 4.6 o Gemini 2.5 Flash), latencia y consistencia ganan |
| Investigador / académico | Tier 3 local + Tier 4 para comparar respuestas. Cloud (Opus) para análisis profundos |

---

## Embeddings (Fase 7, futuro)

Cuando la Fase 7 (RAG) llegue, habrá un wizard parecido para el modelo de embeddings:

| Opción | Notas |
|--------|-------|
| `bge-m3` (local, Ollama) | Multilingüe, ~1 GB, buen español |
| `text-embedding-3-small` (OpenAI) | $0.02 / 1M tokens, multilingüe |
| `roberta-base-bne` (BSC, local) | Español puro, ideal para corpus legal español |

Decisión cerrada cuando Fase 7 entre en planificación detallada.

---

## Fuentes

- [Ollama library](https://ollama.com/library)
- [Ollama System Requirements 2026](https://localaimaster.com/blog/ollama-system-requirements)
- [Best Local LLMs on Apple Silicon](https://apxml.com/posts/best-local-llm-apple-silicon-mac)
- [Anthropic API pricing 2026](https://www.cloudzero.com/blog/claude-api-pricing/)
- [OpenAI API pricing 2026](https://www.cloudzero.com/blog/openai-pricing/)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Ollama VRAM requirements guide](https://localllm.in/blog/ollama-vram-requirements-for-local-llms)
