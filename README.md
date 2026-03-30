# Orqis

Context visibility for LLMs and agents.

Orqis is a TypeScript CLI + SDK for inspecting what occupies an LLM prompt window. It normalizes OpenAI-style payloads, Anthropic messages, generic transcripts, and agent snapshots into a single context report so engineers can reason about token pressure, prompt composition, and remaining headroom.

## Commands

```bash
orqis inspect ./fixtures/openai-request.json
orqis inspect ./fixtures/openai-request.json --json
orqis diff ./fixtures/turn-1.json ./fixtures/turn-2.json
orqis budget ./fixtures/anthropic-request.json --model claude-3-5-sonnet-latest
orqis agent-report ./fixtures/agent-snapshot.json
```

## What v1 does

- Breaks context into normalized segments
- Estimates or imports token usage
- Labels confidence as exact, provider-reported, tokenizer-based, or heuristic
- Reports remaining context window headroom for known models
- Summarizes multi-agent context snapshots in read-only mode

## Development

```bash
npm install
npm test
```

Useful local commands:

```bash
npm run check
npm run dev
npm run smoke
```

Repository guide:

- See [INSTRUCTIONS.md](/Users/raksha/Documents/Projects/probe/INSTRUCTIONS.md) for contributor and maintenance guidance.
- See [architecture.md](/Users/raksha/Documents/Projects/probe/docs/architecture.md) for the system architecture.
- See [spec-driven-development.md](/Users/raksha/Documents/Projects/probe/docs/spec-driven-development.md) for the development workflow.
- See [docs/adr/README.md](/Users/raksha/Documents/Projects/probe/docs/adr/README.md) for architectural decisions.
