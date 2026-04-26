# ADR 0008: Threshold Based Check Command

## Status

Accepted

## Context

Tokn needs a CI surface that turns report data into a pass/fail outcome.
The key design question is where this logic belongs.

## Decision

Implement `tokn check` as a dedicated threshold evaluation module layered on top of `ContextReport`.

The analyzer remains responsible for normalization and report construction.
The check module consumes those reports and evaluates deterministic thresholds.

Use these exit codes:

- `0` for pass
- `2` for threshold violations
- `1` for invalid usage or runtime errors

In v1, baseline input provides diff context but does not alter threshold semantics.

## Consequences

- the analyzer stays focused on normalization
- CI integration becomes straightforward
- the check command is operational without expanding Tokn into enforcement middleware
