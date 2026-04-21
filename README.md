# Orqis

Instruction linting and governance for repository instruction files.

Orqis is a TypeScript CLI + SDK centered on `instructions-lint`: a read-only, preset-based linter for repository instruction files. Today it supports GitHub Copilot instruction files and `AGENTS.md`, and it helps teams catch overlap, ambiguity, stale scope patterns, surface-specific limits, and instruction-context waste before those files spread across repositories and CI.

The repository also still contains older prompt and trace diagnostics (`inspect`, `diff`, `budget`, `agent-report`, `check`). Those commands remain available, but they are currently an experimental diagnostics surface rather than the primary enterprise contract.

## Status

Orqis is in public alpha.

- stable public surface: `instructions-lint`, instruction lint report types, and deterministic text/json/markdown lint output
- stable preset: `copilot`
- supported preset: `agents-md`
- experimental diagnostics surface: `inspect`, `diff`, `budget`, `agent-report`, and `check`
- read-only only
- intended for repository governance and engineering diagnostics, not runtime enforcement

## Why Use Orqis

- lint repository instruction files for scope overlap, verbosity, file-shape issues, stale scope patterns, and surface-specific context pressure
- keep instruction guidance compact enough for long-lived enterprise usage instead of letting repository guidance sprawl silently
- generate deterministic text, JSON, and Markdown output for CI, PR comments, editor tooling, and demos
- show structured evidence for duplicates, conflicts, overlap, and budget failures instead of only prose warnings
- keep the package small and read-only while public support boundaries stay explicit

## Stable Surface

Primary command:

```bash
orqis instructions-lint ./fixtures/instructions/valid-repo
```

Common variants:

```bash
orqis instructions-lint ./fixtures/instructions/valid-repo --surface coding-agent --model gpt-4o
orqis instructions-lint ./fixtures/instructions/agents-repo --preset agents-md
orqis instructions-lint ./fixtures/instructions/invalid-repo --format markdown
orqis instructions-lint ./fixtures/instructions/invalid-repo --format json
```

Stable inputs:

- GitHub Copilot instruction repositories and files
- root or nested `AGENTS.md` files
- repository roots containing a mix of supported instruction presets

Stable SDK entry points:

```ts
import { formatInstructionLintReport, lintInstructions } from "orqis";

const report = lintInstructions("./fixtures/instructions/valid-repo");
console.log(formatInstructionLintReport(report));
```

## Experimental Diagnostics

These commands remain useful, but they are not the primary enterprise promise for the public alpha:

- `inspect`
- `diff`
- `budget`
- `agent-report`
- `check`

They normalize OpenAI-style payloads, OpenAI-compatible request logs, OpenAI Responses-style payloads, Anthropic messages, transcripts, agent snapshots, OpenInference exports, and Langfuse full traces into a common context report. This diagnostics surface may move into a separate package once usage justifies a cleaner boundary.

## Current Limits

- `instructions-lint` is preset-based today with `copilot` and `agents-md`
- model context budgets are local registry data, so model-window reporting stays conservative
- prompt and trace diagnostics are still experimental and broader in scope than the stable lint contract
- v1 is intentionally read-only

## Install For Local Use

From source:

```bash
git clone https://github.com/mahenarayan/orqis.git
cd orqis
npm install --cache .npm-cache
npm run build
npm link
```

Then:

```bash
orqis instructions-lint ./fixtures/instructions/valid-repo
```

## Commands

Stable command:

```bash
orqis instructions-lint <path> [--preset <auto|copilot|agents-md>] [--profile <lite|standard|strict>] [--surface <code-review|chat|coding-agent>] [--model <id>] [--fail-on-severity <warning|error>] [--format <text|json|markdown>]
```

Experimental diagnostics:

```bash
orqis inspect <file> [--format <text|json|markdown>]
orqis diff <before> <after> [--format <text|json|markdown>]
orqis budget <file> [--model <id>] [--format <text|json|markdown>]
orqis agent-report <file> [--format <text|json|markdown>]
orqis check <file> [--model <id>] [--max-usage-percent <n>] [--max-total-tokens <n>] [--max-segment-tokens <type=n>] [--fail-on-risk <low|medium|high>] [--baseline <file>] [--format <text|json|markdown>]
```

## Release Integrity

The public release posture is intentionally conservative:

- GitHub Actions are pinned to full commit SHAs
- CI uses least-privilege workflow permissions
- pull requests get dependency review and code scanning
- public publishing is configured for npm trusted publishing and provenance
- package verification stays part of the default verification loop

See [docs/releasing.md](/Users/raksha/Documents/Projects/probe/docs/releasing.md) for the release workflow and required repository setup.

## Development

```bash
npm install --cache .npm-cache
npm run check
npm run pack:check
```

Useful local commands:

```bash
npm run check
npm run dev
npm run pack:check
npm run smoke
```

Project docs:

- See [INSTRUCTIONS.md](/Users/raksha/Documents/Projects/probe/INSTRUCTIONS.md) for contributor and maintenance guidance.
- See [architecture.md](/Users/raksha/Documents/Projects/probe/docs/architecture.md) for the system architecture.
- See [spec-driven-development.md](/Users/raksha/Documents/Projects/probe/docs/spec-driven-development.md) for the development workflow.
- See [docs/releasing.md](/Users/raksha/Documents/Projects/probe/docs/releasing.md) for the public release and supply-chain setup.
- See [docs/examples/README.md](/Users/raksha/Documents/Projects/probe/docs/examples/README.md) for executable example workflows.
- See [docs/examples/copilot-instructions-lint.md](/Users/raksha/Documents/Projects/probe/docs/examples/copilot-instructions-lint.md) for a Copilot instructions linting workflow.
- See [docs/examples/agents-instructions-lint.md](/Users/raksha/Documents/Projects/probe/docs/examples/agents-instructions-lint.md) for an `AGENTS.md` linting workflow.
- See [docs/adr/README.md](/Users/raksha/Documents/Projects/probe/docs/adr/README.md) for architectural decisions.
- See [CONTRIBUTING.md](/Users/raksha/Documents/Projects/probe/CONTRIBUTING.md) for contribution rules.
- See [SECURITY.md](/Users/raksha/Documents/Projects/probe/SECURITY.md) for vulnerability reporting.
- See [CHANGELOG.md](/Users/raksha/Documents/Projects/probe/CHANGELOG.md) for release history.
