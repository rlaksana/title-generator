# GFM Reformat Pipeline Fixes — Design

**Date:** 2026-06-30
**Branch:** main
**Scope:** Fix 10 findings from static review of `Reformat body to GFM` pipeline.
**Constraint:** No architectural redesign. Surgical fixes at the call sites. Verification = `npm run build` only (no test suite).

---

## Goal

Eliminate 10 concrete defects in the GFM reformat pipeline (`gfmService.ts`, `citationCleanerService.ts`, `main.ts`) without changing the pipeline architecture. AI remains the center piece for body reformatting. Frontmatter becomes a protected region. Paste & Share becomes fail-closed when GFM is requested but AI fails.

## Non-Goals

- No new test suite.
- No restructuring of `processSingleFile()` into sub-services.
- No new commands, no command rename, no settings UI changes beyond what's strictly needed.
- No AI prompt redesign beyond what fix #8 (frontmatter protection) minimally requires.
- No changes to title generation flow (only body reformat).

---

## Files Touched

| File | Fixes | Total LOC delta |
|---|---|---|
| `src/gfmService.ts` | #1, #4, #5, #6, #7, #9, #10 | ~80 |
| `src/citationCleanerService.ts` | #2 | ~5 |
| `src/main.ts` | #3, #8 | ~30 |

No new files.

---

## Fix Order & Verification Strategy

Execute in this order. Each fix ends with `npm run build` succeeding before the next begins.

1. **#2** citation whitespace collapse
2. **#1** fence tracking in `transformCodeBlocks`
3. **#8** frontmatter split & re-attach
4. **#3** fail-closed guard
5. **#4** regex `lastIndex` reset
6. **#5** Q&A prefix actually strip
7. **#6** table validation — missing separator + alignment
8. **#7** link transform context-aware
9. **#9** task list — `( )`, `(x)`, `< >`
10. **#10** duplicate condition in `normalizeTableSeparator`

---

## Fix #2 — Citation whitespace collapse (NOT fence-blind)

**File:** `src/citationCleanerService.ts:40-44`

**Current:**
```ts
result = result.replace(/\n{3,}/g, '\n\n');
result = result.replace(/ +/g, ' ');
return result.trim();
```

**Replace with:**
```ts
// Collapse 2+ horizontal whitespace to single space (preserves leading indent).
result = result.replace(/[ \t]{2,}/g, ' ');
// Trim trailing horizontal whitespace per line.
result = result.replace(/[ \t]+$/gm, '');
// Collapse 3+ newlines to 2.
result = result.replace(/\n{3,}/g, '\n\n');
return result.trim();
```

**Effect:** 4-space code indentation, ASCII art alignment, table cell padding, and YAML list indentation survive citation stripping.

---

## Fix #1 — Fence tracking in `transformCodeBlocks`

**File:** `src/gfmService.ts:252-319`

**Add state machine:**
```ts
let inFence = false;
let fenceMarker = ''; // '```' or '~~~'
```

At top of loop, before any other transform logic:

```ts
const fenceMatch = line.match(/^(\s{0,3})(```+|~~~+)(.*)$/);

if (!inFence && fenceMatch) {
  // Entering a fence
  inFence = true;
  fenceMarker = fenceMatch[2][0].repeat(3); // normalize to ``` or ~~~
  result.push(line);
  continue;
}

if (inFence) {
  // Inside fence — check if this line closes it
  const closerMatch = line.match(/^(\s{0,3})(```+|~~~+)\s*$/);
  if (closerMatch && closerMatch[2][0] === fenceMarker[0]) {
    inFence = false;
    fenceMarker = '';
  }
  result.push(line);
  continue;
}
```

Indented code block detection (4+ spaces) only runs when `inFence === false`. Pre-existing fenced blocks pass through untouched.

---

## Fix #8 — Frontmatter split & re-attach

**File:** `src/main.ts:483-516`

**Before pipeline block (`finalContent = content;` line), add helper invocation:**
```ts
const { frontmatter, body: bodyWithoutFrontmatter } =
  this.splitFrontmatter(finalContent);
```

**Inside the GFM block, pass body without frontmatter:**
```ts
const preTransformed = this.gfmService.preTransform(
  bodyWithoutFrontmatter,
  this.settings.stripCitations
);
const reformatted = await this.aiService.reformatForGfm(
  preTransformed,
  this.settings.gfmPrompt,
  sanitizedTitle
);
// ...postTransform as before, produces transformedBody...
```

**After the GFM block, re-attach:**
```ts
if (frontmatter) {
  finalContent = `---\n${frontmatter}\n---\n${transformedBody}`;
} else {
  finalContent = transformedBody;
}
```

**Add private helper:**
```ts
private splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { frontmatter: '', body: content };
  return { frontmatter: match[1], body: content.slice(match[0].length) };
}
```

**Edge case:** the existing `updateGistFrontmatter` at `main.ts:869-891` parses frontmatter after pipeline. It must continue to find `gist_id` etc. — guaranteed because frontmatter is re-attached verbatim before that step.

---

## Fix #3 — Fail-closed for forced GFM/Gist

**File:** `src/main.ts` — inside `processSingleFile`, the existing GFM block at the top of the rename/publish pipeline
```ts
if (this.settings.enableGfmReformatting || options?.forceGfm) {
  statusBarItem.setText('Reformatting body for Gist...');
  const preTransformed = this.gfmService.preTransform(
    bodyWithoutFrontmatter,
    this.settings.stripCitations
  );
  const reformatted = await this.aiService.reformatForGfm(
    preTransformed,
    this.settings.gfmPrompt,
    sanitizedTitle
  );

  if (!reformatted) {
    // Fail-closed: GFM was requested but AI returned empty/errored.
    // Do not rename, do not publish, do not silently use raw content.
    statusBarItem.setText('');
    const error = this.errorHandler.createGenerationError(
      'GFM reformatting failed (AI call returned empty or errored). ' +
      'File not renamed and not published. Please retry.'
    );
    this.errorHandler.handleError(error);
    return { success: false, originalPath: file.path, error: error.message };
  }

  // ... existing sentPrompt reconstruction and postTransform block ...
  let transformedBody = this.gfmService.postTransform(
    reformatted,
    this.settings.cleanQAPrefix,
    sentPrompt
  );

  if (frontmatter) {
    finalContent = `---\n${frontmatter}\n---\n${transformedBody}`;
  } else {
    finalContent = transformedBody;
  }
}
```

**Behavior table** (AI success vs failure, for each combination of user intent):

| `enableGfmReformatting` | `forceGfm` | AI returns content | AI returns `''` / throws |
|---|---|---|---|
| false | false | Pipeline not entered — normal title-only path | Pipeline not entered — normal title-only path |
| true | false | Run postTransform + re-attach frontmatter | **Stop with error notice** |
| false | true | Run postTransform + re-attach frontmatter | **Stop with error notice** |
| true | true | Run postTransform + re-attach frontmatter | **Stop with error notice** |

The user-facing Notice clearly indicates "File not renamed and not published." Status bar item must be cleared on the error path. The check `if (!reformatted)` catches both empty-string returns from `aiService.reformatForGfm` (`aiService.ts:436, 453`) and exceptions thrown inside it.

---

## Fix #4 — Stateful regex reset in `stripInstructions`

**File:** `src/gfmService.ts:113-115`

**Replace:**
```ts
const filteredLines = lines.filter((line) => {
  return !instructionPatterns.some((pattern) => pattern.test(line));
});
```

**With:**
```ts
const filteredLines = lines.filter((line) => {
  return !instructionPatterns.some((pattern) => {
    // Clone to avoid lastIndex mutation across iterations.
    return new RegExp(pattern.source, pattern.flags).test(line);
  });
});
```

Cost is 14 regex compilations × N lines — negligible for note-sized inputs.

---

## Fix #5 — Q&A prefix actually strips `A:` / `Answer:`

**File:** `src/gfmService.ts:178-208` (inside `stripQaPrefix`)

**Current behavior** pushes the answer line as-is when it starts with `A:` / `Answer:`. Replace with active prefix strip:

```ts
const answerMatch = line.match(/^(\s*)(a|answer|ans)\s*[:.]\s*(.*)$/i);
if (answerMatch) {
  // Strip the prefix and treat the remainder as the answer body.
  resultLines.push(answerMatch[3]);
  continue;
}
```

Insert this case alongside the existing `Q:` handling, before the default `resultLines.push(line)`.

---

## Fix #6 — Table validation: missing separator + alignment

**File:** `src/gfmService.ts` — `transformTables` function and `validateTables` function

**In `transformTables`, change the existing flow to detect missing separators:**

```ts
// Inside transformTables, after detecting a header row pattern and BEFORE
// the existing separator-normalization step, check the next line:
const headerCells = headerLine.split('|').slice(1, -1).map(c => c.trim());
const nextLine = lines[i + 1] ?? '';
const isValidSeparator = /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/.test(nextLine);

if (!isValidSeparator) {
  // Missing or malformed separator — inject one based on header column count.
  const separator = '|' + headerCells.map(() => '---').join('|') + '|';
  result.push(headerLine);
  result.push(separator);
  // The loop's existing body-row handling will pick up `lines[i + 1]` next.
} else {
  // Existing separator present — call normalizeTableSeparator on it as before.
  result.push(headerLine);
  result.push(this.normalizeTableSeparator(nextLine));
  i++; // Skip the original next line since we just emitted the normalized version.
}
// Then continue with the existing body-row loop unchanged.
```

**In `validateTables`, after collecting candidate rows, ensure column count consistency:**
- If any body row has a different `|` count than the header, drop that row.
- If the separator column count differs from header, regenerate it from header using `headerCells.map(() => '---').join('|')`.

---

## Fix #7 — Link transform context-aware

**File:** `src/gfmService.ts` — inside the `transformLinks` function

**Pre-condition:** rely on a per-call `inFence` flag passed into `transformLinks` — OR have `transformLinks` scan its own fence state internally.

**Approach:** scan line-by-line with own fence tracking (since `transformLinks` is independent of `transformCodeBlocks`):

```ts
private transformLinks(content: string): string {
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

    // Skip inline code segments
    const segments = line.split(/(`+)([^`]*?)\1/g);
    const transformed = segments.map((seg, i) => {
      if (i % 3 === 0) {
        // Outside inline code — wrap bare URLs
        return seg.replace(
          /(?<![<\(\[])(https?:\/\/[^\s<>\)]+?)([.,;:!?]+)?(?=[\s<>\)]|$)/g,
          (match, url, trailing = '') => {
            const cleanUrl = url.replace(/[.,;:!?]+$/, '');
            const trail = url.slice(cleanUrl.length);
            return `<${cleanUrl}>${trail}`;
          }
        );
      }
      return seg; // Inside inline code — leave untouched
    }).join('');

    result.push(transformed);
  }
  return result.join('\n');
}
```

Trailing punctuation is split off the URL and reattached outside the angle brackets.

---

## Fix #9 — Task list: `( )`, `(x)`, `< >`, `[X]`

**File:** `src/gfmService.ts:222-228` (inside `transformTaskLists`)

**Add after existing square-bracket transform:**

```ts
result = result.replace(/^(\s*)[-*+]?\s*\(([ xX])\)\s*/gm, '$1- [$2] ');
result = result.replace(/^(\s*)[-*+]?\s*<([ xX])>\s*/gm, '$1- [$2] ');
```

**Update existing transform to normalize `[X]` → `[x]`:**
```ts
result = result.replace(/^(\s*)[-*+]?\s*\[X\]\s*/gm, '$1- [x] ');
result = result.replace(/^(\s*)[-*+]?\s*\[x\]\s*/gm, '$1- [x] ');
result = result.replace(/^(\s*)[-*+]?\s*\[\s\]\s*/gm, '$1- [ ] ');
```

---

## Fix #10 — `normalizeTableSeparator` duplicate condition

**File:** `src/gfmService.ts:368-370`

**Replace duplicate-condition block with explicit alignment handling:**
```ts
const t = trimmed;
if (t === ':') return ':---';
if (t === ':-') return ':---';
if (t === '-:') return '---:';
if (/^:-+:$/.test(t)) return ':---:';
if (/^:-+$/.test(t)) return ':---';
if (/^-+:$/.test(t)) return '---:';
if (/^-+$/.test(t)) return '---';
return '---';
```

`':'` now means left-align, `':-'` is normalized to left, `'-:'` to right, `':-:'` to center, and bare `-` stays default.

---

## Verification

After each fix:
```bash
npm run build
```
Must complete with no TypeScript errors and exit code 0.

After all 10 fixes:
```bash
npm run build
```
Final cumulative check.

Manual smoke check after #1 and #2 (the highest-risk fixes):
- A note with ` ```js\n    const x = 1;\n``` ` round-trips through Paste & Share without nested fences.
- A note with a 4-space indented code block survives `stripCitations` with indentation intact.

---

## Risk Register

| Fix | Risk | Mitigation |
|---|---|---|
| #1 | Fence state machine miscounts (e.g. info-string fence vs closing fence) | Match by marker character only (` ``` ` vs `~~~`); ignore info string after opener |
| #2 | YAML list indentation in frontmatter (untouched, but) relies on leading whitespace | Not affected — `splitFrontmatter` runs first; `stripCitations` only sees body |
| #3 | Status bar stuck if `errorHandler.handleError` throws | Wrap in try/catch at top-level (existing pattern at main.ts:471) |
| #8 | Edge case: file has `---` separator inside body but not at top | Regex anchored with `^---\n` so only top-of-file frontmatter matches |
| #7 | Inline code detection via backtick balance — multi-backtick fences inside a line mis-split | Use `/(`+)([^`]*?)\1/g` to balance same-length backticks; link transform only wraps bare http(s) URLs which don't appear in normal prose backticks |

---

## Out of Scope (recorded, not fixed)

- `gfmPrompt` is not exposed in settings UI (`settings.ts:295-338` has no textarea). Out of scope for this fix pass.
- ESLint v10 config mismatch — pre-existing, do not touch.
- Test suite setup — explicitly out of scope.