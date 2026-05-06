# Enterprise Rollout Config

Use this when platform, developer-experience, or AI enablement teams want one reviewable `tokn.config.json` pattern that can move from visibility to enforcement across many repositories.

## Phase 1: Advisory

Start with report-only mode. This lets teams publish CI annotations and JSON artifacts without blocking pull requests.

```json
{
  "$schema": "https://github.com/mahenarayan/tokn/blob/main/schemas/tokn-config.schema.json",
  "instructionsLint": {
    "rollout": {
      "stage": "advisory",
      "owner": "platform-ai",
      "policyVersion": "2026.04",
      "ticket": "AI-1234"
    },
    "profile": "standard",
    "surface": "all",
    "failOnSeverity": "off",
    "ignore": ["generated/**", "vendor/**"]
  }
}
```

Run:

```bash
tokn instructions-lint . --config ./tokn.config.json --format github
tokn instructions-lint . --config ./tokn.config.json --format json > .tokn/instructions-lint.json
```

## Phase 2: Baseline

After teams understand the findings, commit a baseline so existing issues stay visible but do not block every PR.

You can generate a starter config from the current repository shape before editing ownership fields:

```bash
tokn init . > tokn.config.json
```

```json
{
  "$schema": "https://github.com/mahenarayan/tokn/blob/main/schemas/tokn-config.schema.json",
  "instructionsLint": {
    "rollout": {
      "stage": "baseline",
      "owner": "platform-ai",
      "policyVersion": "2026.05",
      "ticket": "AI-1234",
      "expiresOn": "2026-06-30"
    },
    "profile": "standard",
    "surface": "all",
    "failOnSeverity": "error",
    "budgets": {
      "pathSpecificChars": 3200,
      "pathSpecificTokens": 850,
      "maxApplicableTokens": 2800
    },
    "baseline": "./.tokn/instructions-baseline.json",
    "ignore": ["generated/**", "vendor/**"]
  }
}
```

Generate the baseline once:

```bash
mkdir -p .tokn
tokn instructions-lint . --config ./tokn.config.json --format json > .tokn/instructions-baseline.json
```

## Phase 3: Enforced

Move to enforcement when owners have removed stale suppressions and the baseline is small enough to retire or maintain intentionally.

```json
{
  "$schema": "https://github.com/mahenarayan/tokn/blob/main/schemas/tokn-config.schema.json",
  "instructionsLint": {
    "rollout": {
      "stage": "enforced",
      "owner": "platform-ai",
      "policyVersion": "2026.06"
    },
    "profile": "strict",
    "surface": "coding-agent",
    "failOnSeverity": "warning",
    "ignore": ["generated/**", "vendor/**"]
  }
}
```

`rollout` fields are reported in text, Markdown, and JSON output so humans and downstream automation can tell which policy stage produced the findings.
