# ADR 0002: Normalized Context Report Model

## Status

Accepted

## Context

Provider payloads and trace formats differ significantly.
Without a shared internal model, the codebase would accumulate provider-specific branching in the CLI and formatter layers.

## Decision

Use `ContextSegment` and `ContextReport` as the canonical internal model.

All adapters must normalize into this model before presentation.

## Consequences

- analyzer remains the core semantic layer
- CLI and SDK can share the same outputs
- new adapters are cheaper to add
- changes to `src/types.ts` are architectural and require stronger review
