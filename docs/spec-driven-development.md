# Spec-Driven Development

## Goal

Orqis should evolve through explicit specifications, not implied intent from code changes.
The workflow should make behavior, constraints, and tests clear before implementation.

## Required Workflow

For any meaningful feature, adapter, output contract, or architecture change:

1. write a spec
2. record major architectural decisions in an ADR
3. add or update fixtures
4. implement the change
5. verify through the test bed
6. update docs if the surface changed

## When A Spec Is Required

Write a spec under `docs/specs/` when the change affects:

- supported input schemas
- internal report shape
- CLI contract
- JSON output contract
- architectural boundaries
- trace import behavior
- suggestion engine rules
- compatibility expectations

## Minimum Spec Contents

Every spec should answer:

- what problem is being solved
- what is in scope
- what is explicitly out of scope
- what input shapes are supported
- what output or report changes are expected
- how failure and unknown data should behave
- what tests and fixtures will prove correctness

Use `docs/templates/spec-template.md`.

## When An ADR Is Required

Create or update an ADR when the change alters a lasting decision about:

- internal model shape
- adapter strategy
- CLI or JSON contract
- testing strategy
- architecture boundaries
- production/read-only scope
- trace import model

Use `docs/templates/adr-template.md`.

## Required Verification

No feature is complete until it is verified against the test bed.

Expected loop:

1. add or update fixtures
2. add or update tests
3. run `npm test`
4. run `npm run smoke` if CLI behavior changed
5. run `npm run check` before merge

## Default Documentation Outputs

Most non-trivial work should update at least one of:

- `docs/architecture.md`
- `docs/spec-driven-development.md`
- `docs/specs/...`
- `docs/adr/...`
- `INSTRUCTIONS.md`
- `README.md`

## Review Standard

The review question is not only “does the code work?”
It is also:

- is the behavior specified?
- is the decision recorded?
- is the test bed representative?
- can a new engineer understand why the change exists?
