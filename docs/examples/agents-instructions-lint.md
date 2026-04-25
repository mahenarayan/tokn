# AGENTS.md Instructions Lint

Use this when you want to lint repository guidance that is carried through `AGENTS.md` files instead of Copilot-specific paths.

## Command

```bash
node dist/cli.js instructions-lint fixtures/instructions/agents-repo --preset agents-md
```

## What It Answers

- whether nested `AGENTS.md` files create duplicate or conflicting guidance
- whether directory-scoped instruction files are too verbose
- whether one subtree is accumulating too much always on instruction load

## Why It Matters

This keeps the engine honest: Tokn is not just checking Copilot filenames.
It is using an instruction lint core with explicit presets, with `copilot` and `agents-md` as supported presets today.
