# Tokn: Next Feature Implementation Plan

## Summary

This document defines the next implementation wave for Tokn after the initial CLI, SDK, analyzer, regression suite, and CI setup.

Immediate priority is now defined by [docs/specs/traction-mvp.md](https://github.com/mahenarayan/tokn/blob/main/docs/specs/traction-mvp.md).
That spec is the active near-term plan for field adoption.
npm publishing and release automation are intentionally deferred until the MVP proves value.

The goal of the next phase is to make Tokn useful on real production payloads and traces, while preserving the current read-only product boundary.

Security note:

- LiteLLM-specific adapter work is deferred as of March 31, 2026 following the March 24, 2026 malicious PyPI release incident.
- The next adapter priority is OpenAI-compatible request logs.

Priorities for this phase:

1. improve adapter realism
2. improve machine-consumable outputs
3. import real trace formats
4. add actionable read-only guidance
5. harden model metadata coverage

## Milestone 1: Real Provider Adapters

### Scope

Extend the analyzer to support richer real-world payload shapes:

- OpenAI Responses-style input/output payloads
- richer Anthropic content block payloads
- common OpenAI-compatible JSON variants

### Implementation Changes

- Add provider-specific normalization helpers in `src/analyzer.ts` or split them into dedicated adapter modules if the file becomes too large.
- Parse structured content blocks without flattening them prematurely.
- Preserve explicit mapping for:
  - text parts
  - tool schema
  - tool results
  - retrieval chunks
  - attachments/images/files
  - provider overhead when usage totals exceed visible segment estimates
- Keep segment confidence accurate and conservative.

### Acceptance Criteria

- Tokn can ingest at least one realistic OpenAI Responses-style fixture and classify its parts correctly.
- Tokn can ingest at least one richer Anthropic fixture with structured blocks.
- New adapters are covered by analyzer and fixture-backed tests.
- Existing golden CLI outputs remain stable unless intentionally changed.

## Milestone 2: Machine-Consumable CLI Output

### Scope

Add structured output modes so Tokn can be used in scripts, CI, and editor tooling.

### Implementation Changes

- Add `--json` support to:
  - `inspect`
  - `diff`
  - `budget`
  - `agent-report`
- Optionally support `--format text|json` as a cleaner long-term surface, but `--json` is sufficient for the first pass.
- Keep the current text format as the default.

### Acceptance Criteria

- Every CLI command can emit valid JSON with stable top-level structure.
- CLI tests cover both text and JSON mode for at least one command.
- JSON output is derived from the same report objects used by the SDK, not from ad hoc string parsing.

## Milestone 3: Trace Import

### Scope

Allow Tokn to analyze real trace exports instead of requiring handcrafted `agents[]` snapshots.

### Implementation Changes

- Add import support for OpenTelemetry/OpenInference-shaped traces.
- Map spans/events into:
  - agent identity
  - parent/child agent relationships
  - prompt/context segments
  - token totals when available
  - model and provider metadata
- Keep this import read-only and diagnostic.

### Acceptance Criteria

- Tokn can ingest at least one trace fixture and produce an `agent-report`.
- Parent/child agent grouping is preserved.
- Missing token counts degrade gracefully to estimated or unknown states.

## Milestone 4: Suggestion Engine

### Scope

Add read-only recommendations that explain how engineers might reduce context pressure.

### Implementation Changes

- Add suggestion rules based on segment composition and budget pressure.
- Initial rules should detect:
  - oversized tool schema
  - large assistant history
  - large retrieval context
  - low remaining headroom
  - provider overhead dominating visible payload size
- Suggestions should remain advisory, never prescriptive or mutating.

### Acceptance Criteria

- Reports can include zero or more suggestions with short, deterministic wording.
- Suggestions appear in both SDK output and CLI output.
- Tests cover at least one high-pressure and one no-suggestion case.

## Milestone 5: Model Registry Refactor

### Scope

Make model metadata easier to maintain and expand.

### Implementation Changes

- Refactor `src/models.ts` into a cleaner registry structure, potentially backed by a JSON or TS data file.
- Preserve:
  - provider
  - aliases
  - context window
  - default reserved output budget
- Add tests for alias resolution and unknown-model handling.

### Acceptance Criteria

- Registry additions do not require touching budget logic.
- Alias resolution remains deterministic.
- Unknown models still produce useful partial budget output.

## Testing Plan

For every milestone:

- add or update analyzer tests in `src/test/analyzer.test.ts`
- add fixture-backed regression tests in `src/test/fixtures.test.ts`
- update CLI tests in `src/test/cli.test.ts` when output changes
- update `fixtures/golden/` only when text output changes intentionally
- run `npm run check` before merging

## Guardrails

- Keep Tokn read-only.
- Do not add hosted-service assumptions.
- Do not add policy enforcement or live steering controls in this phase.
- Prefer explicit adapters over loose heuristics when supporting a new payload shape.
- When exact counts are not possible, label estimates clearly rather than simulating false precision.

## Recommended Execution Order

1. OpenAI Responses and richer Anthropic adapters
2. `--json` output across CLI commands
3. OpenTelemetry/OpenInference trace import
4. suggestion engine
5. model registry refactor

## Current Adapter Focus

- completed: OpenAI Responses-style payloads
- completed: richer Anthropic payloads
- completed: OpenInference trace import
- completed: Langfuse full trace import
- completed: OpenAI-compatible request logs
- deferred: LiteLLM-specific adapter work pending a future security review
