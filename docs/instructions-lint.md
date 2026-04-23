# Tokn Instructions Lint

`instructions-lint` is the stable public Tokn command in public alpha.

It is a read-only linter for repository instruction files. Today it supports the `copilot` preset for `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md`, plus the `agents-md` preset for root or nested `AGENTS.md` files.

## Stable Contract

The stable contract for `instructions-lint` includes:

- deterministic text, JSON, Markdown, and GitHub-annotation output
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

- `ignore`: skips instruction files and repository target files matched by the given globs
- `rules`: can disable a rule or change its severity
- `suppressions`: suppresses selected rule IDs for matching instruction files
- `baseline`: suppresses findings that already exist in a previous JSON lint report

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

If you want machine-readable output instead, use `--format json` and archive the report as a workflow artifact.

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
| `code-review` | stable | applies the Copilot 4000-character limit |
| `chat` | stable | skips the code-review-only file cap |
| `coding-agent` | stable | respects `excludeAgent: "coding-agent"` on Copilot path-specific files |

### Output formats

| Format | Status | Purpose |
| --- | --- | --- |
| `text` | stable | local use and terminal-first workflows |
| `json` | stable | CI artifacts, editor tooling, and baselines |
| `markdown` | stable | PR comments, issue comments, and human review |
| `github` | stable | GitHub Actions annotations |

## Rule Reference

| Rule ID | Default severity | Category | Applies to |
| --- | --- | --- | --- |
| `invalid-file-path` | error | compatibility | unsupported paths across all presets |
| `malformed-frontmatter` | error | compatibility | Copilot path-specific files |
| `missing-frontmatter` | error | compatibility | Copilot path-specific files |
| `missing-applyto` | error | compatibility | Copilot path-specific files |
| `invalid-exclude-agent` | error | compatibility | Copilot path-specific files |
| `global-applyto-overlap` | error | compatibility | Copilot path-specific files |
| `stale-applyto` | warning | compatibility | Copilot path-specific files |
| `file-char-limit` | error | compatibility | Copilot `code-review` surface only |
| `repository-char-budget` | warning | economy | repository-scoped files |
| `repository-token-budget` | warning | economy | repository-scoped files |
| `path-specific-char-budget` | warning | economy | path-specific files |
| `path-specific-token-budget` | warning | economy | path-specific files |
| `statement-count-budget` | warning | economy | all supported presets |
| `order-dependent-wording` | error | compatibility | all supported presets |
| `statement-too-long` | warning | clarity | all supported presets |
| `weak-modal-phrasing` | warning | clarity | all supported presets |
| `vague-instruction` | warning | clarity | all supported presets |
| `paragraph-narrative` | warning | clarity | all supported presets |
| `oversized-code-example` | warning | economy | all supported presets |
| `repo-wide-scoped-topics` | warning | economy | repository-scoped files |
| `exact-duplicate-statement` | warning | economy | overlapping supported files |
| `possible-conflict` | warning | economy | overlapping supported files |
| `high-similarity-statement` | warning | economy | overlapping supported files |
| `applicable-token-budget` | warning | economy | effective per-target instruction bundles |

## Scope Notes

- `instructions-lint` is intentionally read-only.
- Tokn does not rewrite instructions or generate fixes in the stable surface.
- Advanced prompt and trace diagnostics remain experimental and are not part of this contract yet.
