# Title

Suggestion Engine V1

## Problem

Orqis can already explain what is present in context, but it still makes the engineer do the interpretation step manually.
That limits day-one usefulness.

The first suggestion engine should turn context reports into actionable diagnostics without mutating anything or pretending to optimize automatically.

## Goals

- add deterministic, read-only suggestions to `ContextReport`
- surface those suggestions in `inspect` and `agent-report`
- make suggestions machine-consumable through JSON output
- keep wording stable enough for tests and downstream tooling

## Non-Goals

- auto-remediation
- runtime enforcement
- probabilistic ranking or model-generated advice
- provider-specific recommendation logic hidden in formatters
- exhaustive prompt optimization strategy

## Inputs

Suggestion evaluation consumes an already normalized `ContextReport`.

It should use:

- segment types and token counts
- total input tokens
- budget risk and usage percent
- repeated segment text when available

It must tolerate:

- heuristic token counts
- partial reports
- reports without model metadata

## Outputs

Add a `suggestions` array to `ContextReport`.

Each suggestion should include:

- stable `code`
- `severity`
- human-readable `message`
- optional `segmentType`
- optional token/share metadata for downstream use

## Internal Changes

Suggestion evaluation should live outside render code.
The analyzer should construct the final report and then attach deterministic suggestions based on the report contents.

Initial v1 rules:

- oversized `tool_schema`
- oversized `assistant_history`
- oversized `retrieval_context`
- heavy `provider_overhead`
- medium or high budget pressure
- repeated large text segments

For segment-heavy rules, compare against visible prompt composition rather than total tokens including hidden provider overhead.

## Edge Cases And Failure Behavior

- If a report has no text-bearing segments, repeated-content rules should emit nothing.
- If provider overhead exists, prompt-composition rules should still evaluate visible segment distribution correctly.
- If model limits are unknown, budget-pressure rules should emit nothing rather than guessing.
- Suggestions must not claim exactness when the report confidence is heuristic.

## Test Plan

- add analyzer tests for positive and negative suggestion cases
- add fixture-backed tests for a high-pressure payload
- add CLI tests showing suggestions in `inspect`
- add CLI tests showing per-agent suggestions in `agent-report`
- add golden files for new suggestion-bearing text output
- run:
  - `npm run check`
  - `npm run pack:check`

## Acceptance Criteria

- `ContextReport` exposes deterministic suggestions
- `inspect` prints suggestions when they exist
- `agent-report` surfaces per-agent suggestions when they exist
- low-pressure fixtures can still produce zero suggestions
- existing non-suggestion goldens remain stable unless intentionally changed

## Related ADRs

- [0001 Read-Only Analysis Boundary](/Users/raksha/Documents/Projects/probe/docs/adr/0001-read-only-analysis-boundary.md)
- [0004 Machine-Readable CLI Contract](/Users/raksha/Documents/Projects/probe/docs/adr/0004-machine-readable-cli-contract.md)
- [0006 Public Alpha OSS Contract](/Users/raksha/Documents/Projects/probe/docs/adr/0006-public-alpha-oss-contract.md)
