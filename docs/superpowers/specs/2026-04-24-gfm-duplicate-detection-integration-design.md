# Design: Integrate Duplicate Detection into GFM Reformat

**Date:** 2026-04-24
**Status:** Approved
**Approach:** Option A (2 AI calls, simplified)

## Goal

Remove `detectAndRemoveDuplicateWithAI()` function and integrate its logic into the GFM reformat step. Reduce code complexity while maintaining functionality.

## Current Flow

1. `generateTitle()` — AI call #1
2. `detectAndRemoveDuplicateWithAI()` — AI call #2 (separate function)
3. `reformatForGfm()` — AI call #3

## Proposed Flow

1. `generateTitle()` — AI call #1
2. `reformatForGfm(title)` — AI call #2 (now includes duplicate check)
3. **Delete** `detectAndRemoveDuplicateWithAI()`

## Changes

### 1. `src/utils.ts`
- **DELETE** entire `detectAndRemoveDuplicateWithAI()` function (~216 lines)

### 2. `src/aiService.ts` — `reformatForGfm()`
- Add optional `title?: string` parameter
- If title provided, append duplicate detection instruction to prompt:
```
IMPORTANT: Before reformatting, check if the beginning of the content duplicates the title "{title}". If yes, remove the duplicate lines from the start of the content first, then reformat.
```

### 3. `src/main.ts` — `processSingleFile()`
- Remove import: `detectAndRemoveDuplicateWithAI`
- Remove pre-GFM duplicate detection block (lines ~296-307)
- Update GFM call to pass `sanitizedTitle`:
```typescript
const reformatted = await this.aiService.reformatForGfm(
  preTransformed,
  this.settings.gfmPrompt,
  sanitizedTitle
);
```

## Files Modified

| File | Action |
|------|--------|
| `src/utils.ts` | DELETE `detectAndRemoveDuplicateWithAI()` |
| `src/aiService.ts` | MODIFY `reformatForGfm()` signature and prompt |
| `src/main.ts` | REMOVE duplicate check block, UPDATE GFM call |

## Lines Removed

~216 lines (entire `detectAndRemoveDuplicateWithAI` function + ~10 lines call site removal)

## Risk Assessment

- **Low risk**: Behavior preserved, just moved to different step
- **AI prompt dependency**: Duplicate detection now depends on GFM prompt handling — if GFM prompt is empty/custom and doesn't leave room for instruction, may be less effective
