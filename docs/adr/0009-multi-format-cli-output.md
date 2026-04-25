# ADR 0009: Multi Format CLI Output

## Status

Accepted

## Context

Tokn now has three output needs:

- human terminal output
- structured JSON
- shareable markdown for GitHub workflows

The existing `--json` flag covers only one alternative output mode.

## Decision

Add `--format <text|json|markdown>` as the primary output mode switch while keeping `--json` as a compatibility alias for `--format json`.

Rules:

- default remains `text`
- `--json` is accepted for compatibility
- conflicting `--json` and `--format markdown` is a usage error

Markdown is added first for:

- `inspect`
- `diff`
- `budget`
- `agent-report`

## Consequences

- CLI output becomes easier to use in collaboration
- the CLI contract grows and should remain covered by golden tests
- future output modes can extend the same `--format` surface rather than adding separate flags
