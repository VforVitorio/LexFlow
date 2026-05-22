# Chat and MCP

Source: [`src/lexflow/chat/`](../../src/lexflow/chat/). Depends on the
`chat` extra in `pyproject.toml` (`fastmcp`, `ollama`, `openai`, `anthropic`,
`google-genai`).

## Provider interface — [`chat/base.py`](../../src/lexflow/chat/base.py)

```python
class ChatMessage(BaseModel):
    role: str           # 'user' | 'assistant' | 'system'
    content: str

class ChatProvider(ABC):
    @abstractmethod
    async def list_models(self) -> list[str]: ...

    @abstractmethod
    def stream_chat(
        self,
        messages: list[ChatMessage],
        model: str,
    ) -> AsyncIterator[str]: ...

class ChatProviderError(Exception): ...
```

Every provider returns plain text chunks. Higher-level concerns (tool calls,
citations, SSE framing) wrap the stream — they are **not** part of the
provider contract.

## Providers — [`chat/providers/`](../../src/lexflow/chat/providers/)

| File | Class | Backend | Models endpoint | Auth |
|------|-------|---------|------------------|------|
| [`ollama.py`](../../src/lexflow/chat/providers/ollama.py) | `OllamaProvider` | Local Ollama (`http://localhost:11434`) | `ollama.AsyncClient.list()` | none |
| [`lmstudio.py`](../../src/lexflow/chat/providers/lmstudio.py) | `LMStudioProvider` | Local LM Studio (OpenAI-compatible, `http://localhost:1234/v1`) | dummy `lm-studio` key | none |
| [`openai_provider.py`](../../src/lexflow/chat/providers/openai_provider.py) | `OpenAIProvider` | OpenAI API | `client.models.list()` filtered to `gpt*` | `OPENAI_API_KEY` env |
| [`anthropic_provider.py`](../../src/lexflow/chat/providers/anthropic_provider.py) | `AnthropicProvider` | Anthropic API | hard-coded list (`claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`) | `ANTHROPIC_API_KEY` env |
| [`google_provider.py`](../../src/lexflow/chat/providers/google_provider.py) | `GoogleProvider` | Google Gemini | hard-coded list (`gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-1.5-pro`) | `GOOGLE_API_KEY` env |

### Provider-specific quirks

- **Anthropic** treats `system` as a top-level parameter, not a message —
  the provider extracts and joins `system` messages before the call. Uses
  `client.messages.stream(...)` and yields from `stream.text_stream`.
- **Google Gemini** does not have a `system` role; the provider maps
  `system` → `user` so it appears as a preamble turn.
- **LM Studio** speaks the OpenAI chat-completions API on a different port,
  so the implementation reuses the `openai` SDK with a custom `base_url`.

### Error handling

Each provider catches the SDK-native auth / rate-limit / connection errors
and re-raises as `ChatProviderError`. Higher layers should treat
`ChatProviderError` as "show the user a friendly toast; do not retry".

## MCP server — [`chat/mcp_server.py`](../../src/lexflow/chat/mcp_server.py)

A [FastMCP](https://github.com/jlowin/fastmcp) server that exposes Core
operations as tools, callable by any MCP-aware client (Claude Desktop,
Cursor, custom agents).

Server name: `lexflow-legal`.

| Tool | Args | Returns |
|------|------|---------|
| `search_law(query)` | free-text query | first page of `SearchResponse.model_dump()` (10 items) |
| `get_law(law_id)` | BOE id | `Law.model_dump()` or `{ "error": "not_found", "law_id": ... }` |
| `get_article(law_id, article_number)` | both | `Article.model_dump()` or error dict |
| `get_stats()` | — | `{ "total_laws": int }` |

The tools share the singleton registry via `get_registry()`, so they hit the
same cache as the HTTP API.

Run standalone:
```bash
uv run python -m lexflow.chat.mcp_server
```

## Not yet implemented

The chat **HTTP layer** is not wired into FastAPI. There is no
`POST /api/v1/chat/...` or SSE endpoint today; the SSE shape is documented
in [api-contract.md](../architecture/api-contract.md). The providers exist
and are unit-testable in isolation. Track the wiring in the chat epic.

## Where things live

| You want to… | Edit |
|--------------|------|
| Add a provider | new file in `chat/providers/`, register in `chat/providers/__init__.py:__all__` |
| Add a model id to a hard-coded list | the constant at the top of the provider file |
| Add an MCP tool | a `@mcp.tool()` function in `chat/mcp_server.py` |
| Change the env var name for an API key | the provider constructor (`os.environ.get(...)`) |
