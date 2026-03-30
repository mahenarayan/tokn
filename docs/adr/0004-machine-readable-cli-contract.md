# ADR 0004: Machine-Readable CLI Contract

## Status

Accepted

## Context

Text-only CLI output is useful for humans but weak for CI, editor integrations, automation, and downstream tooling.

## Decision

Support `--json` across all CLI commands while keeping text as the default.

Command JSON outputs are derived from existing analyzer/SDK objects:

- `inspect` -> `ContextReport`
- `diff` -> `DiffReport`
- `budget` -> `BudgetSummary`
- `agent-report` -> `AgentSummary`

## Consequences

- Orqis becomes scriptable
- JSON shape becomes part of the product contract
- CLI changes must verify both text and JSON paths
