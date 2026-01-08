# Design Rationale Record: Provider-Specific Strategy Adapters

**ID**: DRR-20260108-PROVIDER-STRATEGY
**Status**: ACCEPTED
**Winner**: provider-strategy-adapters
**Rejected**: static-capability-registry, dynamic-request-templating

## Context
The plugin needs to support next-generation reasoning models (GPT-5, Claude 4.5, Gemini 3) which introduce incompatible API parameters (e.g., `max_completion_tokens`, `budget_tokens`, `thinkingLevel`) and specialized behaviors. The current `AIService` is becoming a "God Object" with complex conditional logic.

## Decision
We decided to refactor `AIService` using the **Strategy Pattern**, introducing specialized adapters for OpenAI, Anthropic, and Google Gemini.

## Rationale
- **Maintainability**: Isolates provider-specific "dialects" and reasoning quirks, preventing updates to one provider from breaking others.
- **Extensibility**: Simplifies adding new providers or specialized model types in the future.
- **Testability**: Allows for unit testing individual provider logic in isolation.
- **Reliability ($R_{eff}$: 0.85)**: While the refactoring has a higher implementation cost than a simple registry, the long-term architectural health outweighs the short-term effort.

## Consequences
- **Refactor Effort**: Requires significant changes to `src/aiService.ts`.
- **Improved Clarity**: Code related to reasoning effort, thinking budgets, and response cleaning will be much easier to navigate.
- **Regression Risk**: Careful testing is needed to ensure legacy models (GPT-4, Claude 3.5) still work correctly.

## Validity
This decision should be revisited if a unified standard for Reasoning/Thinking APIs emerges across the major providers.
