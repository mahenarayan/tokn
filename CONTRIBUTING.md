# Contributing To Tokn

## Goal

Tokn should stay small, explicit, and trustworthy.
New work has to preserve three properties:

- a lint focused public product boundary
- behavior that does not modify files
- fixture based behavior that protects regressions

## Before You Start

Read:

- [README.md](https://github.com/mahenarayan/tokn/blob/main/README.md)
- [INSTRUCTIONS.md](https://github.com/mahenarayan/tokn/blob/main/INSTRUCTIONS.md)
- [docs/architecture.md](https://github.com/mahenarayan/tokn/blob/main/docs/architecture.md)
- [docs/spec-driven-development.md](https://github.com/mahenarayan/tokn/blob/main/docs/spec-driven-development.md)
- [docs/adr/README.md](https://github.com/mahenarayan/tokn/blob/main/docs/adr/README.md)

## Development Workflow

1. start from a spec for substantial work
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

For architecture or public contract changes:

- add or update a spec under `docs/specs/`
- add or update an ADR under `docs/adr/` when the decision is lasting

## Contribution Boundaries

Stable surface contributions usually fit one of these:

- instruction discovery and parsing
- instruction lint rules and evidence
- report formatting and structured output
- CI and release hardening for the published package
- realistic instruction fixtures and golden coverage

Experimental diagnostics contributions can still land, but they need tighter discussion first because they are not the primary public contract:

- new prompt or trace input adapters
- improved segment normalization
- better trace import
- stronger model metadata for diagnostics
- safer CLI/SDK contracts for the diagnostics surface

Changes that need explicit discussion first:

- hosted service behavior
- runtime steering or policy enforcement
- telemetry collection beyond file and trace inspection
- silently loosening confidence semantics
- incompatible changes to report shapes or CLI behavior
- expanding the stable surface beyond `instructions-lint` without an ADR

Workflow changes should preserve the current supply chain posture:

- pin GitHub Actions to full SHAs
- keep workflow permissions least privilege
- avoid long lived publish tokens when GitHub OIDC trusted publishing can be used
- keep the published npm tarball limited to runtime artifacts and public support files

## Reporting Bugs

Open a GitHub issue with:

- the command used
- the input payload or a minimized redacted fixture
- the expected behavior
- the actual behavior
- Tokn version and Node version

If the bug involves a security issue, use the process in [SECURITY.md](https://github.com/mahenarayan/tokn/blob/main/SECURITY.md) instead of a public issue.
