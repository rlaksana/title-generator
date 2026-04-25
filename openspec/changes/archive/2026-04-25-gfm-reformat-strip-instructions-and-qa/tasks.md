## 1. GfmService Cleanup Methods

- [x] 1.1 Add `stripInstructions(content: string): string` private method to GfmService
  - Remove lines matching common instruction patterns (e.g., "Instructions:", "Format the following", "You are a helpful assistant")
  - Remove content that appears to be duplicated prompt fragments

- [x] 1.2 Add `stripQaPrefix(content: string): string` private method to GfmService
  - Detect Q&A pattern at start: question lines (Q: / Question:) followed by answer lines (A: / Answer:)
  - Remove question lines and any blank lines between question and answer
  - Preserve answer content

- [x] 1.3 Integrate cleanup methods into `postTransform` method
  - Call `stripInstructions` first, then `stripQaPrefix`
  - Ensure cleanup runs before final blank line normalization

## 2. Verification

- [x] 2.1 Run `npm run build` to verify TypeScript compilation
- [x] 2.2 Test with example content containing leaked instructions
- [x] 2.3 Test with example content containing Q&A prefix
