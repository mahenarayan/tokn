# Copilot Instructions Lint

Use this when a repository has multiple Copilot instruction files and you want deterministic feedback on overlap, stale scopes, or verbose always-on wording.

## Example Command

```bash
node dist/cli.js instructions-lint fixtures/instructions/invalid-repo
```

Optional markdown output:

```bash
node dist/cli.js instructions-lint fixtures/instructions/invalid-repo --format markdown
```

## What This Answers

- which instruction files are in scope
- whether any file shape is invalid
- whether `applyTo` patterns are stale or too broad
- whether overlapping files duplicate or conflict with each other
- whether instruction wording is wasting always-on context

## Why This Matters

Copilot instruction files are part of the effective prompt surface.
If they drift, overlap, or become too verbose, the AI receives lower-signal context on every request.

## Real-World Mapping

Use this before:

- enabling Copilot code review on a repository
- tightening shared engineering guidelines
- adding more path-specific instruction files
- turning instruction quality into a CI gate
