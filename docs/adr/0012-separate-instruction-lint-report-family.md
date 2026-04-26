# ADR 0012: Separate Instruction Lint Report Family

## Status

Accepted

## Context

Tokn originally centered on prompt and trace analysis through `ContextSegment` and `ContextReport`.
The Copilot instructions linter introduces a different source model:

- Markdown files instead of provider payloads
- frontmatter and `applyTo` scope metadata instead of prompt roles
- cross-file overlap and repository file matching instead of token-segment composition

Trying to force instruction linting into `ContextReport` would blur architectural boundaries and make the JSON contract harder to reason about.

## Decision

Introduce a second report family for instruction linting:

- `InstructionFileReport`
- `InstructionLintReport`

Keep implementation in `src/instructions/` and keep `ContextReport` unchanged.
The CLI and SDK may expose both report families, but the underlying analysis pipelines remain separate.

## Consequences

- instruction lint rules can evolve without distorting prompt-analysis types
- formatting and JSON output can stay deterministic for both subsystems
- future `AGENTS.md` support can reuse the instruction-lint subsystem instead of the payload analyzer
- Tokn now has two public report families, so docs and tests must treat both as stable product surface
