# Title

Check Command V1

## Problem

Tokn can inspect and explain context, but engineers still need a CI path to turn that analysis into a gate.
Without that, Tokn remains diagnostic but not operational.

## Goals

- add a `check` command for threshold-based validation
- keep the command deterministic and avoid file rewrites
- support both text and JSON output
- provide non-zero exit codes on threshold violations
- allow an optional baseline file for diff context

## Non-Goals

- mutating prompts or traces
- automatic optimization
- policy enforcement beyond local CLI exit behavior
- probabilistic scoring
- baseline-relative threshold semantics in v1

## Inputs

`tokn check <file>` should accept a JSON input payload that Tokn can analyze.

Supported flags in v1:

- `--model <id>`
- `--max-usage-percent <n>`
- `--max-total-tokens <n>`
- `--max-segment-tokens <type=n>`
- `--fail-on-risk <low|medium|high>`
- `--baseline <report-or-input-file>`
- `--json`

`--max-segment-tokens` may be repeated.
`--baseline` may point to either:

- a raw supported input payload
- a previously generated `ContextReport` JSON document

## Outputs

Add a structured `CheckResult` object with:

- `passed`
- `exitCode`
- `thresholds`
- `violations`
- `warnings`
- `report`
- optional `baseline` context including a diff summary

Human-readable output should include:

- pass/fail status
- current usage summary
- configured thresholds
- zero or more violations
- optional baseline comparison summary
- warnings when thresholds cannot be evaluated

## Internal Changes

Implement threshold evaluation in a dedicated module rather than in the analyzer or formatter.

Threshold semantics in v1:

- `max-total-tokens`: compare against current report total
- `max-usage-percent`: compare against current budget usage percent
- `max-segment-tokens`: compare against aggregate token usage for the given segment type
- `fail-on-risk`: fail when current risk is at or above the requested threshold
- `baseline`: adds diff context only in v1; it does not change threshold semantics

Exit behavior:

- `0` when checks pass
- `2` when one or more threshold violations occur
- `1` for usage errors or runtime failures

## Edge Cases And Failure Behavior

- If no threshold flags are provided, `check` should fail with a usage error.
- If `max-usage-percent` or `fail-on-risk` is requested but model budget data is unknown, emit explicit warnings instead of guessing.
- If `--max-segment-tokens` names an unknown segment type, fail with a usage error.
- If `--model` is used with a stored `ContextReport` file, fail with a usage error because the report budget has already been computed.
- If `--baseline` is a stored report, use it directly.

## Test Plan

- add unit tests for threshold evaluation
- add CLI tests for pass/fail exit codes
- add CLI tests for JSON output
- add CLI tests for baseline summaries
- add failure path tests for unknown model and invalid threshold configuration
- add golden files for passing and failing text output
- run:
  - `npm run check`
  - `npm run pack:check`

## Acceptance Criteria

- `tokn check` can fail on total tokens, usage percent, segment totals, and budget risk
- text output is deterministic and covered by golden tests
- JSON output is easy for scripts and CI to consume
- threshold violations return exit code `2`
- invalid invocation returns exit code `1`
- baseline input enriches output with diff context

## Related ADRs

- [0001 File Mutation Boundary](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0001-read-only-analysis-boundary.md)
- [0004 Structured CLI Contract](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0004-machine-readable-cli-contract.md)
- [0006 Public Alpha OSS Contract](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0006-public-alpha-oss-contract.md)
- [0007 Suggestions Embedded In Context Reports](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0007-suggestions-in-context-report.md)
