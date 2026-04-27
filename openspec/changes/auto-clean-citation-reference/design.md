## Context

The title generator uses a GFM (GitHub Flavored Markdown) pipeline that pre-transforms content via regex before AI refinement. Currently the pipeline handles:
- Leaked instruction stripping
- Q&A prefix removal
- GFM compliance post-transform

Content from research tools, web clipping, and academic sources often contains citation markers that reduce AI processing quality. These markers take various forms: `[1]`, `^[1]^`, `(1)`, etc.

## Goals / Non-Goals

**Goals:**
- Strip all common citation/reference marker patterns from raw text
- Integrate cleanly as a pre-transform step in existing GFM pipeline
- Provide a toggle setting to enable/disable

**Non-Goals:**
- Parse or preserve citation metadata
- Handle footnote-style citations (e.g., `[^1]`)
- Process citations in code blocks or fenced code blocks

## Decisions

### Pattern-based regex approach

**Decision**: Use regex patterns to match and remove citation markers rather than building a full parser.

**Rationale**:
- Citations appear in many varied formats; regex covers most common cases efficiently
- No external dependency needed
- Maintains existing code patterns from `gfmService.ts`

**Alternatives considered**:
- Full citation parser: overkill for removal use case, adds complexity
- LLM-based detection: too heavy for simple pattern matching

### Pattern order matters

**Decision**: Apply patterns in specific order to avoid leaving artifacts.

**Rationale**:
- Some patterns overlap (e.g., `[1](url)` should remove `[1]` but preserve `(url)`)
- Order: bracketed first → parentheses → superscript → trailing

### Settings toggle

**Decision**: Add `stripCitations: boolean` to DEFAULT_SETTINGS.

**Rationale**:
- Users may want citations preserved in some contexts
- Matches existing toggle pattern for other GFM features

## Risks / Trade-offs

[Risk] False positives on `[1]` patterns in normal text → **Mitigation**: Primarily targets research/clipped content where citations are obvious noise
[Risk] Regex complexity grows with new patterns → **Mitigation**: Centralize patterns in single constant, document each

## Open Questions

- Should `gfm-reformat` spec be modified to include citation cleaning as a built-in step, or stay as an optional toggle?
