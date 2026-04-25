# Tokn: Context Visibility for LLMs and Agents

## Summary

Build `Tokn`, a TypeScript/Node CLI + SDK for context visibility in LLM systems.
Its v1 purpose is inspection without file mutation:

- explain what occupies a prompt/context window
- show token usage by segment
- distinguish exact counts from estimates
- report remaining headroom for a chosen model
- summarize context pressure across multiple agents when traces or snapshots are available

This is not a full hosted observability platform in v1, and it does not enforce steering policies yet.

## Key Changes

### Product identity

Use:

- Product name: `Tokn`
- CLI name: `tokn`
- Repo/package direction: `tokn` or `@tokn/cli`
- Primary tagline: `Context visibility for LLMs and agents`

### Core architecture

Implement a normalized prompt/context schema that can represent:

- `system`
- `developer`
- `user`
- `assistant_history`
- `tool_schema`
- `tool_result`
- `retrieval_context`
- `attachment`
- `provider_overhead`
- `agent_metadata`

Each segment should include:

- source
- role/type
- token count
- confidence level (`exact`, `provider-reported`, `tokenizer-based`, `heuristic`)
- visibility (`explicit`, `derived`, `hidden/estimated`)
- reclaimability hint (`keep`, `drop`, `summarize`, `cache`)

### Input and adapter strategy

Support these first:

- OpenAI style request payloads
- Anthropic message payloads
- generic OpenAI compatible JSON
- offline conversation/transcript JSON
- optional multi agent snapshots or trace exports

Counting strategy:

1. use provider-reported usage when present
2. use provider token-count APIs where supported
3. use local model/tokenizer adapters
4. fall back to heuristics and mark them clearly

Keep model context-limit metadata in a versioned local registry.

### CLI and SDK surface

CLI commands:

- `tokn inspect <file>`
- `tokn diff <a> <b>`
- `tokn budget <file> --model <id>`
- `tokn agent-report <file>`

SDK responsibilities:

- ingest raw payloads and transcript objects
- normalize them into a common context model
- emit JSON reports for composition, budget, and diffs
- optionally export/import OpenTelemetry or OpenInference-shaped data for agent/tracing interop

### Agent visibility

Treat remote agents as observed entities in v1.
Import per-agent state from traces or structured JSON snapshots with:

- agent id
- parent agent id
- model
- turn number
- timestamp
- normalized context segments
- total input tokens
- remaining budget

Do not define an enforcement protocol in v1.
Use OpenTelemetry/OpenInference as the preferred interop path when available.

## Test Plan

Validate:

- exact counts when provider usage fields are present
- correct fallback behavior when only local tokenization is possible
- correct attribution for tools, retrieved chunks, and attachments
- diff reports that identify which segment caused context growth
- headroom calculations with reserved output budget
- reports for multiple agents that separate and group agents correctly
- clear diagnostics for unsupported payload shapes

Acceptance criteria:

- a developer can run `tokn inspect` on a saved request and get a ranked context breakdown
- the output clearly labels exact versus estimated counts
- `tokn diff` explains where context changed between two turns
- `tokn budget` reports remaining room and risk level for a model
- `tokn agent-report` summarizes context pressure for at least one imported trace format with multiple agents

## Assumptions

- implementation language is TypeScript/Node
- v1 is CLI + SDK, not a hosted dashboard
- v1 prefers passive adapters over a mandatory proxy
- v1 focuses on prompt composition reports rather than automated optimization
- v1 agent support is visibility, not steering or policy enforcement
- open source plain English discoverability will come from the tagline and docs, not the product name alone
