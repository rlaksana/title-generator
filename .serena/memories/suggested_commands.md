# Suggested Commands

## Development
- `npm run dev`: Watch mode for development.
- `npm run build`: Production build (includes typecheck and esbuild).
- `npm run typecheck`: Run TypeScript compiler in noEmit mode.

## Quality Control
- `npm run lint`: Run ESLint to check for code style and potential errors.
- `npm run format`: Check code formatting with Prettier.
- `npm run test`: Run the CLI-based test suite (`test-cli.js`).

## Release & Maintenance
- `npm run version`: Bump version in manifest.json and versions.json.
- `npm run force-release`: Recreate latest release to fix CDN issues.
- `npm run check-cdn`: Verify release accessibility on CDNs.
- `npm run check-local`: Test local files before release.

## Utilities (Windows)
- `git status`: Check current git status.
- `dir`: List files in current directory.
- `findstr`: Search for patterns in files.
- `powershell -Command "Get-Content <file>"`: Read file content.
