# Oversized Tool Schema

Use this when tool declarations themselves may be dominating the request before the model even sees much user content.

Fixture:

- `fixtures/suggestions-high-pressure.json`

Commands:

```bash
node dist/cli.js inspect fixtures/suggestions-high-pressure.json --format markdown
node dist/cli.js check fixtures/suggestions-high-pressure.json --max-segment-tokens tool_schema=300
```

What this demonstrates:

- `tool_schema` segments are measured independently from user and assistant text
- suggestions call out oversized tool declarations deterministically
- `check` can turn that diagnosis into a CI failure

Why it matters:

Large tool schemas are one of the easiest ways to waste context silently.
This workflow lets you prove that the schema itself is the problem instead of blaming retrieval or conversation history by default.
