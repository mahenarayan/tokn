# Tokn Instructions Lint

`instructions-lint` is the stable public Tokn command in public alpha.

It is a local linter for repository instruction files. Today it supports the `copilot` preset for `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md`, plus the `agents-md` preset for root or nested `AGENTS.md` files.

The purpose is context and agent engineering for AI-assisted development. Tokn treats instruction files as recurring model input: it measures load, scope, duplication, conflicts, and compatibility before those instructions are sent to coding assistants or agents. Code review is one supported surface, not the whole product scope.

In `auto` mode Tokn also detects known external agent-instruction surfaces such as `CLAUDE.md`, `CLAUDE.local.md`, `GEMINI.md`, `.cursor/rules/*.mdc`, and `.cursorrules`. These are reported with `unsupported-agent-surface` warnings for rollout visibility, but Tokn does not lint their tool-specific semantics yet.

## Why Lint First

Instruction files are part of the context supply chain for coding assistants and coding agents. They are easy to review as prose and hard to reason about as repeated model input.

`instructions-lint` gives teams a practical starting point for context and agent engineering:

- measure always on instruction load before it becomes invisible context pressure
- find duplicated or conflicting guidance across scoped instruction files
- catch stale path scopes before instructions silently stop applying
- separate limits that vary by platform from general context budget pressure
- create baselines so teams can improve instruction quality over time without blocking every existing issue on day one
- run the same instruction governance across chat, coding-agent, and code-review surfaces

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

## Concepts And Limits

Tokn prints the active limits in text and Markdown reports so findings do not look like unexplained magic numbers.

Important terms:

- Lint purpose: context and agent engineering for repository instruction files; code review is one supported surface.
- Surface: the target consumption mode for a run, such as chat assistance, autonomous coding agents, or code review compatibility.
- Statement: one parsed instruction directive, counted from a bullet, numbered item, or paragraph block.
- Applicable: loaded for the selected surface and eligible for matching target files.
- Target load: total active instruction tokens that can apply to one repository file.
- Estimated tokens: local approximation for context pressure, not provider billing.

Profile budgets are Tokn compactness policies. `standard` is designed for practical enterprise rollout without forcing every readable paragraph into a finding. `strict` is the aggressive context-economy profile for teams that want very small always-on instruction bundles.

| Profile | Repository file | Path-specific file | Target load | Statements per file | Words per statement |
| --- | ---: | ---: | ---: | ---: | ---: |
| `lite` | 4000 chars / 1000 tokens | 4000 chars / 1000 tokens | 3000 tokens | 40 | 70 |
| `standard` | 2500 chars / 650 tokens | 2500 chars / 650 tokens | 2400 tokens | 24 | 50 |
| `strict` | 1500 chars / 375 tokens | 900 chars / 225 tokens | 600 tokens | 12 | 30 |

Platform limits are separate from Tokn budgets. For the `code-review` surface, Tokn checks GitHub Copilot code review's documented behavior that only the first 4,000 characters of a custom instruction file are read. That check is emitted as `file-char-limit` and is not configurable as a profile budget. See GitHub's guide to [using custom instructions with Copilot code review](https://docs.github.com/en/enterprise-cloud@latest/copilot/tutorials/use-custom-instructions).

## Interpreting Findings

Tokn groups findings by why they matter, not by style preference alone:

- Compatibility errors identify platform behavior that can prevent instructions from loading or behaving predictably.
- Economy warnings identify instruction text that may create context pressure when multiple files apply to one target.
- Clarity warnings identify instructions that are vague, weakly worded, overly long, or harder for agents to follow.

For Copilot `.github/instructions/*.instructions.md` files, `applyTo` enables automatic path matching. `description` enables task-triggered or manually attached instructions in supported editor flows. Tokn accepts description-only files and reports them as active, but skips target-file matching, stale-scope checks, and overlap analysis because there is no deterministic file glob to resolve.

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
| `copilot` | stable | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md` | includes `applyTo`, `description`, `excludeAgent`, and `code-review` 4000-character checks |
| `agents-md` | supported | root or nested `AGENTS.md` | treated as repository-wide or directory-scoped instructions |
| `auto` | stable | repository roots with a mix of supported presets | discovers all supported presets and reports `detectedPresets` |

### Known External Surfaces

| Surface | Status | Input shape | Notes |
| --- | --- | --- | --- |
| Claude Code | visibility only | `CLAUDE.md`, `CLAUDE.local.md`, `.claude/rules/*.md` | reported as unsupported so teams know the file exists |
| Gemini CLI | visibility only | `GEMINI.md` | reported as unsupported so teams can track cross-tool drift |
| Cursor | visibility only | `.cursor/rules/*.mdc`, `.cursorrules` | reported as unsupported; `.cursorrules` is legacy in Cursor docs |

### Surfaces

| Surface | Status | Notes |
| --- | --- | --- |
| `code-review` | stable | code review compatibility mode; applies the Copilot 4000 character limit |
| `chat` | stable | chat assistance mode; skips the code review only file cap |
| `coding-agent` | stable | autonomous coding-agent mode; respects Copilot `excludeAgent: "cloud-agent"` on path specific files; `coding-agent` is also accepted for compatibility |

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
| `unsupported-agent-surface` | warning | compatibility | known external agent instruction surfaces |
| `malformed-frontmatter` | error | compatibility | Copilot path specific files |
| `missing-frontmatter` | error | compatibility | Copilot path specific files |
| `missing-applyto` | error | compatibility | Copilot path specific files with neither `applyTo` nor `description` |
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
- Detection of `CLAUDE.md`, `GEMINI.md`, and Cursor rule files is visibility-only in `auto` mode.
- Symlinked instruction files that resolve to regular files are discovered; symlinked directories are skipped to avoid traversal loops.
- Advanced prompt and trace diagnostics remain experimental and are not part of this contract yet.
