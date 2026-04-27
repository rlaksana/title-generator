## 1. Service Implementation

- [x] 1.1 Create `src/services/citationCleanerService.ts` with regex patterns for all citation types
- [x] 1.2 Export `stripCitations(content: string): string` function
- [x] 1.3 Add `stripCitations` setting to `DEFAULT_SETTINGS` constant (default: `true`)
- [x] 1.4 Add `stripCitations` to `TitleGeneratorSettings` interface

## 2. Integration

- [x] 2.1 Import and call `stripCitations` in `gfmService.ts` pre-transform pipeline when `stripCitations` is `true`
- [x] 2.2 Add citation cleaner toggle to `TitleGeneratorSettingTab` class with `display()` refresh

## 3. Verification

- [x] 3.1 Run `npm run build` to verify TypeScript compilation
- [x] 3.2 Test with sample content containing citation markers
