# Title

Markdown Output V1

## Problem

Orqis output is currently optimized for terminals and JSON consumers.
That leaves a gap for the main collaboration surfaces engineers actually use:

- GitHub issues
- pull request comments
- incident notes
- internal docs

Text output works locally but is awkward to paste into those systems.

## Goals

- add shareable markdown output for the main report-style commands
- preserve the existing text output as the default
- keep `--json` backward compatible
- make markdown output deterministic and golden-tested

## Non-Goals

- HTML output
- rich styling beyond plain markdown
- provider-specific markdown layout
- changing the analyzer or JSON report semantics

## Inputs

Support:

- `orqis inspect <file> --format markdown`
- `orqis diff <before> <after> --format markdown`
- `orqis budget <file> --format markdown`
- `orqis agent-report <file> --format markdown`

Compatibility rules:

- `--json` remains supported
- `--format json` should behave the same as `--json`
- if both `--json` and `--format markdown` are supplied, treat that as a usage error

## Outputs

Add a markdown renderer for:

- `ContextReport`
- `DiffReport`
- `BudgetSummary`
- `AgentSummary`

Markdown should use simple structures that render well on GitHub:

- headings
- bullets
- tables where compact and readable

## Internal Changes

- add CLI output-mode parsing for `text`, `json`, and `markdown`
- keep formatting logic in `src/format.ts`
- do not duplicate analyzer logic in markdown formatters
- reuse existing normalized report objects

## Edge Cases And Failure Behavior

- If a report has no suggestions or warnings, omit those sections.
- If markdown and JSON flags conflict, fail with a usage error.
- If a table would be empty, render a short markdown bullet instead of an empty table.
- Markdown output must preserve the same semantic ordering as the text output where possible.

## Test Plan

- add CLI tests for markdown output on `inspect`, `diff`, `budget`, and `agent-report`
- add golden markdown files for each command
- add a CLI test for conflicting `--json` and `--format markdown`
- run:
  - `npm run check`
  - `npm run pack:check`

## Acceptance Criteria

- all four main report commands support `--format markdown`
- markdown output is deterministic and golden-tested
- `--json` remains backward compatible
- conflicting output-mode flags fail clearly

## Related ADRs

- [0004 Machine-Readable CLI Contract](/Users/raksha/Documents/Projects/probe/docs/adr/0004-machine-readable-cli-contract.md)
- [0006 Public Alpha OSS Contract](/Users/raksha/Documents/Projects/probe/docs/adr/0006-public-alpha-oss-contract.md)
- [0008 Threshold-Based Check Command](/Users/raksha/Documents/Projects/probe/docs/adr/0008-threshold-based-check-command.md)
