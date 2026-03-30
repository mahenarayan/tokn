# Contributing To Orqis

## Goal

Orqis should stay small, explicit, and trustworthy.
Contributions are welcome, but new work has to preserve three properties:

- read-only analysis scope
- conservative token accounting
- fixture-backed, regression-safe behavior

## Before You Start

Read:

- [README.md](/Users/raksha/Documents/Projects/probe/README.md)
- [INSTRUCTIONS.md](/Users/raksha/Documents/Projects/probe/INSTRUCTIONS.md)
- [docs/architecture.md](/Users/raksha/Documents/Projects/probe/docs/architecture.md)
- [docs/spec-driven-development.md](/Users/raksha/Documents/Projects/probe/docs/spec-driven-development.md)
- [docs/adr/README.md](/Users/raksha/Documents/Projects/probe/docs/adr/README.md)

## Development Workflow

1. start from a spec for non-trivial work
2. add or update fixtures before trusting a provider shape
3. add or update tests
4. implement one behavioral change at a time
5. run the verification loop before opening a PR

Local setup:

```bash
npm install --cache .npm-cache
```

Verification:

```bash
npm run check
npm run pack:check
```

## What To Include In A Pull Request

- a clear problem statement
- the supported input/output behavior
- tests or fixture updates for the affected path
- doc updates if the public surface changed

For architecture or public-contract changes:

- add or update a spec under `docs/specs/`
- add or update an ADR under `docs/adr/` when the decision is lasting

## Contribution Boundaries

Good contributions usually fit one of these:

- new input adapters
- improved segment normalization
- better trace import
- stronger model metadata
- safer CLI/SDK contracts
- more realistic fixtures and regression coverage

Changes that need explicit discussion first:

- hosted service behavior
- runtime steering or policy enforcement
- telemetry collection beyond file and trace inspection
- silently loosening confidence semantics
- incompatible changes to report shapes or CLI behavior

## Reporting Bugs

Open a GitHub issue with:

- the command used
- the input payload or a minimized redacted fixture
- the expected behavior
- the actual behavior
- Orqis version and Node version

If the bug involves a security issue, use the process in [SECURITY.md](/Users/raksha/Documents/Projects/probe/SECURITY.md) instead of a public issue.
