# Title

Instructions Lint V1

## Problem

Orqis can inspect prompt occupancy and CI-check token budgets, but it cannot yet lint GitHub Copilot instruction files themselves.
Teams need a deterministic way to catch:

- invalid instruction file layout
- stale or over-broad `applyTo` scopes
- duplicate or conflicting rules across overlapping files
- verbose wording that wastes always-on context

## Goals

- add `orqis instructions-lint <path>`
- support repository-wide and path-specific GitHub Copilot instruction files
- keep the product read-only and deterministic
- support text, JSON, and markdown output
- expose a stable SDK report shape for editor or CI tooling

## Non-Goals

- rewriting or autofixing instruction files
- composing instruction files across vendors
- supporting `AGENTS.md` as a CLI input in v1
- embedding a generic prose linter as the primary engine

## Inputs

`instructions-lint` accepts either:

- a repository root or directory, which triggers discovery of:
  - `.github/copilot-instructions.md`
  - `.github/instructions/**/*.instructions.md`
- a single file path, which is linted directly

Supported flags in v1:

- `--profile <lite|standard|strict>`
- `--surface <code-review|chat|coding-agent>`
- `--model <id>`
- `--fail-on-severity <warning|error>`
- `--format <text|json|markdown>`
- `--json`

## Outputs

Add an `InstructionLintReport` object with:

- `profile`
- `surface`
- optional `model`
- optional `contextWindow`
- optional `maxApplicableContextPercent`
- `passed`
- `exitCode`
- `failOnSeverity`
- `stats`
- `files`
- `findings`
- `warnings`

Each `InstructionFileReport` includes:

- `file`
- `kind`
- optional `applyTo`
- optional `excludeAgents`
- `appliesToSurface`
- `chars`
- `words`
- `estimatedTokens`
- `statementCount`
- optional `matchedFileCount`
- `findings`

Each finding includes:

- `ruleId`
- `severity`
- `message`
- `file`
- `line`
- optional `suggestion`
- optional `evidence`

Human-readable output should include:

- pass/fail status
- selected profile, surface, and fail threshold
- estimated token totals and max applicable token load
- per-file summary
- ordered findings
- structured evidence for overlap, scope, and budget findings
- warnings

## Internal Changes

- add a dedicated instruction-lint subsystem under `src/instructions/`
- keep `ContextReport` unchanged and introduce a separate instruction-lint report family
- parse path-specific frontmatter and require `applyTo`
- honor `excludeAgent` for surface-specific evaluation
- resolve `applyTo` against real repository files using glob matching
- add deterministic rule packs for:
  - file-path validity
  - frontmatter and `applyTo`
  - code-review-only 4000-character cap
  - order-dependent wording
  - compactness budgets by profile
  - estimated token budgets by file kind
  - max applicable token load for a single target file
  - narrative and vague phrasing
  - oversized code examples
  - duplicate, similar, and conflicting cross-file statements

Profile budgets in v1:

- `lite`
  - repo-wide chars: 2500
  - path-specific chars: 1500
  - repo-wide estimated tokens: 600
  - path-specific estimated tokens: 375
  - max applicable tokens per target: 900
  - statements per file: 20
  - words per statement: 50
- `standard`
  - repo-wide chars: 1500
  - path-specific chars: 900
  - repo-wide estimated tokens: 375
  - path-specific estimated tokens: 225
  - max applicable tokens per target: 600
  - statements per file: 12
  - words per statement: 30
- `strict`
  - repo-wide chars: 900
  - path-specific chars: 600
  - repo-wide estimated tokens: 225
  - path-specific estimated tokens: 150
  - max applicable tokens per target: 350
  - statements per file: 8
  - words per statement: 20

## Edge Cases And Failure Behavior

- unsupported file paths should produce an error finding
- `.instructions.md` files without valid frontmatter or `applyTo` should produce an error finding
- `applyTo: "**"` should error when a repository-wide file exists
- `excludeAgent` should suppress surface-specific findings when the file is inactive for the selected surface
- no repository matches for `applyTo` should produce a warning, not a hard error
- if no instruction files are found under a directory, return an empty passing report with a warning
- `0` means no findings at or above the selected fail severity
- `2` means one or more findings at or above the selected fail severity
- `1` means usage or runtime failure

## Test Plan

- unit tests for discovery, frontmatter parsing, scope resolution, duplicate detection, and conflict heuristics
- fixture-backed tests for:
  - valid repository
  - invalid filename
  - missing frontmatter
  - stale `applyTo`
  - code-review-only 4000-character limit
  - `excludeAgent` handling
  - max applicable token load
  - duplicate and conflicting statements
  - profile-sensitive verbosity
- CLI tests for:
  - pass/fail exit codes
  - text/json/markdown output
  - directory discovery
  - single-file lint
  - `--surface`
  - `--model`
  - `--fail-on-severity`
- golden files for passing and failing text and markdown output
- run:
  - `npm test`
  - `npm run smoke`
  - `npm run pack:check`

## Acceptance Criteria

- `orqis instructions-lint` works on repo roots and individual files
- output is deterministic across text, markdown, and JSON modes
- cross-file overlap is based on actual repository file matches
- profile budgets apply to both chars and estimated tokens
- the 4000-character cap is enforced only for `code-review`
- SDK exports expose the new report family

## Related ADRs

- [0004 Machine-Readable CLI Contract](/Users/raksha/Documents/Projects/probe/docs/adr/0004-machine-readable-cli-contract.md)
- [0009 Multi-Format CLI Output](/Users/raksha/Documents/Projects/probe/docs/adr/0009-multi-format-cli-output.md)
- [0012 Separate Instruction Lint Report Family](/Users/raksha/Documents/Projects/probe/docs/adr/0012-separate-instruction-lint-report-family.md)
