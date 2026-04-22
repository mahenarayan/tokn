# CI Gate Usage

Use this when you want Tokn to fail a build as soon as prompt size or budget risk crosses an agreed threshold.

Fixtures:

- `fixtures/suggestions-high-pressure.json`
- `fixtures/anthropic-request.json`

Commands:

Failing example:

```bash
node dist/cli.js check fixtures/suggestions-high-pressure.json --max-total-tokens 100000 --max-usage-percent 80 --max-segment-tokens tool_schema=300 --fail-on-risk medium
```

Passing example:

```bash
node dist/cli.js check fixtures/anthropic-request.json --model claude-3-5-sonnet-latest --max-total-tokens 1000 --max-usage-percent 90 --fail-on-risk high
```

What this demonstrates:

- deterministic threshold evaluation
- explicit model-aware budget checks
- human-readable pass/fail output with exit codes
- a path from local diagnosis to CI enforcement

Why it matters:

Inspection is useful, but teams usually adopt tooling when it can stop regressions automatically.
This is the starting point for wiring Tokn into pull-request checks, pre-merge validation, or regression scripts.

Tip:

Use `--json` when you want a wrapper script or GitHub Action to consume the result structurally.
