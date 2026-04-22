# ADR 0010: Langfuse Trace Import

## Status

Accepted

## Context

OpenInference is not the only trace format engineers already have in the field.
Langfuse is a common trace store for LLM and agent applications, and its public trace endpoint exposes full observation trees with types such as `AGENT`, `GENERATION`, `TOOL`, and `RETRIEVER`.

Tokn needs to support this shape directly without introducing a separate hosted dependency or a custom export protocol.

## Decision

Support Langfuse full trace payloads from `GET /api/public/traces/{traceId}` as a first-class trace adapter.

The importer will:

- prefer `AGENT` observations as explicit agent boundaries
- fall back to root observations when no `AGENT` observations exist
- extract prompt-bearing input from `GENERATION` observations
- map `TOOL` and `RETRIEVER` observations into normalized external-context segments
- remain conservative when generation token totals and external-context observations would otherwise double count

## Consequences

- Tokn can analyze another real trace ecosystem without forcing manual conversion
- the trace-import model becomes multi-adapter rather than OpenInference-only
- trace summaries remain normalized through the existing `ContextReport` and `AgentSummary` contracts
- Langfuse traces with partial or ID-only observations still require the full trace endpoint for analysis
