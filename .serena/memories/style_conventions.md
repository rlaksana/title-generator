# Style & Conventions

## General Principles
- **Functional Core, Imperative Shell**: Keep AI logic and transformations pure where possible, isolated from the Obsidian API.
- **Mobile First**: Always use Obsidian's `requestUrl` instead of generic `fetch` or `axios` to ensure compatibility with mobile devices.
- **Defensive Programming**: Extensive validation of user inputs and API responses (see `validation.ts` and `errorHandler.ts`).

## Naming
- **Classes/Interfaces**: PascalCase (e.g., `AIService`, `TitleGeneratorSettings`).
- **Methods/Variables**: camelCase (e.g., `generateTitle`, `isConfigurationValid`).
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `DEFAULT_SETTINGS`, `PLUGIN_NAME`).
- **Files**: camelCase or kebab-case (mostly camelCase in `src/`).

## Types
- Prefer explicit types over `any`.
- Define all shared interfaces in `src/types.ts`.
- Use discriminated unions for provider-specific configurations.

## Documentation
- Use JSDoc for complex functions and service methods.
- Focus on *why* logic exists, especially for AI prompt strategies.
