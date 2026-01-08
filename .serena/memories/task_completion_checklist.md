# Task Completion Checklist

Before considering a task complete, verify the following:

- [ ] **Type Safety**: `npm run typecheck` passes with no errors.
- [ ] **Code Quality**: `npm run lint` and `npm run format` pass.
- [ ] **Tests**: `npm run test` passes if the change affects core logic.
- [ ] **Mobile Compatibility**: Verified usage of `requestUrl` for any new network calls.
- [ ] **Error Handling**: New code uses `errorHandler.ts` for user-facing errors.
- [ ] **Logging**: Significant events are logged via `logger.ts` (respecting debug mode).
- [ ] **Build**: `npm run build` completes successfully.
- [ ] **Documentation**: Updated `README.md` or JSDoc if public behavior changed.
