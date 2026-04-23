# Tokn

[![CI](https://github.com/mahenarayan/tokn/actions/workflows/ci.yml/badge.svg)](https://github.com/mahenarayan/tokn/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40tokn-labs%2Ftokn?logo=npm)](https://www.npmjs.com/package/@tokn-labs/tokn)
[![License](https://img.shields.io/github/license/mahenarayan/tokn)](https://github.com/mahenarayan/tokn/blob/main/LICENSE)
[![Node >=22](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://github.com/mahenarayan/tokn/blob/main/package.json)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/mahenarayan/tokn/badge)](https://scorecard.dev/viewer/?uri=github.com/mahenarayan/tokn)
[![Status: public alpha](https://img.shields.io/badge/status-public%20alpha-0a7ea4)](https://github.com/mahenarayan/tokn)

Read-only instruction linting and governance for repository instruction files.

Tokn is a TypeScript CLI + SDK centered on `instructions-lint`: a read-only, preset-based linter for repository instruction files. It helps teams catch overlap, ambiguity, stale scope patterns, surface-specific limits, and instruction-context waste before those files spread across repositories and CI.
It is named for the token, the smallest unit a model actually consumes, with the missing `e` reflecting the tool's bias toward compression and signal.
The npm package is published as `@tokn-labs/tokn`, while the installed CLI command remains `tokn`.

The repository also still contains older prompt and trace diagnostics (`inspect`, `diff`, `budget`, `agent-report`, `check`). Those commands remain available, but they are currently an experimental diagnostics surface rather than the primary enterprise contract.

## Quick Start

Install from npm:

```bash
npm install -g @tokn-labs/tokn
tokn instructions-lint /path/to/repository
```

From source:

```bash
git clone https://github.com/mahenarayan/tokn.git
cd tokn
npm install --cache .npm-cache
npm run build
npm link
tokn instructions-lint /path/to/repository
```

Example:

```bash
tokn instructions-lint ./fixtures/instructions/valid-repo
```

## What Tokn Does

- discovers repository instruction files using supported presets
- lints overlap, duplication, vague wording, stale scope patterns, and surface-specific limits
- estimates instruction-context pressure with compactness and token-budget checks
- emits deterministic text, JSON, and Markdown output for CI, PR comments, editor tooling, and demos
- stays read-only so it can fit conservative enterprise workflows

## Status

Tokn is in public alpha.

- stable public surface: `instructions-lint`, instruction lint report types, and deterministic text/json/markdown lint output
- stable preset: `copilot`
- supported preset: `agents-md`
- experimental diagnostics surface: `inspect`, `diff`, `budget`, `agent-report`, and `check`
- read-only only
- intended for repository governance and engineering diagnostics, not runtime enforcement

## Stable Surface

Primary command:

```bash
tokn instructions-lint ./fixtures/instructions/valid-repo
```

Common variants:

```bash
tokn instructions-lint ./fixtures/instructions/valid-repo --surface coding-agent --model gpt-4o
tokn instructions-lint ./fixtures/instructions/agents-repo --preset agents-md
tokn instructions-lint ./fixtures/instructions/invalid-repo --format markdown
tokn instructions-lint ./fixtures/instructions/invalid-repo --format json
```

Stable inputs:

- GitHub Copilot instruction repositories and files
- root or nested `AGENTS.md` files
- repository roots containing a mix of supported instruction presets

Stable SDK entry points:

```ts
import { formatInstructionLintReport, lintInstructions } from "@tokn-labs/tokn";

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

## Commands

Stable command:

```bash
tokn instructions-lint <path> [--preset <auto|copilot|agents-md>] [--profile <lite|standard|strict>] [--surface <code-review|chat|coding-agent>] [--model <id>] [--fail-on-severity <warning|error>] [--format <text|json|markdown>]
```

Experimental diagnostics:

```bash
tokn inspect <file> [--format <text|json|markdown>]
tokn diff <before> <after> [--format <text|json|markdown>]
tokn budget <file> [--model <id>] [--format <text|json|markdown>]
tokn agent-report <file> [--format <text|json|markdown>]
tokn check <file> [--model <id>] [--max-usage-percent <n>] [--max-total-tokens <n>] [--max-segment-tokens <type=n>] [--fail-on-risk <low|medium|high>] [--baseline <file>] [--format <text|json|markdown>]
```

## Release Integrity

The public release posture is intentionally conservative:

- GitHub Actions are pinned to full commit SHAs
- CI uses least-privilege workflow permissions
- pull requests get dependency review and code scanning
- public publishing is configured for npm trusted publishing and provenance
- package verification stays part of the default verification loop

See [docs/releasing.md](https://github.com/mahenarayan/tokn/blob/main/docs/releasing.md) for the release workflow and required repository setup.
See [docs/public-launch-checklist.md](https://github.com/mahenarayan/tokn/blob/main/docs/public-launch-checklist.md) for the one-time public OSS launch checklist.
The npm package itself is intentionally lean: runtime artifacts and public support documents ship, while compiled tests and internal ADR/spec docs stay in the repository only.

## Support And Governance

- usage and support routing: [SUPPORT.md](https://github.com/mahenarayan/tokn/blob/main/SUPPORT.md)
- vulnerability reporting: [SECURITY.md](https://github.com/mahenarayan/tokn/blob/main/SECURITY.md)
- contribution rules: [CONTRIBUTING.md](https://github.com/mahenarayan/tokn/blob/main/CONTRIBUTING.md)
- maintainer and decision boundaries: [GOVERNANCE.md](https://github.com/mahenarayan/tokn/blob/main/GOVERNANCE.md)

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

- See [INSTRUCTIONS.md](https://github.com/mahenarayan/tokn/blob/main/INSTRUCTIONS.md) for contributor and maintenance guidance.
- See [architecture.md](https://github.com/mahenarayan/tokn/blob/main/docs/architecture.md) for the system architecture.
- See [spec-driven-development.md](https://github.com/mahenarayan/tokn/blob/main/docs/spec-driven-development.md) for the development workflow.
- See [docs/releasing.md](https://github.com/mahenarayan/tokn/blob/main/docs/releasing.md) for the public release and supply-chain setup.
- See [docs/examples/README.md](https://github.com/mahenarayan/tokn/blob/main/docs/examples/README.md) for executable example workflows.
- See [docs/examples/copilot-instructions-lint.md](https://github.com/mahenarayan/tokn/blob/main/docs/examples/copilot-instructions-lint.md) for a Copilot instructions linting workflow.
- See [docs/examples/agents-instructions-lint.md](https://github.com/mahenarayan/tokn/blob/main/docs/examples/agents-instructions-lint.md) for an `AGENTS.md` linting workflow.
- See [docs/adr/README.md](https://github.com/mahenarayan/tokn/blob/main/docs/adr/README.md) for architectural decisions.
- See [CONTRIBUTING.md](https://github.com/mahenarayan/tokn/blob/main/CONTRIBUTING.md) for contribution rules.
- See [SECURITY.md](https://github.com/mahenarayan/tokn/blob/main/SECURITY.md) for vulnerability reporting.
- See [SUPPORT.md](https://github.com/mahenarayan/tokn/blob/main/SUPPORT.md) for support routing.
- See [GOVERNANCE.md](https://github.com/mahenarayan/tokn/blob/main/GOVERNANCE.md) for maintainer and decision boundaries.
- See [CHANGELOG.md](https://github.com/mahenarayan/tokn/blob/main/CHANGELOG.md) for release history.
