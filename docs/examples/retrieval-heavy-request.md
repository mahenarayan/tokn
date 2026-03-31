# Retrieval-Heavy Request

Use this when retrieval chunks, attached excerpts, or copied reference material may be crowding out the actual task.

Fixture:

- `fixtures/suggestions-high-pressure.json`

Commands:

```bash
node dist/cli.js inspect fixtures/suggestions-high-pressure.json --format markdown
node dist/cli.js inspect fixtures/suggestions-high-pressure.json --json
```

What this demonstrates:

- `retrieval_context` is tracked separately from ordinary user text
- repeated large retrieval chunks can trigger suggestions
- JSON output can be used to inspect segment totals programmatically

Why it matters:

Retrieval-heavy failures often look like "the prompt is too big" when the real issue is duplicated or oversized excerpts.
This is the workflow for verifying whether retrieved context is the dominant source of pressure before changing summarization or chunking strategy.
