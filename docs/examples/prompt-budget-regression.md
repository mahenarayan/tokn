# Prompt Budget Regression

Use this when a conversation seems to have grown unexpectedly and you need to know which turn caused the increase.

Fixtures:

- `fixtures/turn-1.json`
- `fixtures/turn-2.json`

Command:

```bash
node dist/cli.js diff fixtures/turn-1.json fixtures/turn-2.json --format markdown
```

What this demonstrates:

- stable semantic diffing rather than positional churn
- which segment was added, removed, or changed
- how growth is attributed across turns

Why it matters:

This is the workflow for "what changed between yesterday's passing prompt and today's failing prompt?"
It is useful when adding one assistant turn, tool result, or retrieval chunk unexpectedly pushes a conversation toward the context limit.

Follow-up:

If the diff identifies a dominant segment, run `inspect` on the newer file to see the full ranked context breakdown:

```bash
node dist/cli.js inspect fixtures/turn-2.json
```
