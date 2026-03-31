# Multi-Agent Trace Inspection

Use this when you have an exported agent trace and need to understand which agent or child step carried the most context.

Fixture:

- `fixtures/openinference-trace.json`

Commands:

```bash
node dist/cli.js agent-report fixtures/openinference-trace.json --format markdown
node dist/cli.js inspect fixtures/openinference-trace.json --json
```

What this demonstrates:

- OpenInference-style trace import
- parent and child agent relationships
- LLM inputs, retriever material, tool schemas, and tool outputs recovered from spans
- detailed agent view plus aggregate trace view

Why it matters:

In multi-agent systems, context pressure rarely comes from one flat prompt.
This workflow helps answer:

- which agent carried the largest prompt
- whether retrieval happened in the planner or a worker
- whether tool output or prompt history is dominating a child step
