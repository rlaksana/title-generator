# Bounded Context: Title Generator Plugin

## Vocabulary
- **Provider**: An AI service (OpenAI, Anthropic, Google Gemini).
- **Model**: A specific AI model (e.g., `gpt-4o`, `claude-3-5-sonnet`).
- **Title Refinement**: Shortening a title that exceeds length limits via a second AI call.
- **Sanitization**: Removing characters forbidden by the operating system for filenames.
- **Content Length**: The slice of note text (e.g., first 2000 chars) sent to the AI.
- **BRAT**: Beta Reviewer's Auto-update Tool for Obsidian.

## Invariants
- **Mobile Compatibility**: Must use Obsidian's `requestUrl` or native `fetch`.
- **Filename Safety**: All titles MUST be sanitized before file renaming.
- **Performance**: Models MUST be cached (TTL 1 hour) to minimize API latency.
- **Privacy**: API keys and sensitive tokens MUST NOT be logged to the console.
- **Idempotency**: Renaming to the same title should be handled gracefully.

## Tech Stack
- TypeScript, Node.js 18, esbuild.
- Obsidian API.
