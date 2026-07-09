# Title Generator — Claude Code Context

## Build & Quality
- `npm run build` — TypeScript check + esbuild (runs `tsc --noEmit --skipLibCheck`)
- `npm run lint` — BROKEN (ESLint v10 config mismatch); do NOT use
- ESLint uses old `.eslintrc` format incompatible with installed ESLint 10; linting unavailable until migrated
- `node test-gfm-tables.test.js` — regression test for the GFM table-separator fix. Self-contained: esbuild + VM, no build artifacts, no `obsidian` import required.
- **Git push rejection**: Remote auto-version-bump creates new commits; always pull --rebase before push

## Git Workflow
- Auto version bump on every commit (e.g. v3.0.116 → v3.0.117 → v3.0.118 in one session). Bump commit message is `chore: bump version to X.Y.Z [skip ci]` and modifies only `dist/manifest.json` + `dist/versions.json`.
- Always `git pull --rebase` before push if remote has new commits. Use `git stash push -u -m "..."` if working tree has uncommitted changes (including the auto-bumped dist files), then `git pull --rebase`, then `git stash pop`.
- If push rejected: `git stash && git pull --rebase && git stash pop && git push`
- **Pre-push cleanup**: stale tracked-but-deleted folders (e.g. `openspec/archive/`, `.quint/`) and auto-bumped dist files can accumulate in the working tree across sessions. `git status -s` before push and decide explicitly whether to include them — never `git add -A` blindly.
- **External scratch dirs**: `.codegraph/` and `.codegraphignore` (MCP/codegraph watcher state) are gitignored as of `0e8bed4`. Do NOT add with `git add -A` even if they appear in `git status`.

## Code Architecture
- **AI Service**: Strategy Pattern — `AIService` dispatches to `OpenAI`/`Anthropic`/`Google`/`OpenRouter` strategy classes
- **GFM Feature**: Pre-transform (regex) → AI refinement → Post-transform (compliance)
- **GFM fence state machine**: `gfmService.transformCodeBlocks` and `gfmService.transformLinks` track `inFence` / `fenceMarker` so existing fenced blocks (opening `\`\`\`` or `~~~` lines) are passed through verbatim. Indented-code → fenced conversion and URL wrapping only run OUTSIDE fences. Inline code spans (balanced backticks) are skipped by URL transform too.
- **GFM table-separator state machine**: `gfmService.transformTables` tracks `inTable` across lines so a separator row is emitted exactly once per table (after the header), not after every pipe-row. Body rows pass through verbatim. Treat this state-machine as the canonical pattern for any per-row transform that risks double-emission.
- **GFM fail-closed**: When `enableGfmReformatting` or `forceGfm` is set and `aiService.reformatForGfm()` returns empty/throws, `processSingleFile` short-circuits with an error notice — no rename, no Gist publish, no silent fallback to raw content. This is the contract for the "Paste & Share to Gist" command path.
- **Settings**: `DEFAULT_SETTINGS` constant + `TitleGeneratorSettingTab` class; add to both when adding settings
- **File operations**: Return `FileOperationResult` interface
- **New service pattern**: Create `xxxService.ts` following `gfmService.ts` — separate concerns, testable
- **Settings pattern**: Add to `DEFAULT_SETTINGS` (constant values) + `TitleGeneratorSettings` interface (types) + `TitleGeneratorSettingTab` class (UI)
- **API key prompt**: Missing keys trigger `ApiKeyPromptModal` popup (defined in `main.ts`, not in settings)
- **Toggle pattern**: Call `this.display()` in onChange to re-render settings tab

## Frontmatter Handling
There are TWO parsers and they are not interchangeable:

| Method | Location | Purpose | Boundary |
|---|---|---|---|
| `splitFrontmatter(content)` | `main.ts` (helper, used by GFM pipeline only) | Split body from frontmatter before sending to AI; re-attach verbatim after post-transform | Anchored `^---\n([\s\S]*?)\n---\n?` — only top-of-file frontmatter matches. Body `\n---\n` (horizontal rules) is left alone. |
| `parseFrontmatter(content)` | `main.ts` (legacy, used by Update Gist / Normalize commands) | Round-trip `Map<string,string>` frontmatter fields for Gist publishing | Regex `/\n---/` matches first closing — non-defensive, can absorb prose if file is already corrupted. The defensive variant stops at any non-`key:value` line and treats the remainder as body, emitting a `console.warn` when it triggers. |

**Rule of thumb:** use `splitFrontmatter` for the AI-reformat path (preserves everything), use `parseFrontmatter` only for the Gist metadata round-trip where you need a `Map`.

## Source Files
| File | Purpose |
|------|---------|
| `src/main.ts` | Plugin entry, commands, `processSingleFile()` pipeline, `splitFrontmatter` helper, `parseFrontmatter`/`serializeFrontmatter` for Gist round-trip |
| `src/aiService.ts` | AI title generation & GFM reformat calls |
| `src/modelService.ts` | Model catalog / capability registry per provider (used by `aiService` strategy dispatch) |
| `src/errorHandler.ts` | Centralized `ErrorHandler` + typed error factories used across `main.ts`, `aiService`, `gfmService`, etc. |
| `src/validation.ts` | Input/filename sanitization + validation (used before AI calls and before file renames) |
| `src/logger.ts` | Lightweight logger wired into `main.ts`; respects `LogLevel` setting |
| `src/constants.ts` | Shared string constants, default prompts, error messages |
| `src/utils.ts` | Path/string helpers shared across services |
| `src/gfmService.ts` | GFM transformation — fence-aware pre/post, task list variants `[x]/(x)/<x>`, Q&A prefix strip, table separator injection, code-block fence tracking, link transform context-aware |
| `src/gistService.ts` | GitHub Gist publishing |
| `src/citationCleanerService.ts` | Strip citation markers from AI output. Preserves leading indentation per line — does NOT collapse ` +` globally (would destroy 4-space code blocks, ASCII alignment, YAML list indent). |
| `src/settings.ts` | Settings UI tab + `DEFAULT_SETTINGS` constant |
| `src/types.ts` | TypeScript interfaces |

## Obsidian Plugin Patterns
- Commands: `addCommand({ id, name, editorCallback })`
- File menu: `registerEvent(app.workspace.on('file-menu', ...))`
- Batch menu: `registerEvent(app.workspace.on('files-menu', ...))`
- Settings tab: Extend `PluginSettingTab`, call `display()` to re-render
- **requestUrl for CORS-safe HTTP**: Use `requestUrl` from 'obsidian' instead of fetch() for GitHub API calls
- **Clipboard**: Use `navigator.clipboard.writeText()` (standard browser API)
- **Frontmatter manipulation**:
  - For the AI-reformat path: always `splitFrontmatter` first, pass `body` through GFM pipeline, re-attach frontmatter verbatim with `` `---\n${frontmatter}\n---\n${body}` ``.
  - For Gist metadata round-trip: use `parseFrontmatter` + `serializeFrontmatter`. Defensive parser will not absorb body content into frontmatter.
  - Never use `parseFrontmatter` on a file whose frontmatter has already been corrupted by an earlier round-trip without first running the "Normalize Gist Frontmatter" command or manually fixing the file.

## Implementation Workflow
- Use the superpowers flow for feature/fix work: `brainstorming` → `writing-plans` → `executing-plans` → `finishing-a-development-branch`. Specs and plans live in `docs/superpowers/specs/` and `docs/superpowers/plans/` with `YYYY-MM-DD-<topic>-{design|fixes}.md` filenames.
- Spec format: numbered findings from a static review → one task per finding, in priority order, with explicit verification (`npm run build`) per task.
- Each fix is its own commit (`fix(gfm): <short description>`) so a regression can be reverted without losing unrelated fixes.
- Two-stage review (spec compliance → code quality) catches real bugs (e.g., fence corruption, silent publish fallback).
- `npm run build` is the primary verification; `node test-gfm-tables.test.js` is the only existing regression test (covers `transformTables`). When adding new GFM transforms, add a case here rather than relying solely on `npm run build`.
- **Auto-version-bump during SDD**: when executing multi-commit plans via `superpowers:subagent-driven-development` directly on `main` (no feature branch), `version-bump.mjs` runs after every commit and edits `dist/manifest.json`+`dist/versions.json`. After the plan finishes, the uncommitted dist files may show a version that no longer matches the latest local chore commit. Always `git pull --rebase` first — the remote's auto-bump commit (timestamped from your commits landing on the server) captures the correct version. Amend your local chore commit to a generic message like `chore: dist artifacts for N <topic> fix commits [skip ci]` to match what the diff actually contains.
