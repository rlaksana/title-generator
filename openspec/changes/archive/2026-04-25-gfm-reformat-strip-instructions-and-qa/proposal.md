## Why

When copying AI-generated content and reformatting it to GFM, two issues occur:
1. **Instruction leakage**: The AI sometimes includes the original instructions/prompt in its output, which then leaks into the reformatted content
2. **Q&A prefix pollution**: AI responses often start with questions (e.g., "Q: How do I...?") before providing answers. Users only want the answer content, not the questions

These issues require post-processing cleanup that currently doesn't exist in the GFM reformat pipeline.

## What Changes

- Add **instruction stripping** to remove leaked system prompts or instructions from AI output
- Add **Q&A prefix removal** to detect and strip question lines that appear before answer content
- Both cleanups run as part of the GFM post-processing chain

## Capabilities

### New Capabilities

- `gfm-cleanup`: Post-processing cleanup for reformatted GFM content
  - Strips instructions that leaked into AI output
  - Removes Q&A prefix pattern (question lines before answer content)
  - Runs after AI reformat but before final GFM compliance check

### Modified Capabilities

- None

## Impact

- **Modified code**: `src/gfmService.ts` — add cleanup methods to postTransform chain
- **Modified flow**: `src/main.ts` — the GFM reformat flow (minimal change, cleanup is integrated into existing postTransform call)
- **No new dependencies**: Uses regex-based detection, no external libraries needed
