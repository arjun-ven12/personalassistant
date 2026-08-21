# Ollama Integration

Set `LOCAL_AI_ENABLED=true` and configure `OLLAMA_BASE_URL` (default
`http://127.0.0.1:11434`). The API checks `/` and `/api/tags`; it never pulls a
model automatically. Install `gemma3:4b` through an explicit owner action.

The adapter uses `/api/generate` with `format: "json"` for interpretation and
never sends tool definitions or executable content.
