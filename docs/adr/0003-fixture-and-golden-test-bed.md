# ADR 0003: Fixture And Golden Test Bed

## Status

Accepted

## Context

Orqis is sensitive to:

- external payload schema drift
- token-accounting regressions
- CLI wording changes
- trace import changes

Unit tests alone do not protect those surfaces well enough.

## Decision

Use a layered test bed:

- analyzer tests for focused logic
- fixture-backed tests for realistic payload shapes
- CLI integration tests for command paths
- golden tests for stable text output

## Consequences

- output changes are deliberate
- provider adapter work must be backed by fixtures
- CLI behavior becomes a tested contract rather than an incidental side effect
