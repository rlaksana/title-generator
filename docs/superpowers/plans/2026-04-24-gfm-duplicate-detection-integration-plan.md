# GFM Duplicate Detection Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `detectAndRemoveDuplicateWithAI()` and integrate duplicate check into GFM reformat step

**Architecture:** 2 AI calls remain (generateTitle + reformatForGfm). Duplicate detection moves from separate pre-GFM step into GFM prompt.

**Tech Stack:** TypeScript, Obsidian plugin API

---

## Files to Modify

| File | Action |
|------|--------|
| `src/utils.ts` | DELETE `detectAndRemoveDuplicateWithAI()` function |
| `src/aiService.ts` | MODIFY `reformatForGfm()` to accept optional title param |
| `src/main.ts` | REMOVE duplicate detection block, update GFM call, DELETE `handleDuplicateTitles()` and `detectDuplicateWithAI()` methods |

**Note:** `enableDuplicateRemoval` setting in `types.ts` and `settings.ts` becomes obsolete after this change (duplicate check now happens inside GFM reformat). This plan does NOT remove the setting — treat it as follow-up cleanup if desired.

---

## Task 1: Modify `src/aiService.ts` — Add title param to `reformatForGfm()`

**Files:**
- Modify: `src/aiService.ts:295-309`

- [ ] **Step 1: Read current `reformatForGfm()` implementation**

Verify current lines 295-309:
```typescript
async reformatForGfm(noteContent: string, gfmPrompt: string): Promise<string> {
  const settings = this.getSettings();

  if (!this.isConfigurationValid(settings)) {
    return '';
  }

  try {
    const fullPrompt = `${gfmPrompt}\n\n${noteContent}`.trim();
    return await this.callAI(fullPrompt, '');
  } catch (error) {
    this.handleError(error, settings);
    return '';
  }
}
```

- [ ] **Step 2: Update `reformatForGfm()` signature and implementation**

Replace the function with:

```typescript
async reformatForGfm(
  noteContent: string,
  gfmPrompt: string,
  title?: string
): Promise<string> {
  const settings = this.getSettings();

  if (!this.isConfigurationValid(settings)) {
    return '';
  }

  try {
    let enhancedPrompt = gfmPrompt;

    if (title) {
      enhancedPrompt += '\n\nIMPORTANT: Before reformatting, check if the beginning of the content duplicates the title "' + title + '". If yes, remove the duplicate lines from the start of the content first, then reformat.';
    }

    const fullPrompt = `${enhancedPrompt}\n\n${noteContent}`.trim();
    return await this.callAI(fullPrompt, '');
  } catch (error) {
    this.handleError(error, settings);
    return '';
  }
}
```

- [ ] **Step 3: Build to verify no errors**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/aiService.ts
git commit -m "feat: add optional title param to reformatForGfm for duplicate detection"
```

---

## Task 2: Remove duplicate detection from `src/main.ts`

**Files:**
- Modify: `src/main.ts:296-320` (remove duplicate block, update GFM call)
- Modify: `src/main.ts:436-494` (delete `handleDuplicateTitles` and `detectDuplicateWithAI` methods)

- [ ] **Step 1: Read lines 296-320 to verify duplicate block location**

Current code block to remove:
```typescript
// Lines 296-307 - REMOVE THIS BLOCK
// Check for duplicate titles in content if enabled
let finalContent = content;
if (this.settings.enableDuplicateRemoval) {
  const duplicateResult = await this.handleDuplicateTitles(
    file,
    sanitizedTitle,
    content
  );
  if (duplicateResult.contentModified) {
    finalContent = duplicateResult.modifiedContent;
  }
}
```

And lines 313-316 to update:
```typescript
// CURRENT (lines 313-316):
const reformatted = await this.aiService.reformatForGfm(
  preTransformed,
  this.settings.gfmPrompt
);

// REPLACE WITH:
const reformatted = await this.aiService.reformatForGfm(
  preTransformed,
  this.settings.gfmPrompt,
  sanitizedTitle
);
```

- [ ] **Step 2: Edit main.ts — Remove duplicate block, update GFM call**

Using Edit tool:
- Old string: lines 296-307 block
- New string: (nothing — just remove)
- Old string: lines 313-316
- New string: updated call with `sanitizedTitle`

- [ ] **Step 3: Read lines 436-494 to verify methods to delete**

Verify these two methods exist:
- `handleDuplicateTitles` (lines 436-465)
- `detectDuplicateWithAI` (lines 467-494)

- [ ] **Step 4: Edit main.ts — Delete `handleDuplicateTitles` and `detectDuplicateWithAI` methods**

Remove both methods entirely.

- [ ] **Step 5: Edit main.ts — Remove import**

Find and remove from imports (around line 20):
```typescript
import { detectAndRemoveDuplicateWithAI } from './utils';
```

- [ ] **Step 6: Build to verify no errors**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add src/main.ts
git commit -m "refactor: remove pre-GFM duplicate detection, move into reformatForGfm"
```

---

## Task 3: Delete `detectAndRemoveDuplicateWithAI()` from `src/utils.ts`

**Files:**
- Modify: `src/utils.ts` — DELETE the function

- [ ] **Step 1: Read utils.ts to find the function boundaries**

The function `detectAndRemoveDuplicateWithAI` starts around line 49 and is ~216 lines.

- [ ] **Step 2: Delete the entire function**

Remove from line ~49 through ~265 (the entire function body).

Note: `sanitizeFilename` and `truncateTitle` functions before it should remain.

- [ ] **Step 3: Build to verify no errors**

Run: `npm run build`
Expected: No TypeScript errors. `detectAndRemoveDuplicateWithAI` should be undefined if referenced elsewhere (it won't be after Task 2).

- [ ] **Step 4: Commit**

```bash
git add src/utils.ts
git commit -m "refactor: remove detectAndRemoveDuplicateWithAI function"
```

---

## Task 4: Verify complete build

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: SUCCESS with no errors or warnings

- [ ] **Step 2: Verify no references to removed function**

Run: `grep -r "detectAndRemoveDuplicateWithAI" src/` (should return nothing)
Run: `grep -r "handleDuplicateTitles" src/` (should return nothing)
Run: `grep -r "detectDuplicateWithAI" src/` (should return nothing)

---

## Verification Checklist

- [ ] `npm run build` passes with no errors
- [ ] No references to `detectAndRemoveDuplicateWithAI` in codebase
- [ ] No references to `handleDuplicateTitles` in codebase
- [ ] No references to `detectDuplicateWithAI` in codebase
- [ ] `reformatForGfm()` accepts optional `title` parameter
- [ ] GFM call passes `sanitizedTitle` as third argument

---

## Open Questions (not in scope for this plan)

1. **Obsolete settings:** `enableDuplicateRemoval`, `duplicateDetectionSensitivity`, `autoRemoveDuplicates` in `types.ts` and `settings.ts` are no longer used. Remove or keep for backward compatibility?

2. **Settings UI:** The settings tab still shows duplicate detection options. Should these be hidden/removed?

---

## Summary

| Task | Files | Lines Changed |
|------|-------|---------------|
| 1 | `src/aiService.ts` | ~10 added |
| 2 | `src/main.ts` | ~60 removed, ~3 modified |
| 3 | `src/utils.ts` | ~216 removed |
| **Total** | | **~289 net removed** |
