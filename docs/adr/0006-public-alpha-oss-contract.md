# ADR 0006: Public Alpha OSS Contract

## Status

Accepted

## Context

Tokn is moving from an internal engineering project toward public open source usage.
That changes the bar for clarity and maintenance:

- users need explicit project boundaries
- contributors need a documented workflow
- package consumers need repository metadata and packaging verification

## Decision

Adopt a public alpha contract with these rules:

- keep the product focused on analysis, not file mutation
- treat JSON output and SDK types as the primary contract for machines
- keep CLI text output tested and reviewed, but intended first for people
- require specs for substantial public surface changes
- require package verification in CI in addition to test verification

## Consequences

- public docs become part of the product surface
- release and packaging hygiene matter alongside test coverage
- contributors get a clear process without prematurely promising 1.0 stability
