# ADR 0007: Suggestions Embedded In Context Reports

## Status

Accepted

## Context

The first traction-MVP feature is a read-only suggestion engine.
There are two obvious implementation shapes:

- a separate analysis endpoint
- suggestions embedded in the existing normalized report

Tokn already treats `ContextReport` as the core machine-facing contract.

## Decision

Embed deterministic, advisory suggestions directly in `ContextReport`.

Rules are evaluated in the analyzer layer, not in CLI formatters.
`agent-report` should expose suggestions through each agent's nested report rather than through a parallel ad hoc structure.

## Consequences

- JSON output stays aligned with SDK types
- suggestion behavior is testable without going through CLI rendering
- public report shape expands and should be treated as part of the OSS contract
