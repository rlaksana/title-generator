# Paste Content Preservation — D+Guardrail Plan

**Date:** 2026-07-09
**Spec:** `docs/superpowers/specs/2026-07-09-paste-content-preservation-D-plus-guardrail-design.md`
**Branch:** main (auto version bump on every commit)
**Strategy:** Subtract first (F1, F2), then add guards (F3, F4, F5, F6). Each fix = separate commit. Each commit = `npm run build` green before next.

---

## Defaults Applied (from "go")

1. Spec as written — proceed F1-F6.
2. Threshold for skip-AI: `bodyWithoutFrontmatter.length > 24000` (≈ 6000 tokens).
3. Heading-shrunk guard: warn-only (not fail-closed). AI legitimately merges headings.
4. `.bak` retention: overwrite existing (1 snapshot).

---

## Task 1 — F1: Remove `sanitizeInput` from body path

**Files:** `src/main.ts`
**LOC delta:** −2
**Risk:** None (subtractive only).

### Steps
1. Read `src/main.ts` lines 471-476.
2. Edit: remove `const sanitizedContent = this.validationService.sanitizeInput(content);` (line 473).
3. Edit: change `await this.aiService.generateTitle(sanitizedContent);` → `await this.aiService.generateTitle(content);`.
4. Run `npm run build` — must pass.
5. Commit: `fix(paste): remove sanitizeInput from title generation path (preserves smart quotes, HTML entities, inline HTML)`.

### Verify
- `npm run build` exit 0.
- No new TS errors.
- Diff shows exactly 2 line changes in main.ts.

---

## Task 2 — F2: Remove `preTransform` from paste path

**Files:** `src/main.ts`
**LOC delta:** −6 (remove `preTransform` call, simplify `reformatForGfm` call to take body directly)
**Risk:** None (subtractive only). AI now sees raw body, which it can handle natively for Claude/GPT-5/Gemini.

### Steps
1. Edit `src/main.ts:490-498`:
   - Remove `const preTransformed = this.gfmService.preTransform(...)` block (3 lines).
   - Change `reformatForGfm(preTransformed, ...)` → `reformatForGfm(bodyWithoutFrontmatter, ...)`.
   - Adjust `sentPrompt` reconstruction (line 517-518) to use `bodyWithoutFrontmatter` instead of `preTransformed`.
2. Run `npm run build` — must pass.
3. Commit: `fix(paste): remove preTransform from GFM reformat path (AI handles raw body, removes ## References/stripCitations false positive)`.

### Verify
- `npm run build` exit 0.
- `gfmService.preTransform` method left untouched (still exported for any future caller; not deleted per spec).

---

## Task 3 — F3: Sentinel extraction + minimal post-transform

**Files:** `src/aiService.ts`, `src/gfmService.ts`, `src/main.ts`
**LOC delta:** +50 aiService, +15 gfmService, +10 main.ts = ~75
**Risk:** Medium — new logic, but bounded by UUID-based boundary.

### Steps

#### 3a. Modify `aiService.reformatForGfm` to inject + extract sentinels

In `src/aiService.ts:428-455`:
- Generate UUID at start of call.
- Append to prompt: `\n\nWrap your entire output between these exact markers (no other text outside):\n<<GFM_BODY_START_${uuid}>>\n<<GFM_BODY_END_${uuid}>>`
- After `callAI` returns, check for both sentinel tokens in response.
- If both present: extract substring between them. Return extracted body.
- If either missing: return empty string (caller already fail-closed on empty).

#### 3b. Replace `gfmService.postTransform` with minimal collapse-blanks

In `src/gfmService.ts:47-83`:
- Strip out `stripInstructions`, `stripPromptEcho`, `stripQaPrefix`, `transformCodeBlocks`, `validateTables`, `sanitizeHtml`, `transformLinks` calls.
- Keep only `result.replace(/\n{3,}/g, '\n\n')` at the end.
- Update JSDoc to reflect new purpose: "minimal cleanup — collapse excess blank lines. Content preservation is handled by sentinel extraction in `reformatForGfm`."
- Keep method signature (`content: string, cleanQAPrefix?, sentPrompt?`) for backward compat but ignore the second/third arg with a comment.

#### 3c. Adjust `main.ts` call site

In `src/main.ts:527-531`:
- `this.gfmService.postTransform(reformatted, ...)` still works (signature unchanged) but now only collapses blanks.

### Verify
- `npm run build` exit 0.
- Manual: paste a note with `## References` heading → not eaten.
- Manual: paste a note with `Output: 42 widgets per cluster` line → not eaten.

### Commit
`feat(paste): sentinel extraction for AI GFM reformat + minimal post-transform`

---

## Task 4 — F4: Guard suite around AI body output

**Files:** `src/gfmService.ts` (helper), `src/main.ts` (call site)
**LOC delta:** +60 gfmService (helper), +20 main.ts (call site)
**Risk:** Medium — 7 new check conditions, each must be verified.

### Steps

#### 4a. Add `validateGfmOutput` helper in `src/gfmService.ts`

Signature:
```typescript
validateGfmOutput(input: string, output: string): { valid: boolean; reason?: string; warning?: string }
```

Checks (in order, fail on first hit):
1. **Sentinel missing** — output does not contain `<<GFM_BODY_END_` (caller responsible for this, but double-check).
2. **Mid-fence** — `output` has odd ` ``` ` count.
3. **Mid-table** — last 100 chars of output contain unclosed `|` row (line starting with `|` but not ending with `|`).
4. **Mid-list** — last line of output is `- ` or `* ` or `1. ` with no content after (just dangling marker).
5. **Length delta** — `output.length < input.length * 0.5`.
6. **Fence parity** — ` ``` ` count is odd (redundant with #2 but easier to read).

Warnings (not fail):
- **Heading-shrunk** — output has fewer `^#{1,6} ` lines than input.

#### 4b. Add `length` pre-check in `main.ts`

Before calling `reformatForGfm`:
```typescript
if (bodyWithoutFrontmatter.length > 24000) {
  new Notice('Body too long for AI reformat (>24000 chars). Skipping GFM transformation. File saved with raw content.');
  // skip GFM block, fall through to rename with raw body
} else { /* existing path */ }
```

#### 4c. Call guard after AI returns

In `main.ts:498` after `reformatted` is non-empty:
```typescript
const validation = this.gfmService.validateGfmOutput(bodyWithoutFrontmatter, reformatted);
if (!validation.valid) {
  // fail-closed: do NOT modify file
  new Notice(`GFM reformat output failed validation: ${validation.reason}. File unchanged.`);
  return { success: false, ... };
}
if (validation.warning) {
  new Notice(`GFM reformat warning: ${validation.warning}`, 5000);
}
```

### Verify
- `npm run build` exit 0.
- Each guard has a unit test case in `test-gfm-paste.test.js`.

### Commit
`feat(paste): add 6-guard validation suite around AI body reformat output`

---

## Task 5 — F5: Snapshot `.bak` before destructive modify

**Files:** `src/main.ts`
**LOC delta:** +20
**Risk:** Low — additive, no behavior change for happy path.

### Steps

In `src/main.ts`, add private helper:
```typescript
private async snapshotBeforeModify(file: TFile, content: string): Promise<void> {
  const dir = file.parent?.path ?? '';
  const base = file.basename;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bakPath = normalizePath(`${dir ? dir + '/' : ''}${base}.bak.${ts}`);
  await this.app.vault.adapter.write(bakPath, content);
}
```

Call site in `main.ts:552`:
```typescript
if (finalContent !== content) {
  await this.snapshotBeforeModify(file, content);
  await this.app.vault.modify(
    this.app.vault.getAbstractFileByPath(candidatePath) as TFile,
    finalContent
  );
}
```

### Verify
- `npm run build` exit 0.
- Manual: rename a file → check `.bak.<timestamp>` exists next to it.
- `.bak` file has no `.md` extension → Obsidian does not index it.

### Commit
`feat(paste): write .bak.<timestamp> snapshot before destructive modify (recovery path)`

---

## Task 6 — F6: Notice UX polish

**Files:** `src/main.ts`
**LOC delta:** +10 (small edits to existing Notice calls)
**Risk:** None — cosmetic.

### Steps

- Change `new Notice('Title: ...')` (line ~636) to add `(snapshot saved)` suffix when `finalContent !== content`.
- Change guard-failure Notices to include the specific failure reason (already done in F4 call site).
- Adjust Notice durations: 8000ms for failure Notices (currently default 5000).

### Verify
- `npm run build` exit 0.
- Manual: each guard fires → Notice shown with reason + duration feels right.

### Commit
`fix(paste): polish Notice UX on guard failure and snapshot creation`

---

## Task 7 — Test file

**Files:** `test-gfm-paste.test.js` (new, at repo root, mirrors `test-gfm-tables.test.js` pattern)
**LOC delta:** +120

### Cases

| # | Test | Pass criteria |
|---|---|---|
| T1 | sanitizeInput removed → smart quotes + `<details>` + `&amp;` pass through to AI prompt input | Mock captures prompt includes those chars verbatim |
| T2 | preTransform removed → `## References` heading + content under it pass through | Mock captures prompt includes the heading line |
| T3a | Sentinel present in AI output → extracted body correct | UUID-bracketed body returned without markers |
| T3b | Sentinel missing in AI output → empty string returned | `reformatForGfm` returns `''` |
| T4.1 | validateGfmOutput: mid-fence (` ``` ` odd count) → invalid | `{ valid: false, reason: ... }` |
| T4.2 | validateGfmOutput: mid-table (last line `| col1 | col2`) → invalid | `{ valid: false, reason: ... }` |
| T4.3 | validateGfmOutput: length delta < 50% → invalid | `{ valid: false, reason: ... }` |
| T4.4 | validateGfmOutput: heading shrunk → warning (not invalid) | `{ valid: true, warning: ... }` |
| T4.5 | validateGfmOutput: clean output → valid | `{ valid: true }` |
| T4.6 | validateGfmOutput: sentinel missing in output → invalid | `{ valid: false }` |
| T5 | snapshotBeforeModify writes `.bak.<ts>` with original content | File system write to mocked adapter |

Mock setup: Obsidian's `app.vault.adapter` mocked to capture writes.

### Verify
- Run `node test-gfm-paste.test.js` → all pass.
- Existing `node test-gfm-tables.test.js` still passes.

### Commit
`test(paste): regression suite for content preservation pipeline`

---

## Execution Order

1. F1 (sanitizeInput removal)
2. F2 (preTransform removal)
3. F3 (sentinel + minimal post)
4. F4 (guard suite)
5. F5 (snapshot)
6. F6 (Notice UX)
7. T (test file)

After each step: `npm run build` must pass. After F3+: also run `node test-gfm-tables.test.js` (existing) — must still pass (no test for `postTransform` yet, that comes in T).

After F5 + T: full manual smoke test with 5 real paste cases (Perplexity, ChatGPT, GitHub gist, paper PDF, blog post).

---

## Rollback

Each commit is independently revertible. If any guard has >5% false-positive rate on real paste corpus, that specific commit can be reverted without affecting the others.

---

## Total LOC Delta

- `src/main.ts`: −2 + 75 = +73
- `src/aiService.ts`: +50
- `src/gfmService.ts`: +60 (postTransform slimmed, helper added)
- `test-gfm-paste.test.js` (new): +120
- Net: +303 LOC across 4 files. Net new code = ~190 (excluding test). All additive beyond what was already there; spec subtractions (F1, F2) are net-zero or net-negative in `main.ts`.