# Title

Example Gallery V1

## Problem

Orqis now has enough surface area to be useful, but the repo still expects a new user to infer adoption paths from commands and fixtures.
That is too much work for a public-alpha OSS tool.

To get actual field usage, the repo needs a small example gallery that shows realistic workflows engineers can copy, run, and adapt:

- provider payload debugging
- prompt growth analysis
- dominant-segment diagnosis
- multi-agent trace inspection
- CI gating

## Goals

- add an example gallery under `docs/examples/`
- keep every example executable from the repo root
- tie each example to a checked-in fixture and a real CLI command
- cover at least five realistic adoption paths
- make the gallery discoverable from `README.md` and contributor guidance

## Non-Goals

- a full documentation site
- screenshots or generated images
- examples for every supported payload variant
- generated output snapshots embedded in docs
- changing analyzer, CLI, or JSON behavior

## Inputs

Use existing fixtures and commands wherever possible:

- `fixtures/openai-responses-request.json`
- `fixtures/anthropic-structured.json`
- `fixtures/turn-1.json`
- `fixtures/turn-2.json`
- `fixtures/suggestions-high-pressure.json`
- `fixtures/openinference-trace.json`
- `fixtures/anthropic-request.json`

Examples should assume the user is running from the repository root after:

```bash
npm install --cache .npm-cache
npm run build
```

Use `node dist/cli.js ...` in examples rather than assuming a global install or npm publication.

## Outputs

Add:

- `docs/examples/README.md`
- provider payload example
- prompt budget regression example
- oversized tool schema example
- retrieval-heavy request example
- multi-agent trace example
- CI gate example

## Internal Changes

- add `docs/examples/` as a first-class documentation area
- keep examples short, copy-pastable, and fixture-backed
- prefer explaining the investigative question for each example over restating CLI flags
- link the gallery from `README.md`
- mention the gallery in `INSTRUCTIONS.md` so future docs changes preserve the pattern

## Edge Cases And Failure Behavior

- examples must not assume npm publication or `npm link`
- examples must not present token estimates as exact counts
- if an example depends on known model metadata, it must pass `--model` explicitly when needed
- examples should reference supported fixtures only; do not invent input files that are not in the repo
- if a command can emit either text or markdown, use the mode that best matches the documented workflow

## Test Plan

- run:
  - `npm run check`
  - `npm run pack:check`
- manually verify the commands used in the examples:
  - `node dist/cli.js inspect fixtures/openai-responses-request.json --format markdown`
  - `node dist/cli.js inspect fixtures/anthropic-structured.json`
  - `node dist/cli.js diff fixtures/turn-1.json fixtures/turn-2.json --format markdown`
  - `node dist/cli.js inspect fixtures/suggestions-high-pressure.json --format markdown`
  - `node dist/cli.js agent-report fixtures/openinference-trace.json --format markdown`
  - `node dist/cli.js check fixtures/suggestions-high-pressure.json --max-total-tokens 100000 --max-usage-percent 80 --max-segment-tokens tool_schema=300 --fail-on-risk medium`

## Acceptance Criteria

- the repo contains an example gallery under `docs/examples/`
- the gallery covers at least five realistic adoption paths
- every example references a real fixture and a runnable command
- `README.md` links to the gallery
- the docs show at least three distinct adoption paths from the traction MVP

## Related ADRs

- [0003 Fixture And Golden Test Bed](/Users/raksha/Documents/Projects/probe/docs/adr/0003-fixture-and-golden-test-bed.md)
- [0006 Public Alpha OSS Contract](/Users/raksha/Documents/Projects/probe/docs/adr/0006-public-alpha-oss-contract.md)
- [0008 Threshold-Based Check Command](/Users/raksha/Documents/Projects/probe/docs/adr/0008-threshold-based-check-command.md)
- [0009 Multi-Format CLI Output](/Users/raksha/Documents/Projects/probe/docs/adr/0009-multi-format-cli-output.md)
