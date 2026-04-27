## Why

Content processed for AI summarization or title generation often contains citation markers like `[1]`, `[2][3]`, or `^[1]^` that are artifacts from research tools, web clipping, or academic sources. These markers clutter the output and reduce quality. A universal citation/reference cleaner is needed to strip these before processing.

## What Changes

- **New capability**: `citation-reference-cleaner` — Strip citation markers from text content
  - Inline numeric citations: `[1]`, `[2][3]`, `[1][2][3]`
  - Superscript citations: `^[1]^`, `^[1,2]^`
  - Bracketed references: ` [source]`, `[ref:abc123]`
  - URL citations in brackets: `[link text](url)`
  - Numeric references at line ends: `...text.[1]`
  - Reference numbers in parentheses: `(1)`, `(1, 2)`
  - Mixed patterns commonly found in research content

## Capabilities

### New Capabilities

- `citation-reference-cleaner`: Strip all common citation and reference marker patterns from raw text before AI processing. Works as a pre-transform step in the GFM pipeline.

### Modified Capabilities

- `gfm-reformat`: Extend existing GFM reformat pipeline to include citation cleaning as an optional pre-processing step.

## Impact

- Affects: `src/services/gfmService.ts` (GFM reformat pipeline)
- New file: `src/services/citationCleanerService.ts`
- Settings: Add toggle `stripCitations` in `DEFAULT_SETTINGS` and settings tab
