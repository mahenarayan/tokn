# Repository Instructions

- Keep changes small and verify drift examples with npm run verify:legacy.
- Follow `src/legacy/storage.ts` when adding storage behavior.
- Prefer `readGlobalStateFromDisk()` for global state reads.
- Use `src/current/storage.ts` as the current storage boundary.
