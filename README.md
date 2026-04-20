# Orqis

Context visibility for LLMs and agents.

Orqis is a TypeScript CLI + SDK for inspecting what occupies an LLM prompt window and for linting GitHub Copilot instruction files. It normalizes OpenAI-style payloads, OpenAI-compatible request logs, Anthropic messages, OpenAI Responses-style payloads, generic transcripts, agent snapshots, OpenInference-style traces, and Langfuse full trace payloads into a single context report so engineers can reason about token pressure, prompt composition, and remaining headroom. It also lint-checks `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md` files for overlap, ambiguity, and context-economy issues.

## Status

Orqis is in public alpha.

- read-only analysis only
- exact when providers report usage, conservative when they do not
- intended for engineering diagnostics, not runtime enforcement

## Why Use Orqis

- explain what is actually consuming context
- separate visible prompt text from tool, retrieval, attachment, and overhead segments
- compare turns to see why a conversation grew
- inspect agent snapshots and trace exports
- surface deterministic suggestions for high-pressure context
- fail CI-friendly threshold checks with `orqis check`
- lint Copilot instructions for scope overlap, verbosity, file-shape issues, and surface-specific context pressure
- feed machine-readable output into CI or editor tooling with `--json`
- generate shareable GitHub-friendly output with `--format markdown`

## Supported Inputs

- OpenAI-style chat payloads
- OpenAI-compatible request logs
- OpenAI Responses-style payloads
- Anthropic structured message payloads
- offline transcripts
- handcrafted agent snapshots
- OTLP/OpenInference-shaped trace exports
- Langfuse full trace payloads from `GET /api/public/traces/{traceId}`
- GitHub Copilot instruction repositories or single instruction files via `instructions-lint`

## Current Limits

- token counts are approximate unless the provider reports usage
- model limits are local registry data
- trace import currently supports OpenInference-style exports and Langfuse full trace payloads, not every ecosystem export variant
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
orqis inspect ./fixtures/openai-request.json
```

## Commands

```bash
orqis inspect ./fixtures/openai-request.json
orqis inspect ./fixtures/openai-request.json --json
orqis inspect ./fixtures/openai-compatible-chat-log.json
orqis inspect ./fixtures/suggestions-high-pressure.json --format markdown
orqis diff ./fixtures/turn-1.json ./fixtures/turn-2.json
orqis diff ./fixtures/turn-1.json ./fixtures/turn-2.json --format markdown
orqis budget ./fixtures/anthropic-request.json --model claude-3-5-sonnet-latest
orqis budget ./fixtures/anthropic-request.json --model claude-3-5-sonnet-latest --format markdown
orqis agent-report ./fixtures/agent-snapshot.json
orqis agent-report ./fixtures/agent-snapshot-suggestions.json --format markdown
orqis agent-report ./fixtures/langfuse-trace.json --format markdown
orqis check ./fixtures/suggestions-high-pressure.json --max-total-tokens 100000 --max-usage-percent 80 --max-segment-tokens tool_schema=300 --fail-on-risk medium
orqis instructions-lint ./fixtures/instructions/valid-repo
orqis instructions-lint ./fixtures/instructions/valid-repo --surface coding-agent --model gpt-4o
orqis instructions-lint ./fixtures/instructions/invalid-repo --format markdown
```

## What It Does

- Breaks context into normalized segments
- Estimates or imports token usage
- Labels confidence as exact, provider-reported, tokenizer-based, or heuristic
- Reports remaining context window headroom for known models
- Surfaces deterministic read-only suggestions for high-pressure reports
- Supports threshold-based CI checks with deterministic exit codes
- Supports `--format markdown` for shareable report output
- Summarizes multi-agent context snapshots in read-only mode
- Lints GitHub Copilot instruction files for compatibility, clarity, cross-file scope overlap, and surface-aware instruction token load

## SDK

```ts
import { analyzePayload, diffReports } from "orqis";

const report = analyzePayload(payload);
const diff = diffReports(beforeReport, afterReport);
```

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
- See [openai-compatible-request-logs-v1.md](/Users/raksha/Documents/Projects/probe/docs/specs/openai-compatible-request-logs-v1.md) for the request-log adapter spec.
- See [docs/examples/README.md](/Users/raksha/Documents/Projects/probe/docs/examples/README.md) for executable example workflows.
- See [docs/examples/copilot-instructions-lint.md](/Users/raksha/Documents/Projects/probe/docs/examples/copilot-instructions-lint.md) for a Copilot instructions linting workflow.
- See [docs/adr/README.md](/Users/raksha/Documents/Projects/probe/docs/adr/README.md) for architectural decisions.
- See [CONTRIBUTING.md](/Users/raksha/Documents/Projects/probe/CONTRIBUTING.md) for contribution rules.
- See [SECURITY.md](/Users/raksha/Documents/Projects/probe/SECURITY.md) for vulnerability reporting.
- See [CHANGELOG.md](/Users/raksha/Documents/Projects/probe/CHANGELOG.md) for release history.
