## Context

The GFM reformat pipeline in `src/main.ts` currently flows as:
1. `preTransform` — normalize input Markdown (line endings, task lists, code blocks, etc.)
2. `reformatForGfm` — AI call to reformat content
3. `postTransform` — GFM compliance (code blocks, tables, HTML sanitization, link formatting)

After the AI call, the reformatted content sometimes contains:
1. **Leaked instructions**: Fragments of the system prompt or user instructions appearing in the output
2. **Q&A prefix**: Questions followed by answers (e.g., "Q: How do I...?\n\nA: To do this...")

These artifacts must be stripped before final output.

## Goals / Non-Goals

**Goals:**
- Strip instruction fragments from AI output (regex-based detection of prompt-like content)
- Strip Q&A prefix pattern from AI output (lines starting with "Q:" or "Question:" before answer content)
- Integrate cleanly into existing `postTransform` chain in `GfmService`

**Non-Goals:**
- Not a general-purpose text cleaner — only targets known artifact patterns
- Does not use AI for cleanup — pure regex-based detection
- Does not modify the AI prompt itself (that belongs in `gfmPrompt` setting)

## Decisions

### Decision 1: Add cleanup as dedicated methods in GfmService

**Choice**: Add `stripInstructions` and `stripQaPrefix` as private methods, call both from `postTransform`

**Rationale**: Keeps cleanup logic co-located with other GFM transformations. Adding a separate service would be over-engineering for two regex-based methods.

**Alternatives considered**:
- Create a new `CleanupService` — overkill for 2 simple regex methods
- Add to `main.ts` directly — violates single responsibility, makes testing harder

### Decision 2: Q&A prefix detection pattern

**Pattern**: Lines matching `^(?:Q:|Question:)\s*.+$` at the start of content, followed by lines matching `^(?:A:|Answer:)\s*.+$`

**Rationale**: Common patterns across AI providers. Strips the question line(s) and any blank lines between question and answer, keeping only the answer content.

**Alternatives considered**:
- Strip everything before first heading — too aggressive, users may have intentional headings at top
- Strip everything before first code block — misses text-only answers

### Decision 3: Instruction stripping detection

**Pattern**: Detect and remove content that looks like:
- Lines matching system prompt patterns (e.g., "You are a helpful assistant", "Instructions:", "Format the following content")
- Duplicated fragments that appear both in prompt and output

**Rationale**: No perfect detection exists, so use heuristic patterns that catch common instruction leakage without removing legitimate content.

**Alternatives considered**:
- Exact prompt matching — fragile, prompt may vary
- Keep instruction stripping conservative — prefer leaving a bit of noise over accidentally removing valid content

## Risks / Trade-offs

[Risk] Over-stripping legitimate content that happens to match Q&A or instruction patterns
→ **Mitigation**: Test with real examples, make patterns conservative (require specific prefixes like "Q:")

[Risk] Instruction stripping may miss novel prompt formats
→ **Mitigation**: Log when stripping occurs in debug mode for user feedback

[Risk] Adding cleanup to `postTransform` adds latency
→ **Mitigation**: Regex operations are O(n) on content length, negligible compared to AI call

## Open Questions

1. Should we expose cleanup settings to users (toggle Q&A stripping on/off)?
   - **Decision**: Not in initial implementation. Can be added later if users request it.
2. Should debug mode log what was stripped?
   - **Decision**: Yes, use existing `debugMode` setting to log cleanup actions.
