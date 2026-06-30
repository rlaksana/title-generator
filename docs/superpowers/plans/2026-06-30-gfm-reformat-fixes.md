# GFM Reformat Pipeline Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10 specific defects in the GFM reformat pipeline (`gfmService.ts`, `citationCleanerService.ts`, `main.ts`) without architectural changes, leaving frontmatter as a protected region and making Paste & Share fail-closed when AI GFM is requested but fails.

**Architecture:** In-place surgical fixes per finding. AI stays the centerpiece for body reformatting. Frontmatter is split before pipeline, re-attached after. Fail-closed guard short-circuits the rename + Gist publish path when AI returns empty/throws. No new files, no new test infrastructure.

**Tech Stack:** TypeScript, Obsidian Plugin API, `requestUrl` for HTTP, `npm run build` as the only verification step.

## Global Constraints

- No test suite exists. Verification per task = `npm run build` succeeds (exit code 0, no TypeScript errors).
- Project auto-bumps version on every commit. Branch is `main`. No push unless explicitly requested.
- Each fix ends with a commit. Commit messages use the form `fix(gfm): <short description>`.
- No architectural changes. No new files. No new commands. No settings UI changes.
- Order of execution matters: do not skip ahead; later tasks may depend on helpers introduced by earlier tasks (e.g. frontmatter split in Task 3 feeds Task 4).

---

## File Map

| File | Tasks | Why |
|---|---|---|
| `src/citationCleanerService.ts` | Task 1 | Fix #2 — whitespace collapse must not eat leading indentation |
| `src/gfmService.ts` | Tasks 2, 5, 6, 7, 8, 9, 10 | Fixes #1, #4, #5, #6, #7, #9, #10 — most transforms live here |
| `src/main.ts` | Tasks 3, 4 | Fixes #3, #8 — fail-closed guard and frontmatter split helper |

`docs/superpowers/specs/2026-06-30-gfm-reformat-fixes-design.md` is the source of truth for behavior.

---

## Task 1: Citation whitespace collapse (#2)

**Files:**
- Modify: `src/citationCleanerService.ts:40-44`

**Goal:** Replace the global ` +` collapse with one that preserves leading indentation per line, so 4-space code blocks, ASCII alignment, table padding, and YAML list indentation survive citation stripping.

**Interfaces:**
- Consumes: `content: string` (markdown text with citations)
- Produces: `string` (same text with citations removed and whitespace normalized)

- [ ] **Step 1: Read current implementation**

Read `src/citationCleanerService.ts` lines 40-44. Confirm the current code is exactly:

```ts
  // 8. Clean up excessive whitespace from removed citations
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.replace(/ +/g, ' ');
```

- [ ] **Step 2: Replace whitespace cleanup block**

In `src/citationCleanerService.ts`, replace lines 40-42 (the comment line and the two `result.replace(...)` calls, but NOT the closing `return result.trim();`) with:

```ts
  // 8. Clean up excessive whitespace from removed citations.
  // IMPORTANT: do NOT collapse leading whitespace per line — that would destroy
  // 4-space indented code blocks, ASCII alignment, table padding, and YAML list
  // indentation. Only collapse horizontal whitespace runs and trim trailing
  // whitespace per line.
  result = result.replace(/[ \t]{2,}/g, ' ');
  result = result.replace(/[ \t]+$/gm, '');
  result = result.replace(/\n{3,}/g, '\n\n');
```

Leave `return result.trim();` (line 44) untouched.

- [ ] **Step 3: Verify build**

Run:
```bash
npm run build
```
Expected: exit code 0, no TypeScript errors. Output should look like:
```
> obsidian-title-generator@3.0.X build
> node esbuild.config.mjs && tsc --noEmit --skipLibCheck
```
(with whatever current version number; the auto-bump is fine)

- [ ] **Step 4: Spot-check the change**

Read `src/citationCleanerService.ts` and confirm:
- Line order is now: `[ \t]{2,}` → `[ \t]+$` → `\n{3,}`.
- `return result.trim();` still present at the bottom of the function.
- No other whitespace-related replaces were added or removed.

- [ ] **Step 5: Commit**

```bash
git add src/citationCleanerService.ts
git commit -m "fix(gfm): preserve leading indentation in citation whitespace cleanup"
```

---

## Task 2: Fence tracking in `transformCodeBlocks` (#1)

**Files:**
- Modify: `src/gfmService.ts:252-319` (the `transformCodeBlocks` method)

**Goal:** Add a fence state machine so any line inside an existing ` ``` ` or ` ~~~ ` fenced block passes through untouched. Existing indented-code → fenced conversion still works for content outside fences.

**Interfaces:**
- Consumes: `content: string` (post-AI markdown text)
- Produces: `string` (same text with indented code converted to fenced, but pre-existing fences preserved)

- [ ] **Step 1: Read current `transformCodeBlocks`**

Read `src/gfmService.ts:252-319`. Confirm the function signature `transformCodeBlocks(content: string): string` and the loop structure `for (let i = 0; i < lines.length; i++)`.

- [ ] **Step 2: Add fence state declarations**

Inside the function, immediately after `let codeBlockContent: string[] = [];` (the last `let` declaration before the `for` loop), add two more declarations:

```ts
    let inFence = false;
    let fenceMarker = '';
```

So the declaration block becomes:

```ts
    let inCodeBlock = false;
    let codeBlockStart = -1;
    let codeBlockIndent = 0;
    let codeBlockContent: string[] = [];
    let inFence = false;
    let fenceMarker = '';
```

- [ ] **Step 3: Add fence detection at top of loop body**

At the very top of the `for` loop body, BEFORE the `const leadingSpaces = line.match(/^(\s*)/)?.[1].length ?? 0;` line, insert:

```ts
      // Fence detection: a pre-existing ``` or ~~~ fenced code block must be
      // passed through verbatim — converting indented lines inside it would
      // produce nested/duplicated fences.
      const fenceMatch = line.match(/^(\s{0,3})(```+|~~~+)(.*)$/);
      if (!inFence && fenceMatch) {
        inFence = true;
        fenceMarker = fenceMatch[2][0].repeat(3);
        result.push(line);
        continue;
      }
      if (inFence) {
        const closerMatch = line.match(/^(\s{0,3})(```+|~~~+)\s*$/);
        if (closerMatch && closerMatch[2][0] === fenceMarker[0]) {
          inFence = false;
          fenceMarker = '';
        }
        result.push(line);
        continue;
      }
```

- [ ] **Step 4: Verify build**

Run:
```bash
npm run build
```
Expected: exit code 0, no TypeScript errors.

- [ ] **Step 5: Spot-check the change**

Read `src/gfmService.ts:252-340`. Confirm:
- `inFence` and `fenceMarker` declared once at function top.
- Fence handling appears at the top of the loop body, before the `leadingSpaces` calculation.
- The existing indented-code logic below is unchanged.
- `i--` reset near the end of the loop still triggers correctly when an indented-code block ends — it sits inside the `else { /* Code block ended */ }` branch, which only runs when `!inCodeBlock` branch was taken (and fences are now handled first via `continue`).

- [ ] **Step 6: Commit**

```bash
git add src/gfmService.ts
git commit -m "fix(gfm): track existing fenced code blocks to prevent re-fencing"
```

---

## Task 3: Frontmatter split & re-attach (#8)

**Files:**
- Modify: `src/main.ts` — inside `processSingleFile`, around lines 483-515

**Goal:** Split YAML frontmatter from body before the GFM pipeline runs. Pass only body to `preTransform`, `reformatForGfm`, and `postTransform`. Re-attach frontmatter verbatim after post-transform.

**Interfaces:**
- New helper `splitFrontmatter(content: string): { frontmatter: string; body: string }`
- Consumes: full file content
- Produces: `frontmatter` (the YAML block contents, no `---` markers) and `body` (everything after the closing `---\n`)

**Note:** This task introduces the split and the re-attach, but does NOT yet wire in the fail-closed behavior. Task 4 handles that.

- [ ] **Step 1: Read current GFM block**

Read `src/main.ts:483-515`. Note that:
- Line 483: `let finalContent = content;`
- Lines 488-491: `preTransform(finalContent, this.settings.stripCitations)`
- Lines 509-513: `postTransform(reformatted, this.settings.cleanQAPrefix, sentPrompt)` assigns to `finalContent`.

- [ ] **Step 2: Add `splitFrontmatter` helper**

At the bottom of the `TitleGenerator` class (just before the final closing `}` of the class), add a new private method:

```ts
  /**
   * Split YAML frontmatter from body. Frontmatter is detected only at the
   * very top of the file (anchored ^---\n), so a `---` separator that
   * appears later in the body is left untouched.
   */
  private splitFrontmatter(content: string): {
    frontmatter: string;
    body: string;
  } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!match) return { frontmatter: '', body: content };
    return { frontmatter: match[1], body: content.slice(match[0].length) };
  }
```

(To find a good insertion point: scan the last ~50 lines of `src/main.ts` for `updateGistFrontmatter` (defined around line 869). Insert this helper near that block, or right before the class's closing brace — both are fine.)

- [ ] **Step 3: Wire split into `processSingleFile`**

In `src/main.ts` `processSingleFile`, replace the line `let finalContent = content;` (line 483) with:

```ts
        let finalContent = content;
        const { frontmatter, body: bodyWithoutFrontmatter } =
          this.splitFrontmatter(content);
```

- [ ] **Step 4: Pass body to preTransform**

In the same GFM block, change the `preTransform` call so it receives `bodyWithoutFrontmatter` instead of `finalContent`. Replace lines 488-491:

```ts
          const preTransformed = this.gfmService.preTransform(
            finalContent,
            this.settings.stripCitations
          );
```

with:

```ts
          const preTransformed = this.gfmService.preTransform(
            bodyWithoutFrontmatter,
            this.settings.stripCitations
          );
```

- [ ] **Step 5: Capture post-transform into transformedBody, then re-attach**

Inside the `if (reformatted) { ... }` block, change the assignment to `finalContent` (lines 509-513) so that postTransform output goes into a new local variable `transformedBody`, then re-attach frontmatter. Replace:

```ts
            finalContent = this.gfmService.postTransform(
              reformatted,
              this.settings.cleanQAPrefix,
              sentPrompt
            );
```

with:

```ts
            const transformedBody = this.gfmService.postTransform(
              reformatted,
              this.settings.cleanQAPrefix,
              sentPrompt
            );
            finalContent = frontmatter
              ? `---\n${frontmatter}\n---\n${transformedBody}`
              : transformedBody;
```

- [ ] **Step 6: Verify build**

Run:
```bash
npm run build
```
Expected: exit code 0, no TypeScript errors.

- [ ] **Step 7: Spot-check the change**

Read `src/main.ts:483-540`. Confirm:
- `splitFrontmatter` is defined exactly once, as a private method.
- `bodyWithoutFrontmatter` is what `preTransform` receives.
- The result of `postTransform` is assigned to `transformedBody`, not `finalContent` directly.
- `finalContent` is reassigned via the conditional that re-attaches frontmatter.
- If `reformatted` is empty (Task 3 stops short of fail-closed behavior — that's Task 4), `finalContent` stays as `content` because the `if (reformatted)` branch is skipped. The next task will turn this into an explicit error return.

- [ ] **Step 8: Commit**

```bash
git add src/main.ts
git commit -m "fix(gfm): protect frontmatter from AI reformat pipeline"
```

---

## Task 4: Fail-closed for Paste & Share (#3)

**Files:**
- Modify: `src/main.ts` — inside `processSingleFile`, the GFM block (around line 486 onward)

**Goal:** When GFM was requested (via setting or `forceGfm`) and the AI call returns empty/throws, stop the pipeline with an error notice — do NOT rename the file, do NOT publish to Gist.

**Interfaces:**
- Consumes: existing flow through `processSingleFile` (after Task 3 changes)
- Produces: explicit early return with `FileOperationResult` on AI failure

- [ ] **Step 1: Read the existing GFM block**

Read `src/main.ts:486-515` (after Task 3 changes). Confirm:
- `enableGfmReformatting || options?.forceGfm` controls entry.
- `reformatted` from `reformatForGfm` may be `''` (empty) on AI failure.
- The existing early-return pattern at the top of `processSingleFile` (around line 460-466) uses `this.errorHandler.createGenerationError(...)` and `this.errorHandler.handleError(error)`, returning `{ success: false, originalPath: file.path, error: error.message }`.

- [ ] **Step 2: Replace the `if (reformatted)` block with fail-closed logic**

Replace the existing `if (reformatted) { ... }` block (the `sentPrompt` reconstruction + `postTransform` call from Task 3) with:

```ts
          if (!reformatted) {
            // Fail-closed: GFM was requested but AI returned empty/errored.
            // Do NOT rename the file, do NOT publish to Gist, do NOT silently
            // fall back to the raw content.
            statusBarItem.setText('');
            const error = this.errorHandler.createGenerationError(
              'GFM reformatting failed (AI call returned empty or errored). ' +
                'File not renamed and not published. Please retry.'
            );
            this.errorHandler.handleError(error);
            return {
              success: false,
              originalPath: file.path,
              error: error.message,
            };
          }

          // Reconstruct the full prompt sent to AI for echo detection
          let sentPrompt =
            `${this.settings.gfmPrompt}\n\n${preTransformed}`.trim();
          if (sanitizedTitle) {
            sentPrompt +=
              '\n\nIMPORTANT: Before reformatting, check if the beginning of the content duplicates the title "' +
              sanitizedTitle +
              '". If yes, remove the duplicate lines from the start of the content first, then reformat.';
          }
          sentPrompt +=
            '\n\nCRITICAL: Output ONLY the transformed content. Do NOT repeat these instructions. Do NOT include the original prompt. Do NOT add explanations.';
          const transformedBody = this.gfmService.postTransform(
            reformatted,
            this.settings.cleanQAPrefix,
            sentPrompt
          );
          finalContent = frontmatter
            ? `---\n${frontmatter}\n---\n${transformedBody}`
            : transformedBody;
```

The key change: `if (reformatted)` becomes `if (!reformatted)` and the body is the error-handling early-return. The successful path that follows remains unchanged from Task 3.

- [ ] **Step 3: Verify build**

Run:
```bash
npm run build
```
Expected: exit code 0, no TypeScript errors.

- [ ] **Step 4: Spot-check the change**

Read `src/main.ts:486-560`. Confirm:
- Entry guard `if (this.settings.enableGfmReformatting || options?.forceGfm)` unchanged.
- `reformatted` from `aiService.reformatForGfm(...)` is now checked with `if (!reformatted)` — empty string and any falsy result trigger fail-closed.
- Fail-closed returns BEFORE any rename (`app.fileManager.renameFile`) and BEFORE any Gist publish (`gistService.publishToGist`).
- Status bar is cleared on the error path.
- The success path preserves frontmatter split/re-attach from Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "fix(gfm): fail-closed when AI reformat returns empty"
```

---

## Task 5: Stateful regex reset in `stripInstructions` (#4)

**Files:**
- Modify: `src/gfmService.ts:113-115` — the inner filter callback inside `stripInstructions`

**Goal:** Avoid the classic stateful-`.test()` bug by cloning each regex per call instead of mutating `lastIndex` across iterations.

- [ ] **Step 1: Read current filter**

Read `src/gfmService.ts:112-117`. Confirm the current shape:

```ts
    const lines = result.split('\n');
    const filteredLines = lines.filter((line) => {
      return !instructionPatterns.some((pattern) => pattern.test(line));
    });
```

- [ ] **Step 2: Clone regex per test**

Replace the `lines.filter(...)` call with:

```ts
    const lines = result.split('\n');
    const filteredLines = lines.filter((line) => {
      return !instructionPatterns.some((pattern) => {
        // Clone the regex to avoid lastIndex state carrying across lines.
        // With the `g` flag, the same RegExp object's lastIndex advances
        // after each .test() call, which causes alternating matches to
        // silently skip. Cloning is cheap and keeps the matcher deterministic.
        return new RegExp(pattern.source, pattern.flags).test(line);
      });
    });
```

- [ ] **Step 3: Verify build**

Run:
```bash
npm run build
```
Expected: exit code 0, no TypeScript errors.

- [ ] **Step 4: Spot-check the change**

Read `src/gfmService.ts:112-120`. Confirm:
- Each `.test()` call receives a freshly constructed `RegExp`.
- The 14 patterns in `instructionPatterns` are still defined once at the top of the function.
- The `lines.filter(...)` outer shape is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/gfmService.ts
git commit -m "fix(gfm): clone regex per test to avoid lastIndex state leak"
```

---

## Task 6: Q&A prefix actually strips `A:` / `Answer:` (#5)

**Files:**
- Modify: `src/gfmService.ts:178-217` — the `stripQaPrefix` method

**Goal:** When the answer line is detected, strip its `A:` / `Answer:` / `Ans:` prefix instead of pushing the original line verbatim.

**Interfaces:**
- Consumes: AI output with possible `Q:` / `A:` Perplexity-style markers
- Produces: same content with both question and answer prefixes removed

- [ ] **Step 1: Read current `stripQaPrefix`**

Read `src/gfmService.ts:178-217`. Confirm the `for` loop:

```ts
      if (skipUntilAnswer && trimmed.match(/^(?:A:|Answer:)\s*.+$/i)) {
        // This is the answer line - include it and stop skipping
        resultLines.push(line);
        skipUntilAnswer = false;
      } else if (skipUntilAnswer && trimmed === '') {
```

- [ ] **Step 2: Strip the answer prefix**

Replace the answer-line branch. Find the `if (skipUntilAnswer && trimmed.match(/^(?:A:|Answer:)\s*.+$/i)) {` block and replace it with:

```ts
      if (skipUntilAnswer && trimmed.match(/^(?:A:|Answer:)\s*.+$/i)) {
        // This is the answer line - strip the prefix and stop skipping.
        const stripped = line.replace(
          /^(\s*)(?:A:|Answer:|Ans:)\s*/i,
          '$1'
        );
        resultLines.push(stripped);
        skipUntilAnswer = false;
      } else if (skipUntilAnswer && trimmed === '') {
```

- [ ] **Step 3: Verify build**

Run:
```bash
npm run build
```
Expected: exit code 0, no TypeScript errors.

- [ ] **Step 4: Spot-check the change**

Read `src/gfmService.ts:198-217`. Confirm:
- The answer-detection regex `^(?:A:|Answer:)\s*.+$/i` still gates entry to this branch (so non-prefix lines do not accidentally get stripped).
- The replacement `^(\s*)(?:A:|Answer:|Ans:)\s*` preserves leading whitespace and matches the leading `A:` / `Answer:` / `Ans:` prefix (case-insensitive).
- `resultLines.push(stripped)` pushes the modified line, not `line`.
- `skipUntilAnswer = false` still triggers.

- [ ] **Step 5: Commit**

```bash
git add src/gfmService.ts
git commit -m "fix(gfm): actually strip A:/Answer: prefix in Q&A cleanup"
```

---

## Task 7: Table validation — missing separator + alignment (#6)

**Files:**
- Modify: `src/gfmService.ts:324-352` — `transformTables` method
- Modify: `src/gfmService.ts:386-426` — `validateTables` method

**Goal:** Detect tables whose header exists but separator row is missing or malformed, and inject a proper separator. In `validateTables`, ensure column count consistency between header and body rows.

- [ ] **Step 1: Read `transformTables`**

Read `src/gfmService.ts:324-352`. Confirm the current shape: it pushes the header line, then checks `if (nextLine.match(/^\|[\s-:|<>]+\|$/))` to detect existing separators and normalize them.

- [ ] **Step 2: Modify `transformTables` to handle missing separator**

Replace the entire `for` loop body (lines 328-349) so the table-detection branch handles both the present-separator and missing-separator cases. The new body of the for loop should be:

```ts
      // Check if this looks like a table row
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        result.push(line);

        // Check if next line is a table separator
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine.match(/^\|[\s-:|<>]+\|$/)) {
            // Existing separator - normalize it
            const normalized = this.normalizeTableSeparator(nextLine);
            result.push(normalized);
            i++; // Skip the original separator line
          } else {
            // No separator present - inject one based on header column count
            const headerCells = line
              .split('|')
              .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
            if (headerCells.length >= 2) {
              const separator =
                '| ' + headerCells.map(() => '---').join(' | ') + ' |';
              result.push(separator);
            }
          }
        }
      } else {
        result.push(line);
      }
```

Leave the `return result.join('\n');` at the end untouched.

- [ ] **Step 3: Read `validateTables`**

Read `src/gfmService.ts:386-426`. Confirm the current shape: it collects `tableRows` while `inTable === true`, then emits them verbatim. It does not check column count.

- [ ] **Step 4: Add column-count check to `validateTables`**

Modify `validateTables` so that when a table ends, it filters out body rows whose column count (count of `|`) differs from the header's. Replace the section that handles table-end (lines 403-413, the `else` branch inside `if (inTable)`):

```ts
        } else {
          // Table ended - validate and emit
          for (const row of tableRows) {
            result.push(row);
          }
          tableRows = [];
          inTable = false;
          result.push(line);
        }
```

with:

```ts
        } else {
          // Table ended - validate column count and emit
          const headerRow = tableRows[0];
          if (headerRow) {
            const headerPipeCount = (headerRow.match(/\|/g) ?? []).length;
            tableRows = tableRows.filter((row) => {
              const rowPipeCount = (row.match(/\|/g) ?? []).length;
              return rowPipeCount === headerPipeCount;
            });
          }
          for (const row of tableRows) {
            result.push(row);
          }
          tableRows = [];
          inTable = false;
          result.push(line);
        }
```

Also update the trailing `if (inTable)` block (lines 419-423) the same way — filter rows by header pipe count, then emit:

```ts
    // Emit remaining table rows
    if (inTable) {
      const headerRow = tableRows[0];
      if (headerRow) {
        const headerPipeCount = (headerRow.match(/\|/g) ?? []).length;
        tableRows = tableRows.filter((row) => {
          const rowPipeCount = (row.match(/\|/g) ?? []).length;
          return rowPipeCount === headerPipeCount;
        });
      }
      for (const row of tableRows) {
        result.push(row);
      }
    }
```

- [ ] **Step 5: Verify build**

Run:
```bash
npm run build
```
Expected: exit code 0, no TypeScript errors.

- [ ] **Step 6: Spot-check the change**

Read `src/gfmService.ts:324-440`. Confirm:
- `transformTables` injects a `| --- | --- | ...` separator when the next line is not a valid separator.
- Injected separator uses the same column count as the header.
- `validateTables` filters body rows by `|` count match against header.
- Both table-end branches (mid-loop and trailing) use the same filter logic.

- [ ] **Step 7: Commit**

```bash
git add src/gfmService.ts
git commit -m "fix(gfm): inject missing table separators and enforce column consistency"
```

---

## Task 8: Link transform context-aware (#7)

**Files:**
- Modify: `src/gfmService.ts:431-440` — the `transformLinks` method

**Goal:** Track fenced code blocks and inline code spans while transforming bare URLs to `<url>` form, so URLs inside code are left alone and trailing punctuation is not absorbed into the URL.

**Interfaces:**
- Consumes: post-AI markdown text
- Produces: text with bare `http(s)://` URLs wrapped in angle brackets, except inside fenced blocks, inline code, or after leading `<` / `[` / `(` and before trailing `>` / `)` / `]`

- [ ] **Step 1: Read current `transformLinks`**

Read `src/gfmService.ts:431-440`. Confirm the current one-liner:

```ts
    return content.replace(
      /(?<![<\(])(https?:\/\/[^\s<>\[\]()"]+)(?![>\)\]])/g,
      '<$1>'
    );
```

- [ ] **Step 2: Replace `transformLinks` body**

Replace the entire `transformLinks` method body (everything after `transformLinks(content: string): string {`) with:

```ts
    const lines = content.split('\n');
    const result: string[] = [];
    let inFence = false;
    let fenceMarker = '';

    for (const line of lines) {
      const fenceMatch = line.match(/^(\s{0,3})(```+|~~~+)/);
      if (!inFence && fenceMatch) {
        inFence = true;
        fenceMarker = fenceMatch[2][0].repeat(3);
        result.push(line);
        continue;
      }
      if (inFence) {
        const closer = line.match(/^(\s{0,3})(```+|~~~+)\s*$/);
        if (closer && closer[2][0] === fenceMarker[0]) {
          inFence = false;
          fenceMarker = '';
        }
        result.push(line);
        continue;
      }

      // Outside fences: split on balanced inline-code spans and only transform
      // segments that are NOT inside backticks.
      const segments = line.split(/(`+)([^`]*?)\1/g);
      const transformed = segments
        .map((seg, i) => {
          // i % 3 === 1 is the backtick delimiter itself; i % 3 === 2 is the
          // content; everything else (i % 3 === 0) is outside any inline code.
          if (i % 3 === 2) return seg;
          return seg.replace(
            /(?<![<\(\[])(https?:\/\/[^\s<>]+?)([.,;:!?]+)?(?=[\s>]|$)/g,
            (match, url, trailing = '') => {
              const cleanUrl = url.replace(/[.,;:!?]+$/, '');
              const trail = url.slice(cleanUrl.length);
              return `<${cleanUrl}>${trail}`;
            }
          );
        })
        .join('');
      result.push(transformed);
    }

    return result.join('\n');
```

The leading `const lines = content.split('\n');` and the function signature stay. The trailing `return content.replace(...)` is replaced with the final `return result.join('\n');` (already part of the new code above).

- [ ] **Step 3: Verify build**

Run:
```bash
npm run build
```
Expected: exit code 0, no TypeScript errors.

- [ ] **Step 4: Spot-check the change**

Read `src/gfmService.ts:431-510`. Confirm:
- Fence state tracking present (same shape as Task 2's machine).
- Inside-fence lines pass through untouched.
- Inline code spans (delimited by balanced backticks) are skipped by the URL transform.
- Trailing punctuation `. , ; : ! ?` is split off the URL before wrapping.
- The function still returns a single string.

- [ ] **Step 5: Commit**

```bash
git add src/gfmService.ts
git commit -m "fix(gfm): skip URL transform inside fenced code and inline code"
```

---

## Task 9: Task list — `( )`, `(x)`, `< >`, `[X]` (#9)

**Files:**
- Modify: `src/gfmService.ts:222-225` — the `transformTaskLists` method

**Goal:** Match the comment claim: support `[ ]`, `[x]`, `[X]`, `( )`, `(x)`, `< >`. Normalize uppercase `[X]` and the paren/angle-bracket variants to GFM `- [x]` / `- [ ]`.

- [ ] **Step 1: Read current `transformTaskLists`**

Read `src/gfmService.ts:222-225`. Confirm the current body:

```ts
    return content.replace(/^(\s*)[-*+]?\s*\[([ xX])\]\s*/gm, '$1- [$2] ');
```

- [ ] **Step 2: Expand transform**

Replace the method body with:

```ts
    let result = content;
    // Square brackets - explicit uppercase [X] normalized to lowercase [x]
    result = result.replace(
      /^(\s*)[-*+]?\s*\[X\]\s*/gm,
      '$1- [x] '
    );
    // Square brackets - lowercase [x]
    result = result.replace(
      /^(\s*)[-*+]?\s*\[x\]\s*/gm,
      '$1- [x] '
    );
    // Square brackets - empty [ ]
    result = result.replace(
      /^(\s*)[-*+]?\s*\[\s\]\s*/gm,
      '$1- [ ] '
    );
    // Parens ( ) and (x)
    result = result.replace(
      /^(\s*)[-*+]?\s*\(([ xX])\)\s*/gm,
      '$1- [$2] '
    );
    // Angle brackets < > and <x>
    result = result.replace(
      /^(\s*)[-*+]?\s*<([ xX])>\s*/gm,
      '$1- [$2] '
    );
    return result;
```

(Add `let result = content;` at the start; replace the original one-line `return content.replace(...)` with the chained replaces above. The function signature `transformTaskLists(content: string): string` stays.)

- [ ] **Step 3: Verify build**

Run:
```bash
npm run build
```
Expected: exit code 0, no TypeScript errors.

- [ ] **Step 4: Spot-check the change**

Read `src/gfmService.ts:222-260`. Confirm:
- All five replaces are chained, each with the `gm` flag and a leading-whitespace capture.
- `(x)` and `(X)` produce `- [x]` (the lowercase capture is preserved as `$2`).
- `<x>` and `<X>` likewise produce `- [x]`.
- `< >` (space inside angle brackets) produces `- [ ]`.

- [ ] **Step 5: Commit**

```bash
git add src/gfmService.ts
git commit -m "fix(gfm): normalize ( )/(x)/<>/[X] task-list variants"
```

---

## Task 10: Duplicate condition in `normalizeTableSeparator` (#10)

**Files:**
- Modify: `src/gfmService.ts:357-381` — the `normalizeTableSeparator` method

**Goal:** Remove the duplicate `if (trimmed === ':') return ':---';` line and make the alignment handling explicit and correct.

- [ ] **Step 1: Read current `normalizeTableSeparator`**

Read `src/gfmService.ts:357-381`. Confirm the duplicate at lines 368-369 (two `if (trimmed === ':') return ':---';` lines).

- [ ] **Step 2: Replace alignment logic**

Replace the existing `cells.map((cell) => { ... })` block (lines 362-378) with explicit alignment handling. The new body:

```ts
    const normalizedCells = cells.map((cell) => {
      const trimmed = cell.trim();
      // Already has alignment markers — normalize to canonical form.
      if (trimmed === ':') return ':---';
      if (trimmed === ':-') return ':---';
      if (trimmed === '-:') return '---:';
      if (/^:-+:$/.test(trimmed)) return ':---:';
      if (/^:-+$/.test(trimmed)) return ':---';
      if (/^-+:$/.test(trimmed)) return '---:';
      if (/^-+$/.test(trimmed)) return '---';
      // Default: left-aligned, plain dashes.
      return '---';
    });
```

Leave the trailing `return '| ' + normalizedCells.join(' | ') + ' |';` (line 380) untouched.

- [ ] **Step 3: Verify build**

Run:
```bash
npm run build
```
Expected: exit code 0, no TypeScript errors.

- [ ] **Step 4: Spot-check the change**

Read `src/gfmService.ts:357-381`. Confirm:
- No duplicate `if (trimmed === ':')` lines.
- Alignment tokens covered: `:`, `:-`, `-:`, `:-:`, `:---`, `---:`, `---`, plus the regex cases for any-dash-count variants.
- Final default returns `---` (left-aligned, no markers).
- Function still returns `'| ' + normalizedCells.join(' | ') + ' |'`.

- [ ] **Step 5: Commit**

```bash
git add src/gfmService.ts
git commit -m "fix(gfm): dedupe and clarify table-separator alignment logic"
```

---

## Final Verification

After all 10 tasks are committed:

- [ ] **Step 1: Full clean build**

```bash
npm run build
```
Expected: exit code 0, no TypeScript errors.

- [ ] **Step 2: Inspect commit log**

```bash
git log --oneline -10
```
Expected: 10 commits prefixed `fix(gfm):` in the order tasks were executed.

- [ ] **Step 3: Manual smoke check (optional, no test suite)**

In Obsidian with a sample note containing:
- A fenced ` ```js ` block with indented content (verifies Task 2 fence preservation).
- A 4-space indented code block (verifies Task 1 still converts indented → fenced outside fences).
- A Perplexity-style `Q:` / `A:` exchange with citation markers (verifies Tasks 1, 5, 6).
- A table with header `| A | B |` but no separator row (verifies Task 7 separator injection).
- A `see https://example.com.` sentence (verifies Task 8 trailing punctuation split).
- A YAML frontmatter block at the top (verifies Task 3 preservation through AI call).

Run "Paste & Share to Gist" and confirm:
- Fenced block round-trips intact.
- Indented code becomes fenced.
- Citation markers removed, code indentation preserved.
- Q&A prefix gone on both question and answer.
- Separator row injected under table header.
- URL is `<https://example.com>` with the period outside.
- Frontmatter unchanged in the resulting note.

If any smoke check fails, stop and diagnose before reporting completion.