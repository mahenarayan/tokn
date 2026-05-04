# OpenAI Agents Python Instructions Case Study

This example uses the public `openai/openai-agents-python` repository as a reproducible case study for context engineering diagnostics.

It is not a critique of the upstream project. It shows why instruction linting is a useful starting point: once instruction files become long enough, human review stops being a reliable way to reason about always on context load, scoped guidance, and wording that depends on rule order.

Source repository: <https://github.com/openai/openai-agents-python>

## Reproduce The Snapshot

```bash
rm -rf /tmp/tokn-openai-agents-python
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/openai/openai-agents-python.git \
  /tmp/tokn-openai-agents-python

cd /tmp/tokn-openai-agents-python
git sparse-checkout set --no-cone /AGENTS.md /src /tests /docs

tokn instructions-lint /tmp/tokn-openai-agents-python \
  --preset agents-md \
  --surface coding-agent \
  --model gpt-4o \
  --format json
```

Snapshot taken on 2026-04-25 with a sparse checkout of `AGENTS.md`, `src`, `tests`, and `docs`:

| Metric | Before |
| --- | ---: |
| Instruction files | 1 |
| Characters | 12,888 |
| Estimated tokens | 3,267 |
| Instruction statements | 94 |
| Max applicable tokens | 3,267 |
| Findings | 25 |
| Blocking errors | 1 |

The top signal was not a style preference. Tokn found an always on instruction bundle of 3,267 estimated tokens for the coding-agent surface, plus an instruction that depends on rule order. That is the kind of context engineering issue humans often miss because the file reads like documentation, while the model receives it as recurring operational context.

## Before And After Plan

The first cleanup target is not "make the file pretty." The target is to reduce always on instruction load while preserving the rules that matter.

| Area | Before | After target |
| --- | --- | --- |
| Global instructions | One large repository level `AGENTS.md` | Short global file with only universal rules |
| Scoped guidance | Mixed into the global file | Move package, test, and docs specific rules into nested `AGENTS.md` files |
| Long statements | Many statements above the strict 30-word budget | Rewrite as atomic bullets with direct verbs |
| Context pressure | 3,267 estimated tokens always applicable | Keep the max applicable bundle below the configured profile budget or make the excess intentional |
| Rollout | All findings appear at once | Commit a baseline, then fail only on new findings |

Example rollout config:

```json
{
  "$schema": "https://github.com/mahenarayan/tokn/blob/main/schemas/tokn-config.schema.json",
  "instructionsLint": {
    "preset": "agents-md",
    "profile": "standard",
    "surface": "coding-agent",
    "model": "gpt-4o",
    "failOnSeverity": "warning",
    "baseline": "./.tokn/instructions-baseline.json"
  }
}
```

Generate the initial baseline:

```bash
mkdir -p .tokn
tokn instructions-lint . --config ./tokn.config.json --format json > .tokn/instructions-baseline.json
```

Then require every follow up PR to keep the instruction set from getting worse:

```bash
tokn instructions-lint . --config ./tokn.config.json --format azure
```

## Why This Matters

Instruction files are no longer just documentation. They are part of the context supply chain for coding agents and assistants. Tokn makes that supply chain measurable:

- how many instruction tokens are always applicable
- which files contribute to a target file's instruction bundle
- where scoped guidance should move out of global context
- where wording depends on runtime ordering assumptions
- which findings are new versus inherited from a baseline

Linting is the practical entry point. The same report model can later feed deeper diagnostics for prompt payloads, traces, and context composition without requiring humans to manually inspect every turn.
