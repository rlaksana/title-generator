# Paste Content Preservation — D+Guardrail Design

**Date:** 2026-07-09
**Branch:** main
**Scope:** Remove silent-corruption vectors from the paste & share pipeline, and add deterministic guards around AI body reformat so a bad AI output cannot overwrite user content without recovery.
**Constraint:** Surgical. No architectural redesign of `processSingleFile()`. No new test framework — extend `test-gfm-tables.test.js` pattern if needed. Verification = `npm run build` + new regression test cases.

---

## Goal

Three classes of silent corruption have been observed in the paste pipeline:

1. **T1 — `validationService.sanitizeInput` strips Markdown content.** Removes `<>`, escapes `&` to literal `&amp;`, removes all quotes. Runs before every command, including `paste-to-note` (no GFM path). Smart quotes, `<details>`, `&copy;`, attribute-quoted text all get destroyed.
2. **T4/T6 — Pre/post-transform regex pass drops legitimate content.** `stripCitations` deletes `## References` sections in technical notes. `stripPromptEcho` and `stripInstructions` use natural-language patterns (`/^Output\b/i`, `/^Format\b/i`) that match legitimate body lines.
3. **T5 — AI body reformat overwrites original without safety gate.** `reformatForGfm` rewrites the entire body. If the AI truncates (max_tokens=8192 for Anthropic/Kimi/MiniMax), hallucinates, or "improves" the text, the result is silently written via `vault.modify`. Only an empty response is caught (fail-closed). Partial corruption is not.

**Goal of this work:** Eliminate (1) and (2) by removing the deterministic transforms that produce false positives, and add a deterministic guard around (3) so any partial corruption is detected and recoverable.

---

## Non-Goals

- No migration to Markdown AST parser. Noted as Phase 3 hardening option.
- No removal of `reformatForGfm` AI call itself. The trade-off is accepted: AI rewrite is single-source-of-truth, but bounded by guards.
- No UI changes beyond adding one Notice when a guard fires.
- No changes to title-generation flow (only body path).
- No new settings — guards are always on, AI-skip threshold uses existing `maxContentLength` setting.

---

## Findings (Priority Order)

### F1. Remove `sanitizeInput` from body path — T1 root cause

**File:** `src/main.ts:473`

**Current:**
```typescript
const sanitizedContent = this.validationService.sanitizeInput(content);
this.logger.debug(`Generating title for file: ${file.path}`);
const newTitle = await this.aiService.generateTitle(sanitizedContent);
```

**Problem:** `sanitizeInput` (validation.ts:474) strips `<>`, escapes `&`, strips quotes. Body content is destroyed. The function name implies XSS defense, but Obsidian does not render HTML as XSS surface and the output is only used as AI prompt input and (indirectly) for filename — neither benefits from this sanitization.

**Fix:**
- Pass `content` directly to `aiService.generateTitle` (no `sanitizeInput`).
- Remove the `sanitizedContent` variable. The variable name already implies a loss of fidelity.

**Verification:** Existing `npm run build`. New test case: paste content with smart quotes + `<details>` + `&amp;` → title generated without content loss.

**Lines:** `src/main.ts:473` — remove 1 line.

---

### F2. Remove `preTransform` from paste path — T4 false-positive root cause

**File:** `src/main.ts:490-493`

**Current:**
```typescript
const preTransformed = this.gfmService.preTransform(
  bodyWithoutFrontmatter,
  this.settings.stripCitations
);
const reformatted = await this.aiService.reformatForGfm(
  preTransformed,
  this.settings.gfmPrompt,
  sanitizedTitle
);
```

**Problem:** `preTransform` (gfmService.ts:13) runs 6 regex passes including `citationCleanerService.stripCitations` which deletes `## References` headings + content under them (citationCleanerService.ts:21-22). Even with `stripCitations: false`, `transformTaskLists`, `normalizeIndentedCode`, `transformTables` apply state-machine regexes that misfire on edge cases.

**Fix:**
- Pass `bodyWithoutFrontmatter` directly to `reformatForGfm`. No pre-transform.
- Keep `gfmService.preTransform` exported (used elsewhere? check) — do not delete, just stop calling it from `processSingleFile`.

**Verification:** `npm run build`. Test: note with `## References` heading + citations preserved through GFM reformat.

**Lines:** `src/main.ts:490-493` — remove 3 lines, replace 1 line.

---

### F3. Replace `postTransform` regex pass with sentinel extraction + safety filter — T6 false-positive + T5 guard

**File:** `src/main.ts:527-531`, `src/aiService.ts:438-450`, `src/gfmService.ts:47-83`

**Current flow:**
```
preTransformed → reformatForGfm → reformatted → postTransform (stripInstructions + stripPromptEcho + stripQaPrefix + convertIndentedCode + transformLinks + collapse blanks) → transformedBody
```

**Problem:**
- `stripInstructions` matches 15 regex patterns including `/^Format the following.*$/gim` (gfmService.ts:98) which eats legitimate body lines like `Format the following table` in technical notes.
- `stripPromptEcho` matches `/^Output\b/i`, `/^Format\b/i`, etc. (gfmService.ts:147-154) and eats lines like `Output: 42 widgets per cluster`.
- `stripQaPrefix` matches `Q:` / `Question:` lines, which can appear in interview transcripts or Q&A notes.
- AI can return `Output ONLY the transformed content.` as an instruction leak that these filters then strip — but only sometimes. Unreliable.

**Fix:**
- Inject a unique sentinel pair around the body content in the AI prompt: `<<GFM_BODY_START_<uuid>>>...content...<<GFM_BODY_END_<uuid>>>>`.
- Extract the body as substring between sentinels (deterministic boundary).
- If sentinel missing → fail closed (do not modify file).
- Replace `gfmService.postTransform` with a minimal function: collapse 3+ blank lines to 2. Remove `stripInstructions`, `stripPromptEcho`, `stripQaPrefix` from post-pipeline.

**Sentinel format:**
- UUID generated per-call (collision-free).
- Wrapped in `<<>>` to be Markdown-safe (Obsidian does not interpret `<<` as anything).
- Added to prompt at `aiService.reformatForGfm` and embedded in expected output format instruction.

**Verification:** `npm run build`. Test: AI returns body wrapped in sentinels → extracted cleanly. Test: AI returns body without sentinels (truncation leak) → fail-closed, file unchanged, Notice shown.

**Lines:** `src/aiService.ts` — modify `reformatForGfm` to inject + check sentinels (~30 LOC). `src/gfmService.ts` — replace `postTransform` body with minimal collapse-blanks (~10 LOC). `src/main.ts` — adjust call site (~10 LOC).

---

### F4. Add truncation/length guards around `reformatForGfm` — T5 detection

**File:** `src/main.ts:494-514`

**Current:**
```typescript
const reformatted = await this.aiService.reformatForGfm(...);
if (!reformatted) { /* fail-closed */ }
```

**Problem:** Only catches empty response. A truncated-but-non-empty response passes through.

**Fix:** Add deterministic checks BEFORE `vault.modify`:

| Guard | Condition | Action |
|---|---|---|
| Sentinel missing | Regex `<<GFM_BODY_END_...>>` not in output | Fail-closed, no modify |
| Output ends mid-fence | Last 200 chars contain unclosed ` ``` ` or ` ~~~ ` | Fail-closed |
| Output ends mid-table | Last 100 chars contain unclosed `\|` row | Fail-closed |
| Length delta extreme | `output.length < input.length * 0.5` | Fail-closed (50% threshold is conservative) |
| Heading set shrunk | `output` has fewer `^#{1,6} ` lines than `input` | Fail-closed |
| Fence count parity | ` ``` ` count in output is odd | Fail-closed |
| Token pre-check | `bodyWithoutFrontmatter.length > 24000` (~6000 tokens) | Skip AI entirely, use raw body for Gist publish |

**Threshold rationale:** `bodyWithoutFrontmatter.length > 24000` ≈ 6000 tokens input + 2000 tokens expected output = 8000+ tokens total = within 8192 budget but no margin for safety. Skip AI to avoid truncation entirely.

**Verification:** Each guard has a corresponding test case. Manual: 5 real paste cases from Perplexity, ChatGPT, GitHub gist, paper PDF, blog post.

**Lines:** New helper function `validateGfmOutput(input, output): { valid, reason }` in `src/gfmService.ts` (~50 LOC). Call site in `main.ts` (~15 LOC).

---

### F5. Snapshot `.bak` before destructive modify — T5 recovery

**File:** `src/main.ts:552-557`

**Current:**
```typescript
if (finalContent !== content) {
  await this.app.vault.modify(
    this.app.vault.getAbstractFileByPath(candidatePath) as TFile,
    finalContent
  );
}
```

**Problem:** If `finalContent` is corrupted and `validateGfmOutput` missed it, user has no recovery path.

**Fix:** Before `vault.modify`, write `content` (original) to `<dir>/<basename>.bak.<timestamp>.md`. Timestamp = ISO8601 with `:` and `.` replaced (same convention as paste filename). If a `.bak` already exists, overwrite (keep only last snapshot).

**Why `.bak.<timestamp>.md` and not just `.bak`:** Obsidian ignores files that don't have `.md` extension from its index — `.bak.<timestamp>.md` would actually be indexed. Better convention: `.bak.<timestamp>` (no `.md` suffix), so Obsidian ignores it but file is on disk. Actually re-checking: Obsidian index is by `.md` extension only. So `.bak.<timestamp>` is the right choice. **Correction: file name = `<basename>.bak.<timestamp>`** (no `.md`, so Obsidian Vault won't index or display it).

**Trade-off accepted:** User has one recovery snapshot per paste. Better than zero recovery.

**Verification:** Manual: paste → check `.bak` exists → restore by renaming if needed.

**Lines:** New helper `snapshotBeforeModify(file, content): Promise<void>` in `src/main.ts` (~10 LOC). Call site ~3 LOC.

---

### F6. Add Notice on guard failure — UX clarity

**File:** `src/main.ts:499-514`, `src/main.ts` guard handlers

**Fix:** When any guard from F4 fires, show Notice: `"GFM reformat failed validation (<reason>). File unchanged. Snapshot saved to <bak-path>."` Duration: 8000ms.

**Verification:** Manual.

**Lines:** ~10 LOC across guard handlers.

---

## Files Touched

| File | Findings | LOC delta |
|---|---|---|
| `src/main.ts` | F1, F2, F3-call, F4-call, F5, F6 | ~40 |
| `src/aiService.ts` | F3-prompt | ~30 |
| `src/gfmService.ts` | F3-post, F4-helper | ~60 |
| `test-gfm-paste.test.js` (new) | All findings regression | ~120 |

No new files in `src/`. One new test file at repo root, following `test-gfm-tables.test.js` pattern.

---

## Execution Order & Verification Strategy

Each finding ends with `npm run build` succeeding before the next begins. Test file is built incrementally — each finding adds its cases.

1. **F1** remove `sanitizeInput` → `npm run build` + 1 test case.
2. **F2** remove `preTransform` → `npm run build` + 1 test case.
3. **F3** sentinel extraction + minimal post-transform → `npm run build` + 2 test cases (sentinel present, sentinel missing).
4. **F4** guard suite → `npm run build` + 6 test cases (one per guard).
5. **F5** snapshot helper → `npm run build` + 1 test case.
6. **F6** notice UX → manual verification, no test needed.

Each fix is a separate commit (`fix(paste): <short>`), matching CLAUDE.md project convention.

---

## Rollback Plan

Each fix is independent and individually revertible. F1/F2 remove code (no behavior addition), F3-F6 add code (no behavior removal). Worst case: revert the F3-F6 commits in reverse order; revert F1+F2 last.

If any guard has false-positive rate >5% on real-world paste corpus, the specific guard can be loosened (e.g., 50% length threshold → 30%) or disabled via a per-call option without affecting other fixes.

---

## Phase 2 / Phase 3 (Out of Scope, Noted for Future)

- **Phase 2 validation:** Golden test suite for smart quotes, `<details>`, `&amp;`, `## References`, code fence, indented code, table, `Output:` lines. Built incrementally per finding.
- **Phase 3 hardening:**
  - Markdown AST parser (e.g., `remark`, `mdast-util-gfm`) instead of regex transforms for non-AI-needed edits.
  - Diff preview modal before destructive modify.
  - Per-provider `maxOutputTokens` config so guard thresholds adapt to model capability.
  - Retention policy for `.bak` files (e.g., keep last 5).