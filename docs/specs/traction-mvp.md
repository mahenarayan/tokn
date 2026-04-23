# Title

Traction MVP

## Problem

Tokn has a credible technical core, but that alone will not create OSS traction.
To get real usage in the field, Tokn needs a small set of capabilities that solve an obvious day-one problem for engineers:

- explain why context usage is bad
- fail fast in CI when context regresses
- ingest a few real ecosystem exports without hand-normalized snapshots
- produce reports that are easy to share in issues and pull requests

Without that, Tokn risks becoming an interesting analyzer that engineers evaluate once and do not adopt.

## Goals

- make Tokn immediately useful for debugging one failing prompt or agent run
- make Tokn useful in CI and code review, not only on a laptop
- make Tokn work on a few real-world exported inputs that people already have
- keep the scope read-only and local-first
- defer npm publishing and release automation until after the MVP proves value

## Non-Goals

- hosted dashboards
- proxy or gateway behavior
- prompt management
- eval or red-team platform features
- runtime steering or policy enforcement
- full ecosystem coverage in one pass
- npm publishing and release automation before MVP validation

## Inputs

MVP work should support these classes of inputs:

- current supported payloads and traces
- at least two additional real-world ecosystem export shapes beyond the current fixtures
- baseline and candidate reports for CI regression checks

Candidate ecosystems should be chosen by practical adoption value, for example:

- Langfuse exports
- OpenInference/OpenTelemetry traces emitted by agent frameworks
- common OpenAI-compatible runtime payloads and request logs
- editor or runtime exports if they can be verified with real fixtures

Deferred for now:

- LiteLLM-specific adapter work is deferred as of March 31, 2026 following the March 24, 2026 supply-chain incident, and should not be treated as the next adapter milestone.

## Outputs

The MVP should add these user-facing outputs:

- suggestions embedded in `inspect` and `agent-report`
- a new `check` command with machine-friendly exit behavior
- markdown report output for sharing in PRs and issues
- example-driven documentation showing realistic use cases

## Internal Changes

### 1. Suggestion Engine

Add deterministic, read-only recommendations based on:

- tool schema size
- assistant history growth
- retrieval context size
- provider overhead dominance
- high budget pressure
- repeated large segments across turns

Suggestions must explain the cause clearly and avoid pretending to mutate or optimize automatically.

### 2. CI Check Command

Add:

- `tokn check <file>`

First-pass flags should include:

- `--model <id>`
- `--max-usage-percent <n>`
- `--max-total-tokens <n>`
- `--max-segment-tokens <type=n>`
- `--fail-on-risk <low|medium|high>`
- `--baseline <report-or-input-file>`

The command should:

- emit human-readable output by default
- support `--json`
- exit non-zero when thresholds are violated

### 3. Real Export Adapters

Add a small number of high-value adapters validated by real fixtures.
The target is not breadth; it is reducing the gap between “interesting CLI” and “works on my stack.”

Adapter work should prefer:

- ecosystem formats that users already export or persist
- reuse of OpenInference/OpenTelemetry where possible
- conservative degradation when fields are missing or ambiguous

### 4. Shareable Reports

Add:

- `--format markdown` for `inspect`, `diff`, `budget`, and `agent-report`

Markdown output should be optimized for:

- GitHub issues
- pull request comments
- incident notes
- internal docs

### 5. Example Gallery

Add practical examples and redacted sample inputs for:

- prompt budget regression
- oversized tool schema
- retrieval-heavy request
- failing multi-agent trace
- CI gate usage

## Edge Cases And Failure Behavior

- If a threshold references an unknown model, `check` should fail conservatively only when the requested threshold can still be evaluated from available data; otherwise it should emit an explicit unknown-model warning.
- If an adapter sees an unrecognized export shape, Tokn should fail with actionable diagnostics rather than silently classifying everything as `user`.
- Suggestions must tolerate partial reports and unknown token confidence.
- Markdown output must not invent precision that the underlying report does not have.
- CI exit behavior must stay deterministic even when estimates are heuristic.

## Test Plan

- add analyzer tests for suggestion rules
- add fixture-backed tests for real export adapters
- add CLI tests for `check`
- add CLI tests for markdown output
- add golden files for any new text or markdown reports
- add failure-path tests for unknown model and threshold handling
- run:
  - `npm run check`
  - `npm run pack:check`

## Acceptance Criteria

- `inspect` and `agent-report` can surface actionable suggestions on high-pressure fixtures
- `tokn check` can fail CI on token, usage, and risk thresholds
- Tokn supports at least two additional real-world export shapes with fixture-backed coverage
- markdown reports are usable in GitHub-native workflows
- docs show at least three realistic adoption paths
- npm publishing remains deferred until these behaviors exist and are validated

## Related ADRs

- [0001 Read-Only Analysis Boundary](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0001-read-only-analysis-boundary.md)
- [0003 Fixture And Golden Test Bed](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0003-fixture-and-golden-test-bed.md)
- [0004 Machine-Readable CLI Contract](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0004-machine-readable-cli-contract.md)
- [0006 Public Alpha OSS Contract](https://github.com/mahenarayan/tokn/blob/main/docs/adr/0006-public-alpha-oss-contract.md)
