# Instruction Drift At Scale

Use this workflow when a repository has many instruction files and you need to find stale guidance without loading those files into a model.

Tokn indexes the repository locally, extracts explicit references from instruction statements, and compares those references with the current repo state.

## Run Advisory First

```bash
tokn instructions-lint . \
  --fail-on-severity off \
  --format json \
  > .tokn/instructions-lint.json
```

This reports drift without blocking the team.

## Read The Aggregate

The JSON report includes a `drift` section when drift findings exist:

```json
{
  "drift": {
    "totalFindings": 42,
    "byRule": [
      { "ruleId": "missing-file-reference", "count": 18 },
      { "ruleId": "missing-symbol-reference", "count": 15 },
      { "ruleId": "missing-command-reference", "count": 9 }
    ],
    "byConfidence": [
      { "confidence": "high", "count": 27 },
      { "confidence": "medium", "count": 15 }
    ],
    "files": [
      { "file": ".github/instructions/legacy.instructions.md", "count": 12 }
    ],
    "references": [
      {
        "value": "src/legacy/storage.ts",
        "count": 8,
        "ruleIds": ["missing-file-reference"],
        "files": [".github/instructions/legacy.instructions.md"]
      }
    ]
  }
}
```

For large instruction sets, start with:

- `drift.byConfidence`: fix high-confidence path and package-script drift first
- `drift.references`: find stale references repeated across many instruction files
- `drift.files`: identify instruction files that need consolidation or ownership review

## Query From CI Artifacts

```bash
jq '.drift // empty' .tokn/instructions-lint.json
jq '.drift.references[]? | select(.count >= 3)' .tokn/instructions-lint.json
jq '.findings[] | select(.category == "drift" and .confidence == "high")' .tokn/instructions-lint.json
```

## Baseline Existing Drift

```bash
tokn instructions-lint . \
  --format json \
  > .tokn/instructions-baseline.json
```

Then enforce only new drift:

```bash
tokn instructions-lint . \
  --baseline ./.tokn/instructions-baseline.json \
  --fail-on-severity warning
```

## Keep The Boundary Clear

This feature is deterministic and reference-based. It does not infer broad architecture drift from prose. That keeps the default linter fast, local, suppressible, and safe for CI.
