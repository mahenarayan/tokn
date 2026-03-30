# Repository Instructions

## Purpose

Orqis is a TypeScript CLI + SDK for context visibility in LLM systems.
The repository currently focuses on read-only inspection:

- prompt/context composition
- token accounting confidence
- context-window headroom
- conversation diffs
- multi-agent snapshot summaries

Do not expand the scope casually into hosted observability, policy enforcement, or runtime steering without explicitly deciding that direction.

## Repository Layout

- `src/analyzer.ts`: core normalization and analysis logic
- `src/cli.ts`: CLI entrypoint for `inspect`, `diff`, `budget`, and `agent-report`
- `src/format.ts`: human-readable report formatting
- `src/models.ts`: model context-window registry
- `src/tokenizer.ts`: local token estimation helpers
- `src/test/`: analyzer, fixture, and CLI regression coverage
- `fixtures/`: sample payloads used for testing and local smoke checks
- `fixtures/golden/`: exact expected CLI outputs
- `docs/architecture.md`: high-level architecture and boundaries
- `docs/spec-driven-development.md`: required workflow for non-trivial changes
- `docs/adr/`: architecture decision records
- `.github/workflows/ci.yml`: CI workflow for `main` and pull requests

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
npm test
```

Command meanings:

- `npm run dev`: quick build + one `inspect` run
- `npm run smoke`: build + all main CLI commands against fixtures
- `npm run check`: build + full test suite
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
- Preserve the distinction between `exact`, `provider-reported`, `tokenizer-based`, and `heuristic` counts.
- Do not silently change CLI wording or ordering without updating golden files in `fixtures/golden/`.
- When adding a new supported payload shape, add both analyzer coverage and at least one fixture-backed test.
- When changing CLI behavior, update or add CLI integration tests.
- When changing CLI flags or output modes, verify both text and `--json` paths.
- Do not assume provider payload shapes from memory when official docs or real fixtures can be checked.
- For provider-adapter work, prefer an official-shape fixture over an invented object.
- For major changes, write or update a spec under `docs/specs/` or use the spec template under `docs/templates/`.
- For major lasting decisions, add or update an ADR under `docs/adr/`.

## Testing Expectations

Before pushing changes, run:

```bash
npm run check
```

Always verify against the test bed, not just one manual CLI command.

For any non-trivial feature or architecture change:

1. write the spec
2. record the decision if it changes architecture or contract
3. implement against fixtures and tests
4. verify with `npm run check`

If you change formatting or command output:

- run the relevant CLI command locally
- update the matching file in `fixtures/golden/`
- ensure `src/test/cli.test.ts` still passes

If you change analyzer behavior:

- add or update tests in `src/test/analyzer.test.ts`
- prefer adding fixture-backed coverage in `src/test/fixtures.test.ts` for real payload shapes
- add a provider fixture under `fixtures/` when behavior depends on external request/response formats
- if the change affects a supported command path, make sure at least one CLI test covers it

If you change provider adapters:

- verify the shape against official provider documentation first
- encode that shape in a fixture
- keep unsupported or unknown fields conservative rather than guessing precise semantics

## Current Constraints

- Model limits are local registry data, not live provider metadata.
- Token accounting is approximate unless usage is provider-reported.
- Agent support is snapshot-based; it is not a live orchestration protocol.
- CI is intentionally minimal and only runs the Node test suite.

## Preferred Next Work

High-value extensions should usually be one of:

- richer provider adapters
- OpenTelemetry/OpenInference trace import
- better context-part segmentation
- stronger model metadata coverage
- more realistic fixtures from real-world conversations
