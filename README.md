# Orqis

Context visibility for LLMs and agents.

Orqis is a TypeScript CLI + SDK for inspecting what occupies an LLM prompt window. It normalizes OpenAI-style payloads, Anthropic messages, generic transcripts, and agent snapshots into a single context report so engineers can reason about token pressure, prompt composition, and remaining headroom.

## Commands

```bash
orqis inspect ./fixtures/openai-request.json
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
