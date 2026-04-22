# Governance

Tokn is maintained as a small, lint-first open source project.
The public contract is intentionally narrow so the package stays readable, stable, and secure.

## Maintainer Model

The project currently has a single maintainer:

- Mahesh Narayan ([`@mahenarayan`](https://github.com/mahenarayan))

Additional maintainers should only be added when they can share responsibility for:

- public review and merge decisions
- release integrity and npm publishing
- security triage
- support for the stable public contract

## Decision Model

Default rule:

- routine fixes and narrow improvements can land through normal pull request review

Stronger bar:

- changes to the stable CLI or SDK contract require explicit documentation
- long-lived architectural decisions require an ADR under `docs/adr/`
- changes that broaden the stable public surface should be discussed before implementation

## Stable Vs Experimental

Stable public surface:

- `instructions-lint`
- instruction lint report types
- deterministic text, JSON, and Markdown lint output

Experimental surface:

- `inspect`
- `diff`
- `budget`
- `agent-report`
- `check`

Experimental commands may change faster or move into a separate package later.

## Release Authority

Only maintainers should:

- cut releases
- change npm publishing configuration
- modify GitHub Actions release workflows
- change repository security posture or rulesets

Public releases should preserve the documented supply-chain posture in [docs/releasing.md](/Users/raksha/Documents/Projects/probe/docs/releasing.md).
