# ADR 0013: Lint Focused Public Product Boundary

## Status

Accepted

## Context

Tokn now contains two different kinds of value:

- `instructions-lint`, which is deterministic, works in CI, is scoped to repositories, and is easy to explain to enterprise engineering teams
- broader prompt and trace diagnostics, which are useful but adapter heavy, faster moving, and less cohesive as a stable public promise

For public OSS adoption and enterprise demos, combining both under one undifferentiated product surface would create avoidable problems:

- the repository story becomes harder to trust
- the stable contract becomes vague
- release and security posture has to cover more moving parts than necessary
- future package boundaries become harder to introduce cleanly

Splitting into separate repositories immediately would also be premature because the codebase is still small and the adoption pattern is not proven yet.

## Decision

Keep one repository, but adopt a lint focused product boundary:

- `instructions-lint` is the stable primary public surface for Tokn
- instruction lint report types and lint formatters are part of that stable surface
- `inspect`, `diff`, `budget`, `agent-report`, and `check` remain available as experimental diagnostics
- public demos, docs, release hardening, and enterprise positioning optimize for the linting workflow first
- do not split repositories at this stage

Future package separation is allowed once usage justifies it.
The expected next clean split would be:

- `tokn` for stable instruction governance and linting
- a separate diagnostics package for broader prompt and trace analysis

## Consequences

- README, CLI help, contribution guidance, and release docs must distinguish stable and experimental surfaces explicitly
- supply chain hardening can stay focused on a small public contract instead of an everything tool story
- diagnostics work can continue without expanding the enterprise support promise casually
- future package extraction becomes a packaging decision, not a product repositioning crisis
