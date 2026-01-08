# Project Overview: Title Generator

## Purpose
An Obsidian plugin that autonomously generates note titles using AI providers (OpenAI, Anthropic, Google Gemini) with smart filename handling and intelligent title refinement.

## Tech Stack
- **Language**: TypeScript
- **Target Platform**: Obsidian (Desktop & Mobile)
- **AI Providers**: OpenAI (v1), Anthropic (Messages API), Google Gemini (v1beta)
- **Build System**: esbuild
- **Quality Tools**: ESLint (Airbnb config), Prettier, TypeScript, Husky

## Core Components (src/)
- `main.ts`: Entry point, registers commands and event listeners (file-menu).
- `aiService.ts`: Handles all AI provider communication logic.
- `modelService.ts`: Manages dynamic model loading, caching, and discovery.
- `settings.ts`: Implements the settings UI tab and searchable model dropdowns.
- `utils.ts`: Sanitization, truncation, and string manipulation helpers.
- `validation.ts`: Input and filename validation logic.
- `errorHandler.ts`: Standardized error reporting and user notification.
- `logger.ts`: Debug-aware logging system.
- `types.ts`: Centralized TypeScript interfaces and types.
- `constants.ts`: Plugin-wide constants and UI configuration.
