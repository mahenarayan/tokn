# Tokn

[![CI](https://github.com/mahenarayan/tokn/actions/workflows/ci.yml/badge.svg)](https://github.com/mahenarayan/tokn/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40tokn-labs%2Ftokn?logo=npm)](https://www.npmjs.com/package/@tokn-labs/tokn)
[![License: MIT](https://img.shields.io/badge/license-MIT-97ca00)](https://github.com/mahenarayan/tokn/blob/main/LICENSE)
[![Node >=22](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://github.com/mahenarayan/tokn/blob/main/package.json)
[![Status: public alpha](https://img.shields.io/badge/status-public%20alpha-0a7ea4)](https://github.com/mahenarayan/tokn)

Keep repository AI instructions small, scoped, and reviewable.

Tokn is a deterministic TypeScript CLI and SDK for linting repository instruction files used by coding assistants and agents. It focuses on `instructions-lint`, a local analyzer for files such as `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, and `AGENTS.md`.

Instruction files are recurring model input. When they become stale, duplicated, vague, too broad, or too large, every assistant session can inherit lower-signal guidance. Tokn makes that drift visible in local development and CI.

Tokn reads files from disk, reports findings, and does not rewrite files or call AI models during lint analysis.

Tokn also publishes a harness-neutral instruction repair skill for teams that
want an assistant to apply Tokn findings intentionally. The skill lives under
`skills/tokn-instruction-repair/` and is separate from the deterministic lint
engine.

A small real-world example: a [merged Cline PR](https://github.com/cline/cline/pull/11025) updated stale agent guidance that still pointed contributors at an older storage flow after the implementation had moved to file-backed `StateManager` storage. That kind of instruction drift is easy to miss in prose review and exactly the kind of issue Tokn aims to make easier to spot.

## Quick Start

Run without installing:

```bash
npm exec --yes --package @tokn-labs/tokn -- tokn instructions-lint .
```

Or install globally:

```bash
npm install -g @tokn-labs/tokn
tokn instructions-lint /path/to/repository
```

Example finding:

```text
warning vague-instruction .github/copilot-instructions.md:12
"Follow best practices" is too generic to guide repository-specific behavior.
Suggestion: Replace it with a concrete project rule or remove it.
```

## What Tokn Checks

- duplicated or similar rules across overlapping instruction files
- conflicting guidance for the same paths or assistant surfaces
- vague directives like "follow best practices" or "write clean code"
- stale `applyTo` patterns that match no repository files
- stale backticked file, directory, package-script, and symbol references
- large instruction files and high per-target instruction load
- coverage maps showing which instruction files apply to each repository target
- platform-specific compatibility issues, including Copilot code review limits
- known external agent instruction files that are visible but not fully linted yet

Output formats include text, JSON, Markdown, GitHub Actions annotations, and Azure Pipelines logging commands.
Initial instruction drift detection is intentionally conservative: Tokn checks explicit references such as backticked paths, package scripts, and symbols, then reports mismatches against the local repository.

## Why Teams Use It

Use Tokn like a code linter for the instruction layer:

- review instruction changes before they silently affect assistant behavior
- keep global guidance small and move path-specific rules closer to the files they affect
- measure instruction load as context pressure, not just prose length
- baseline existing findings and fail CI only on new drift
- make AI instruction policy visible without asking a model to judge the repository

## Common Commands

```bash
tokn instructions-lint .
tokn instructions-lint . --format markdown
tokn instructions-lint . --format json
tokn instructions-lint . --baseline ./.tokn/instructions-baseline.json
tokn instructions-lint . --preset agents-md
tokn init . > tokn.config.json
```

Add `--verbose` when optimizing instruction budget. Verbose output includes statement-level token estimates so you can see where the load comes from.

For CI, the simplest GitHub Actions step is:

```yaml
- name: Lint repository instructions
  run: npm exec --yes --package @tokn-labs/tokn -- tokn instructions-lint . --format github --fail-on-severity warning
```

## Stable Surface

Tokn is in public alpha. The stable public surface is intentionally narrow:

- `tokn instructions-lint`
- `tokn init` and `tokn calibrate`
- stable instruction lint rule IDs
- deterministic text, JSON, Markdown, GitHub Actions, and Azure Pipelines output
- versioned instruction lint report and config schemas
- `lintInstructions` and `formatInstructionLintReport` SDK entry points

```ts
import { formatInstructionLintReport, lintInstructions } from "@tokn-labs/tokn";

const report = lintInstructions(".");
console.log(formatInstructionLintReport(report));
```

## Supported Instruction Files

| Surface | Status |
| --- | --- |
| `.github/copilot-instructions.md` | linted |
| `.github/instructions/*.instructions.md` | linted |
| `AGENTS.md` | linted with the `agents-md` preset |
| `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/*.mdc`, `.cursorrules` | detected for visibility, not fully linted yet |

## Experimental Diagnostics

Tokn also includes experimental commands for prompt, trace, budget, and context diagnostics:

```bash
tokn inspect <file>
tokn diff <before> <after>
tokn budget <file>
tokn agent-report <file>
tokn check <file>
```

These commands are useful, but they are not the primary stable public contract and may change more freely than `instructions-lint`.

## Instruction Repair Skill

The package includes `skills/tokn-instruction-repair/`, a portable prompt pack
for repairing Tokn findings in any harness. It is designed to preserve important
team guidance while making instruction files crisp, scoped, and consistent.

Use `skills/tokn-instruction-repair/skill.md` as the canonical workflow. Thin
adapters are included for Codex, Claude, Cursor, and GitHub Copilot style
instruction formats.

## Current Limits

- Token counts are local estimates for context pressure, not provider billing numbers.
- Model context data comes from Tokn's local registry, so budget reporting stays conservative.
- Drift detection is deterministic and reference-based; it does not infer whether prose describes an outdated architecture unless there is an explicit local reference to check.
- Claude, Gemini, and Cursor instruction files are detected for rollout visibility but are not fully linted yet.
- Tokn reports issues only; it does not rewrite instruction files.

## Documentation

- [Instructions lint guide](https://github.com/mahenarayan/tokn/blob/main/docs/instructions-lint.md)
- [Examples](https://github.com/mahenarayan/tokn/tree/main/docs/examples)
- [Architecture](https://github.com/mahenarayan/tokn/blob/main/docs/architecture.md)
- [Contributing](https://github.com/mahenarayan/tokn/blob/main/CONTRIBUTING.md)
- [Release integrity and publishing](https://github.com/mahenarayan/tokn/blob/main/docs/releasing.md)
- [Support](https://github.com/mahenarayan/tokn/blob/main/SUPPORT.md)
- [Security](https://github.com/mahenarayan/tokn/blob/main/SECURITY.md)
