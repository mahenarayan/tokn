# Tokn

[![CI](https://github.com/mahenarayan/tokn/actions/workflows/ci.yml/badge.svg)](https://github.com/mahenarayan/tokn/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40tokn-labs%2Ftokn?logo=npm)](https://www.npmjs.com/package/@tokn-labs/tokn)
[![License: MIT](https://img.shields.io/badge/license-MIT-97ca00)](https://github.com/mahenarayan/tokn/blob/main/LICENSE)
[![Node >=22](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://github.com/mahenarayan/tokn/blob/main/package.json)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/mahenarayan/tokn/badge)](https://scorecard.dev/viewer/?uri=github.com/mahenarayan/tokn)
[![Status: public alpha](https://img.shields.io/badge/status-public%20alpha-0a7ea4)](https://github.com/mahenarayan/tokn)

Instruction linting and governance for repository instruction files.

Tokn is a TypeScript CLI + SDK centered on `instructions-lint`: a local linter for repository instruction files such as `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, and `AGENTS.md`. Its primary purpose is context and agent engineering for AI-assisted development. It helps teams catch duplicated guidance, conflicting rules, vague wording, stale scope patterns, limits that vary by surface, and wasted instruction context before those files spread across repositories and CI. Once installed, the core CLI runs on local files without network access during analysis.
The npm package is published as `@tokn-labs/tokn`, while the installed CLI command remains `tokn`.

Tokn is also working on advanced diagnostics for prompts, traces, and context composition through `inspect`, `diff`, `budget`, `agent-report`, and `check`. That diagnostics surface is experimental today and is not part of the primary public contract.

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
- lints overlap, duplication, vague wording, stale scope patterns, and limits that vary by surface
- estimates instruction context pressure with compactness and token budget checks
- emits deterministic text, JSON, Markdown, GitHub Actions, and Azure Pipelines output for CI, PR comments, editor tooling, and demos
- runs locally on repository files without requiring network access during analysis
- does not modify files, so it can fit conservative enterprise workflows

## What Instruction Linting Means

Instruction linting means checking repository instruction files the same way a code linter checks source files.

Tokn reads the instruction files that shape agent behavior and flags problems such as:

- duplicate rules repeated across overlapping files
- conflicting instructions for the same paths or surfaces
- vague directives like "follow best practices"
- stale `applyTo` patterns that match nothing
- instruction bundles that are larger or noisier than they need to be
- known external agent files such as `CLAUDE.md` and Cursor rules that are present but not linted yet

The goal is not to generate prompts. The goal is to keep repository instruction sets precise, compact, and governable.

Code review is only one supported surface. Tokn also models chat and coding-agent surfaces because the broader goal is to govern recurring model context for assistants and agents.

Reference documentation for the stable lint surface lives in [docs/instructions-lint.md](https://github.com/mahenarayan/tokn/blob/main/docs/instructions-lint.md).

## Status

Tokn is in public alpha.

- stable public surface: `instructions-lint`, instruction lint report types, stable rule IDs, and deterministic text/json/markdown/github/azure lint output
- stable preset: `copilot`
- supported preset: `agents-md`
- experimental diagnostics surface: `inspect`, `diff`, `budget`, `agent-report`, and `check`
- file analysis only; Tokn does not rewrite instruction files
- intended for repository governance and engineering diagnostics, not runtime enforcement

## Stable Surface

Primary command:

```bash
tokn instructions-lint ./fixtures/instructions/valid-repo
```

Common variants:

```bash
tokn instructions-lint ./fixtures/instructions/valid-repo --config ./tokn.config.json
tokn instructions-lint ./fixtures/instructions/invalid-repo --baseline ./tokn-baseline.json
tokn instructions-lint ./fixtures/instructions/valid-repo --surface coding-agent --model gpt-4o
tokn instructions-lint ./fixtures/instructions/agents-repo --preset agents-md
tokn instructions-lint ./fixtures/instructions/invalid-repo --format markdown
tokn instructions-lint ./fixtures/instructions/invalid-repo --format json
tokn instructions-lint ./fixtures/instructions/invalid-repo --format github
tokn instructions-lint ./fixtures/instructions/invalid-repo --format azure
```

Stable inputs:

- GitHub Copilot instruction repositories and files
- root or nested `AGENTS.md` files
- repository roots containing a mix of supported instruction presets
- visibility-only detection for known external agent surfaces such as `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/*.mdc`, and `.cursorrules`

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

They normalize OpenAI style payloads, OpenAI compatible request logs, OpenAI Responses style payloads, Anthropic messages, transcripts, agent snapshots, OpenInference exports, and Langfuse full traces into a common context report. This diagnostics surface may move into a separate package once usage justifies a cleaner boundary.

## Current Limits

- `instructions-lint` uses explicit presets today with `copilot` and `agents-md`
- Claude, Gemini, and Cursor files are detected for visibility but are not fully linted yet
- model context budgets are local registry data, so model context reporting stays conservative
- prompt and trace diagnostics are still experimental and broader in scope than the stable lint contract
- v1 intentionally avoids file rewrites

## Commands

Stable command:

```bash
tokn instructions-lint <path> [--config <file>] [--baseline <file>] [--ignore <glob>] [--preset <auto|copilot|agents-md>] [--profile <lite|standard|strict>] [--surface <code-review|chat|coding-agent>] [--model <id>] [--fail-on-severity <off|warning|error>] [--format <text|json|markdown|github|azure>]
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
- CI uses least privilege workflow permissions
- pull requests get dependency review and code scanning
- public publishing is configured for npm trusted publishing and provenance
- package verification stays part of the default verification loop

See [docs/releasing.md](https://github.com/mahenarayan/tokn/blob/main/docs/releasing.md) for the release workflow and required repository setup.
The npm package itself is intentionally lean: runtime artifacts and public support documents ship, while compiled tests and internal planning documents stay outside the package.

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

Maintainer and agent context:

- [docs/architecture.md](https://github.com/mahenarayan/tokn/blob/main/docs/architecture.md)
- [docs/spec-driven-development.md](https://github.com/mahenarayan/tokn/blob/main/docs/spec-driven-development.md)
- [docs/adr/README.md](https://github.com/mahenarayan/tokn/blob/main/docs/adr/README.md)

## Why Tokn

Tokn is named for the token, the smallest unit a model actually consumes. The missing `e` reflects the project's bias toward compression, signal, and instruction sets that stay small enough to remain useful.
