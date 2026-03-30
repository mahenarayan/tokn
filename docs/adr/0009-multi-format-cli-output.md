# ADR 0009: Multi-Format CLI Output

## Status

Accepted

## Context

Orqis now has three output needs:

- human terminal output
- machine-readable JSON
- shareable markdown for GitHub-native workflows

The existing `--json` flag covers only one alternative output mode.

## Decision

Add `--format <text|json|markdown>` as the primary output-mode switch while keeping `--json` as a backward-compatible alias for `--format json`.

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

- CLI output becomes more collaboration-friendly
- the CLI contract grows and should remain golden-tested
- future output modes can extend the same `--format` surface rather than adding more one-off flags
