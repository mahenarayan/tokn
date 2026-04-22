# ADR 0005: Trace Import Via OpenInference

## Status

Accepted

## Context

Handcrafted `agents[]` snapshots are useful for development but not enough for real agent systems.
Trace imports are required to analyze real executions.

## Decision

Support OTLP-style trace envelopes with OpenInference-style attributes as the first trace import target.

This importer should:

- reconstruct agent hierarchy
- extract prompt-bearing spans
- map retriever and tool spans into context segments
- stay conservative when exact token totals and derived external context coexist

## Consequences

- Tokn can analyze real trace exports
- trace import remains aligned with an existing ecosystem convention
- exact token totals are only used when they remain semantically honest
