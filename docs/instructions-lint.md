# Tokn Instructions Lint

`instructions-lint` is the stable public Tokn command in public alpha.

It is a local linter for repository instruction files. Today it supports the `copilot` preset for `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md`, plus the `agents-md` preset for root or nested `AGENTS.md` files.

## Why Lint First

Instruction files are part of the context supply chain for coding assistants and coding agents. They are easy to review as prose and hard to reason about as repeated model input.

`instructions-lint` gives teams a practical starting point for context engineering:

- measure always on instruction load before it becomes invisible context pressure
- find duplicated or conflicting guidance across scoped instruction files
- catch stale path scopes before instructions silently stop applying
- separate limits that vary by platform from general context budget pressure
- create baselines so teams can improve instruction quality over time without blocking every existing issue on day one

Advanced prompt and trace diagnostics build on the same idea, but linting is the first place most teams can adopt this safely because it runs locally, avoids file rewrites, and fits CI.

## Stable Contract

The stable contract for `instructions-lint` includes:

- deterministic text, JSON, Markdown, GitHub Actions, and Azure Pipelines output
- stable rule IDs
- a versioned JSON report contract
- local JSON config discovery
- ignore globs, suppressions, and baselines for incremental rollout

The stable JSON report schema ships in the npm package and the repository:

- `schemas/instructions-lint-report.schema.json`
- `schemas/tokn-config.schema.json`

Report JSON includes:

- `kind: "instructions-lint-report"`
- `schemaVersion: "instructions-lint-report/v1"`
- `schemaPath: "schemas/instructions-lint-report.schema.json"`

## Config File

Tokn discovers `tokn.config.json` or `.toknrc.json` from the repository root inferred from the input path. You can also pass an explicit config file with `--config`.

Preferred shape:

```json
{
  "$schema": "https://github.com/mahenarayan/tokn/blob/main/schemas/tokn-config.schema.json",
  "instructionsLint": {
    "rollout": {
      "stage": "baseline",
      "owner": "platform-ai",
      "policyVersion": "2026.04",
      "ticket": "AI-1234",
      "expiresOn": "2026-06-30"
    },
    "profile": "standard",
    "surface": "code-review",
    "failOnSeverity": "error",
    "ignore": ["generated/**", "vendor/**"],
    "baseline": "./.tokn/instructions-baseline.json",
    "rules": {
      "statement-too-long": { "severity": "error" },
      "weak-modal-phrasing": { "enabled": false }
    },
    "suppressions": [
      {
        "path": ".github/instructions/legacy.instructions.md",
        "rules": ["weak-modal-phrasing", "vague-instruction"],
        "reason": "legacy migration window"
      }
    ]
  }
}
```

CLI flags override config values for the current run:

```bash
tokn instructions-lint . \
  --config ./tokn.config.json \
  --baseline ./.tokn/instructions-baseline.json \
  --ignore generated/** \
  --format json
```

## Rollout Controls

Tokn keeps rollout controls intentionally small:

- `rollout`: attaches stage and ownership metadata to reports for enterprise tracking
- `failOnSeverity: "off"`: report findings without failing the process during advisory rollout
- `ignore`: skips instruction files and repository target files matched by the given globs
- `rules`: can disable a rule or change its severity
- `suppressions`: suppresses selected rule IDs for matching instruction files
- `baseline`: suppresses findings that already exist in a previous JSON lint report

Recommended enterprise rollout stages:

1. Advisory: set `rollout.stage` to `advisory` and `failOnSeverity` to `off`, publish JSON or CI annotations, and collect owners.
2. Baseline: set `rollout.stage` to `baseline`, commit a baseline report, and fail only on new errors or warnings.
3. Enforced: set `rollout.stage` to `enforced`, ratchet suppressions down, and use `failOnSeverity: "warning"` when the instruction set is healthy.

Baselines are for incremental adoption. Generate one from the current repository state, commit it, then fail only on new findings:

```bash
tokn instructions-lint . --format json > .tokn/instructions-baseline.json
tokn instructions-lint . --baseline ./.tokn/instructions-baseline.json
```

## GitHub Actions Integration

`--format github` emits GitHub workflow annotations for each finding plus a summary notice. This is the leanest integration path for CI without adding a separate action package.

Example workflow step:

```yaml
- name: Lint repository instructions
  run: npx @tokn-labs/tokn instructions-lint . --format github --fail-on-severity warning
```

If you want structured output instead, use `--format json` and archive the report as a workflow artifact.

## Azure DevOps Integration

`--format azure` emits Azure Pipelines logging commands using `##vso[task.logissue ...]`, so findings show up as build warnings and errors in Azure DevOps Services.

Minimal Azure Pipelines example:

```yaml
trigger:
  branches:
    include:
      - main

pool:
  vmImage: ubuntu-latest

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: 22.x

  - script: |
      npm exec --yes --package @tokn-labs/tokn -- tokn instructions-lint . \
        --format azure \
        --fail-on-severity warning
    displayName: Lint repository instructions
```

Azure Pipelines rollout example:

```yaml
steps:
  - task: NodeTool@0
    inputs:
      versionSpec: 22.x

  - script: |
      mkdir -p "$(Build.ArtifactStagingDirectory)/tokn"
      npm exec --yes --package @tokn-labs/tokn -- tokn instructions-lint . \
        --config ./tokn.config.json \
        --format json \
        > "$(Build.ArtifactStagingDirectory)/tokn/instructions-lint.json"
    displayName: Generate Tokn instructions report

  - script: |
      npm exec --yes --package @tokn-labs/tokn -- tokn instructions-lint . \
        --config ./tokn.config.json \
        --format azure
    displayName: Annotate instruction lint findings

  - task: PublishPipelineArtifact@1
    inputs:
      targetPath: "$(Build.ArtifactStagingDirectory)/tokn"
      artifact: tokn-instructions-lint
```

For restricted enterprise agents, install `@tokn-labs/tokn` from an approved internal npm mirror and call the installed `tokn` binary. Tokn itself only reads local repository files during analysis.

## Support Matrix

### Presets

| Preset | Status | Input shape | Notes |
| --- | --- | --- | --- |
| `copilot` | stable | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md` | includes `applyTo`, `excludeAgent`, and `code-review` 4000-character checks |
| `agents-md` | supported | root or nested `AGENTS.md` | treated as repository-wide or directory-scoped instructions |
| `auto` | stable | repository roots with a mix of supported presets | discovers all supported presets and reports `detectedPresets` |

### Surfaces

| Surface | Status | Notes |
| --- | --- | --- |
| `code-review` | stable | applies the Copilot 4000 character limit |
| `chat` | stable | skips the code review only file cap |
| `coding-agent` | stable | respects `excludeAgent: "coding-agent"` on Copilot path specific files |

### Output formats

| Format | Status | Purpose |
| --- | --- | --- |
| `text` | stable | local use and terminal workflows |
| `json` | stable | CI artifacts, editor tooling, and baselines |
| `markdown` | stable | PR comments, issue comments, and human review |
| `github` | stable | GitHub Actions annotations |
| `azure` | stable | Azure Pipelines logging commands |

## Rule Reference

| Rule ID | Default severity | Category | Applies to |
| --- | --- | --- | --- |
| `invalid-file-path` | error | compatibility | unsupported paths across all presets |
| `malformed-frontmatter` | error | compatibility | Copilot path specific files |
| `missing-frontmatter` | error | compatibility | Copilot path specific files |
| `missing-applyto` | error | compatibility | Copilot path specific files |
| `invalid-exclude-agent` | error | compatibility | Copilot path specific files |
| `global-applyto-overlap` | error | compatibility | Copilot path specific files |
| `stale-applyto` | warning | compatibility | Copilot path specific files |
| `file-char-limit` | error | compatibility | Copilot `code-review` surface only |
| `repository-char-budget` | warning | economy | repository scoped files |
| `repository-token-budget` | warning | economy | repository scoped files |
| `path-specific-char-budget` | warning | economy | path specific files |
| `path-specific-token-budget` | warning | economy | path specific files |
| `statement-count-budget` | warning | economy | all supported presets |
| `order-dependent-wording` | error | compatibility | all supported presets |
| `statement-too-long` | warning | clarity | all supported presets |
| `weak-modal-phrasing` | warning | clarity | all supported presets |
| `vague-instruction` | warning | clarity | all supported presets |
| `paragraph-narrative` | warning | clarity | all supported presets |
| `oversized-code-example` | warning | economy | all supported presets |
| `repo-wide-scoped-topics` | warning | economy | repository scoped files |
| `exact-duplicate-statement` | warning | economy | overlapping supported files |
| `possible-conflict` | warning | economy | overlapping supported files |
| `high-similarity-statement` | warning | economy | overlapping supported files |
| `applicable-token-budget` | warning | economy | effective per target instruction bundles |

## Scope Notes

- `instructions-lint` does not modify files.
- Tokn does not rewrite instructions or generate fixes in the stable surface.
- Advanced prompt and trace diagnostics remain experimental and are not part of this contract yet.
