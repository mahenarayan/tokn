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
- `docs/spec-driven-development.md`: workflow for substantial feature and contract changes
- `docs/specs/`: active or new implementation specs for substantial work
- `docs/templates/`: spec and ADR templates
- `docs/adr/`: architecture decision records that should remain useful to future maintainers and AI agents
- `docs/examples/`: executable example workflows tied to checked-in fixtures
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

- Follow the four Karpathy-inspired coding rules: think before coding, keep the implementation simple, make surgical changes, and define verifiable done criteria.
- If a request is ambiguous, state the ambiguity and ask before choosing an interpretation that could materially change the implementation.
- Do not add speculative abstractions, features, configurability, or broad error handling that the task does not require.
- Touch only files needed for the requested change; avoid drive-by refactors, reformatting, or unrelated cleanup.
- Before changing public API surface, exported types, CLI flags, JSON report shape, package exports, or documented behavior, ask whether the change must be backward compatible.
- Keep the SDK read-only in behavior unless the project direction changes explicitly.
- Optimize for minimalism before coverage. Prefer one clear supported path over several speculative edge-case paths.
- Grow the CLI and SDK surface organically from repeated real usage, not from imagined future integrations.
- Before adding a flag, export, output field, preset, surface, or adapter, identify the existing user workflow it unlocks and why config or documentation is not enough.
- Prefer tightening existing concepts over adding parallel concepts. New names should earn their place in the public vocabulary.
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
- For substantial behavior, architecture, or contract changes, add or update a spec under `docs/specs/`.
- For major lasting decisions, add or update an ADR under `docs/adr/`.
- Do not keep stale completed specs, launch planning, or roadmap drafts in the public repo; archive those privately when they stop guiding current work.
- Treat public documentation as product surface once published.
- Do not make undocumented breaking changes to JSON output, exports, or command behavior.

## Minimalism And API Surface

Tokn should stay small enough that a maintainer can reason about the full stable surface. The goal is not to cover every agent, editor, provider, and trace shape upfront. The goal is to keep the core model precise, prove usage with fixtures, and expand only when the next step is obvious.

Default stance:

- `instructions-lint` is the primary stable product surface.
- `inspect`, `diff`, `budget`, `agent-report`, and `check` are useful diagnostics, but should not drive broad public API growth unless their usage pattern becomes clear.
- Public exports in `src/index.ts` are a compatibility commitment. Export fewer things by default; add exports only for concrete SDK use cases.
- JSON report fields are API surface. Add fields only when they are stable, documented, and useful to machines.
- CLI flags are workflow commitments. Prefer config files for policy and keep flags for common, high-value overrides.
- Rule IDs should be durable. Prefer improving evidence, severity, or docs for an existing rule over adding a near-duplicate rule.

Current complexity hotspots:

- `src/analyzer.ts`: many provider and trace shapes in one file. Keep new adapters small, fixture-driven, and conservative. If another adapter needs substantial helpers, consider a focused module before expanding this file further.
- `src/instructions/lint.ts`: discovery, parsing, policy, matching, and findings are tightly coupled. Prefer extracting cohesive helpers over adding another nested branch to the main lint path.
- `src/format.ts`: text, Markdown, GitHub, and Azure output share formatting rules. Avoid changing wording casually because golden files and user automation depend on stable output.
- `src/cli.ts`: command parsing is intentionally dependency-light but easy to bloat. Do not add top-level commands or aliases unless they simplify a frequent workflow.
- `src/types.ts` and `schemas/*.json`: these define the machine contract. Keep additions small and version-aware.

When considering a new feature, ask:

1. Can this be solved by documentation, examples, or config instead of code?
2. Does this improve the stable lint workflow, or is it diagnostics research?
3. Is there a real fixture, public example, or repeated user need behind it?
4. Does this add a new concept users must learn?
5. Can this be implemented as an internal helper before becoming public API?

If the answer is unclear, keep the change internal, document the limitation, and wait for another real use case.

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

1. write or update the relevant spec
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
