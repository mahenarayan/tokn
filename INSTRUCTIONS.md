# Repository Instructions

## Purpose

Tokn is a TypeScript CLI + SDK for context visibility in LLM systems.
The repository currently focuses on read-only inspection:

- prompt/context composition
- token accounting confidence
- context-window headroom
- conversation diffs
- threshold-based CI checks
- multi-agent snapshot summaries
- Copilot instruction linting for file shape, overlap, and context economy

Do not expand the scope casually into hosted observability, policy enforcement, or runtime steering without explicitly deciding that direction.

## Repository Layout

- `src/analyzer.ts`: core normalization and analysis logic
- `src/cli.ts`: CLI entrypoint for `inspect`, `diff`, `budget`, `agent-report`, and `check`
- `src/check.ts`: threshold evaluation for `tokn check`
- `src/instructions/`: Copilot instruction discovery, parsing, and lint rules
- `src/format.ts`: human-readable report formatting
- `src/models.ts`: model context-window registry
- `src/tokenizer.ts`: local token estimation helpers
- `src/test/`: analyzer, fixture, and CLI regression coverage
- `fixtures/`: sample payloads used for testing and local smoke checks
- `fixtures/instructions/`: sample Copilot instruction repositories for lint coverage
- `fixtures/golden/`: exact expected CLI outputs
- `docs/architecture.md`: high-level architecture and boundaries
- `docs/spec-driven-development.md`: required workflow for non-trivial changes
- `docs/specs/`: implementation specs for major work
- `docs/examples/`: executable example workflows tied to checked-in fixtures
- `docs/adr/`: architecture decision records
- `.github/workflows/ci.yml`: CI workflow for `main` and pull requests
- `CONTRIBUTING.md`: contributor workflow and expectations
- `SECURITY.md`: vulnerability reporting process
- `CHANGELOG.md`: notable release history

## Local Workflow

Install dependencies:

```bash
npm install --cache .npm-cache
```

Useful commands:

```bash
npm run dev
npm run smoke
npm run check
npm run pack:check
npm test
```

Command meanings:

- `npm run dev`: quick build + one `inspect` run
- `npm run smoke`: build + all main CLI commands against fixtures
- `npm run check`: build + full test suite
- `npm run pack:check`: verify npm package contents and packaging path
- `npm test`: compile and run all automated tests

Preferred day-to-day loop:

1. make one behavioral change at a time
2. add or update a fixture first when the shape is provider-specific
3. run `npm test`
4. run `npm run smoke` if the CLI or fixtures changed
5. only then treat the change as verified

## Change Rules

- Keep the SDK read-only in behavior unless the project direction changes explicitly.
- Prefer extending the normalized context model over adding provider-specific behavior directly to CLI code.
- Keep instruction linting in the dedicated `src/instructions/` subsystem rather than folding it into `ContextReport`.
- Preserve the distinction between `exact`, `provider-reported`, `tokenizer-based`, and `heuristic` counts.
- Do not silently change CLI wording or ordering without updating golden files in `fixtures/golden/`.
- When adding a new supported payload shape, add both analyzer coverage and at least one fixture-backed test.
- When changing CLI behavior, update or add CLI integration tests.
- When changing CLI flags or output modes, verify both text and `--json` paths.
- When changing output format behavior, verify markdown output with golden files.
- When changing `tokn check`, verify both pass and fail exit-code paths.
- When changing `instructions-lint`, verify both pass and fail exit-code paths and both directory and single-file inputs.
- When changing package metadata, exports, README installation instructions, or public docs, verify the package path with `npm run pack:check`.
- When changing suggestion rules, keep one high-pressure fixture and one no-suggestion fixture in coverage.
- Do not assume provider payload shapes from memory when official docs or real fixtures can be checked.
- For provider-adapter work, prefer an official-shape fixture over an invented object.
- For example-driven docs, prefer existing fixtures and runnable commands over pasted output screenshots or invented transcripts.
- For major changes, write or update a spec under `docs/specs/` or use the spec template under `docs/templates/`.
- For major lasting decisions, add or update an ADR under `docs/adr/`.
- Treat public documentation as product surface once published.
- Do not make undocumented breaking changes to JSON output, exports, or command behavior.

## Testing Expectations

Before pushing changes, run:

```bash
npm run check
```

Always verify against the test bed, not just one manual CLI command.

For package, install, export, or other public-OSS-surface changes, also run:

```bash
npm run pack:check
```

For any non-trivial feature or architecture change:

1. write the spec
2. record the decision if it changes architecture or contract
3. implement against fixtures and tests
4. verify with `npm run check`

If you change formatting or command output:

- run the relevant CLI command locally
- update the matching file in `fixtures/golden/`
- ensure `src/test/cli.test.ts` still passes
- if markdown output changed, update the corresponding `.md` golden files too

If you change analyzer behavior:

- add or update tests in `src/test/analyzer.test.ts`
- prefer adding fixture-backed coverage in `src/test/fixtures.test.ts` for real payload shapes
- add a provider fixture under `fixtures/` when behavior depends on external request/response formats
- if the change affects a supported command path, make sure at least one CLI test covers it
- if the change affects suggestions, verify both `inspect` and `agent-report` outputs when suggestions are present
- if the change affects `check`, cover threshold evaluation, CLI exit codes, and baseline behavior
- if the change affects `instructions-lint`, cover frontmatter parsing, applyTo matching, overlap findings, and golden output

If you change provider adapters:

- verify the shape against official provider documentation first
- encode that shape in a fixture
- keep unsupported or unknown fields conservative rather than guessing precise semantics
- if an ecosystem has an active or recent security incident, prefer static fixture support and reconsider whether it should be a prioritized adapter target at all

If you change public-facing documentation or packaging behavior:

- update `README.md` if install, supported inputs, or limitations changed
- update `docs/examples/` when a new adoption path becomes important enough to demo publicly
- update `CHANGELOG.md` when the change is release-worthy
- verify `npm run pack:check`

## Current Constraints

- Model limits are local registry data, not live provider metadata.
- Token accounting is approximate unless usage is provider-reported.
- Agent support is snapshot and trace-import based; it is not a live orchestration protocol.
- CI is intentionally minimal and only runs the Node test suite.
- Tokn is public alpha software; prefer explicit scope and compatibility notes over marketing language.

## Preferred Next Work

High-value extensions should usually be one of:

- richer provider adapters
- example-driven usage docs
- stronger model metadata coverage
- more realistic fixtures from real-world conversations

Current adapter status:

- OpenAI-compatible request logs are implemented

Currently deferred:

- LiteLLM-specific adapter work pending a future security review
