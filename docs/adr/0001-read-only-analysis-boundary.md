# ADR 0001: Read-Only Analysis Boundary

## Status

Accepted

## Context

Orqis analyzes LLM context, token usage, and agent state.
It would be easy for the project to drift into runtime control, enforcement, or hosted observability.

## Decision

Keep Orqis read-only by default.

It may inspect, summarize, estimate, and recommend.
It should not enforce policies, mutate upstream conversations, or act as a mandatory gateway unless that scope is explicitly changed later.

## Consequences

- CLI and SDK stay diagnostic
- architecture stays simpler
- trust model is easier for engineers to adopt
- suggestion features remain advisory rather than prescriptive
