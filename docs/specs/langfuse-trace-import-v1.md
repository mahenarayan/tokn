# Title

Langfuse Trace Import V1

## Problem

Orqis can currently analyze handcrafted agent snapshots and OpenInference-style trace exports, but Langfuse is a common trace backend for LLM applications and agent systems.
Without direct Langfuse support, engineers still need to hand-convert Langfuse traces before Orqis can explain context occupancy.

## Goals

- support Langfuse trace payloads returned by `GET /api/public/traces/{traceId}`
- analyze Langfuse traces through both `inspect` and `agent-report`
- preserve parent and child relationships when Langfuse observations include `AGENT` observations
- extract prompt-bearing context from Langfuse `GENERATION`, `TOOL`, and `RETRIEVER` observations
- stay conservative when exact generation token totals and separate external-context observations coexist

## Non-Goals

- calling the Langfuse API directly
- supporting every Langfuse list or export endpoint in v1
- mutating Langfuse traces or posting annotations back
- reconstructing exact provider serialization from Langfuse payloads
- interpreting arbitrary `SPAN` or `EVENT` observations as prompt-bearing unless the type is explicit

## Inputs

Support the Langfuse trace shape returned by the public trace endpoint:

- top-level trace object
- `observations` array containing full observation objects
- observation fields such as:
  - `id`
  - `parentObservationId`
  - `type`
  - `name`
  - `input`
  - `output`
  - `model`
  - `modelParameters`
  - `usageDetails`

Observation types in scope:

- `AGENT`
- `GENERATION`
- `TOOL`
- `RETRIEVER`

Fallback behavior:

- if no `AGENT` observations exist, treat root observations as synthetic agents for `agent-report`
- if `observations` contains only IDs or otherwise lacks full objects, fail with an actionable error

## Outputs

Add a new source type:

- `langfuse-trace`

Expected behavior:

- `inspect <langfuse-trace.json>` returns an aggregate `ContextReport`
- `agent-report <langfuse-trace.json>` returns per-agent or per-root-observation summaries
- Langfuse trace import should contribute the same normalized segment types already used elsewhere:
  - `system`
  - `developer`
  - `user`
  - `assistant_history`
  - `tool_schema`
  - `tool_result`
  - `retrieval_context`
  - `attachment`
  - `provider_overhead`
  - `agent_metadata`

## Internal Changes

- add Langfuse trace-shape detection alongside existing trace detection
- normalize Langfuse observations into the same report model used by OpenInference imports
- treat `AGENT` observations as explicit agent boundaries when present
- parse `GENERATION.input` as message content when it resembles chat messages, otherwise as a generic input payload
- map:
  - `GENERATION` input -> prompt segments
  - `TOOL` input/output -> `tool_schema` and `tool_result`
  - `RETRIEVER` output -> `retrieval_context`
- use `usageDetails` input/prompt metrics when they are present and semantically safe

## Edge Cases And Failure Behavior

- if `usageDetails` is present on a generation but the same agent subtree also contains tool or retriever observations, do not treat the generation token count as an exact total for the whole subtree
- if a Langfuse trace lacks `observations`, do not classify it as a supported trace payload
- if an observation has an unsupported type, ignore it unless it is needed as a grouping boundary
- if `GENERATION.input` is not message-structured, treat it as a generic user input segment instead of guessing hidden roles
- if the Langfuse payload contains only observation IDs, fail with an error that points users to the full trace endpoint

## Test Plan

- add a Langfuse trace fixture under `fixtures/`
- add analyzer tests for direct Langfuse trace analysis
- add fixture-backed tests for `inspect` aggregate analysis and `agent-report`
- add CLI tests proving:
  - `inspect` accepts the Langfuse fixture
  - `agent-report` accepts the Langfuse fixture
- run:
  - `npm run check`
  - `npm run pack:check`

## Acceptance Criteria

- Orqis supports Langfuse full trace payloads through `inspect`
- Orqis supports Langfuse full trace payloads through `agent-report`
- parent-child agent relationships are preserved when `AGENT` observations are present
- `GENERATION` observations contribute prompt segments and model metadata
- `TOOL` and `RETRIEVER` observations contribute external-context segments
- exact generation token totals degrade to conservative totals when external context is also present

## Related ADRs

- [0001 Read-Only Analysis Boundary](/Users/raksha/Documents/Projects/probe/docs/adr/0001-read-only-analysis-boundary.md)
- [0003 Fixture And Golden Test Bed](/Users/raksha/Documents/Projects/probe/docs/adr/0003-fixture-and-golden-test-bed.md)
- [0005 Trace Import Via OpenInference](/Users/raksha/Documents/Projects/probe/docs/adr/0005-trace-import-via-openinference.md)
- [0006 Public Alpha OSS Contract](/Users/raksha/Documents/Projects/probe/docs/adr/0006-public-alpha-oss-contract.md)
