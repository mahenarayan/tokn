# Dogfooding Tokn

This example shows how to use Tokn on this repository and how a team can keep instruction files small, reviewable, and useful over time.

Tokn is intentionally read-only. It does not rewrite instructions. It gives maintainers a repeatable way to see instruction load, unsupported files, stale scopes, duplicates, conflicts, vague wording, and surface-specific limits before those files become invisible model context.

## What Tokn Sees In This Repository

Run from the repository root:

```bash
tokn instructions-lint . --fail-on-severity off
```

Current result:

```text
Tokn Instructions Lint: advisory

Instruction files: 2 loaded of 2 scanned
Active instruction text: 69 estimated tokens from 5 parsed statements
Largest target load: 69 estimated tokens
Findings: 0 errors, 0 warnings
```

Why this is useful:

- the supported instruction fixtures are compact
- nested `AGENTS.md` files compose without duplicate or conflicting rules
- the largest applicable instruction bundle is small enough that it will not materially crowd model context

## Product Gap Found By Dogfooding

This repository also has a root `INSTRUCTIONS.md` file for maintainer and agent context. Today, `instructions-lint` does not treat `INSTRUCTIONS.md` as a supported preset.

Run:

```bash
tokn instructions-lint INSTRUCTIONS.md --fail-on-severity off
```

Current result:

```text
[error] invalid-file-path at INSTRUCTIONS.md:1
Problem: Instruction file path does not match a supported instruction preset location.
Fix: Use .github/copilot-instructions.md, .github/instructions/*.instructions.md, or AGENTS.md.
```

This is the right behavior for the current public contract. It avoids silently pretending that every Markdown guidance file has known runtime semantics. If a team wants Tokn to govern an instruction file today, use one of the supported surfaces:

- root or nested `AGENTS.md`
- `.github/copilot-instructions.md`
- `.github/instructions/*.instructions.md`

For this repository, `INSTRUCTIONS.md` remains maintainer guidance. If we want it governed by Tokn later, the minimal path is to add a root `AGENTS.md` or a dedicated preset after there is enough real usage to justify the public surface.

## Ways Teams Can Keep Instructions Clean

### 1. Local Advisory Check

Use this before opening a pull request:

```bash
tokn instructions-lint . --fail-on-severity off
```

This gives fast feedback without blocking work. It is useful when a team is still learning which findings are signal and which thresholds need local calibration.

### 2. Calibrated Config

Generate a starter config from the current repository:

```bash
tokn init . > tokn.config.json
```

Then edit the config intentionally. Keep only the policy knobs the team understands. Prefer `budgets`, `baseline`, and `suppressions` over adding new CLI flags to every CI job.

This repository now keeps a small `tokn.config.json` at the root:

```json
{
  "instructionsLint": {
    "preset": "auto",
    "profile": "standard",
    "surface": "coding-agent",
    "failOnSeverity": "warning",
    "ignore": ["dist/**", "node_modules/**"],
    "rollout": {
      "stage": "advisory",
      "owner": "maintainers",
      "policyVersion": "2026.05"
    }
  }
}
```

### 3. GitHub Actions Consumer Workflow

The repository dogfoods Tokn through `.github/workflows/instructions-lint.yml`. The workflow uses the published npm package instead of the local source tree, which is the same path a downstream consumer would use:

```yaml
- name: Install Tokn CLI
  run: npm install --global @tokn-labs/tokn@0.4.0 --ignore-scripts

- name: Lint repository instructions
  run: |
    tokn instructions-lint . \
      --config ./tokn.config.json \
      --format github
```

The workflow also writes an advisory JSON report with `--fail-on-severity off` so maintainers can inspect report shape even when the annotation gate fails.

The dogfood config uses `surface: "coding-agent"` because that is the most relevant consumption mode for this repository's maintainer guidance and it works with the currently published package used by the workflow.

Why this helps Tokn:

- every pull request exercises the published package path
- GitHub annotations expose whether finding messages are useful in real review
- the root config proves whether the policy surface stays small enough for normal repositories
- scheduled runs catch drift when instruction files change outside feature work

### 4. Baseline For Existing Debt

Use a baseline when the first scan finds existing issues:

```bash
mkdir -p .tokn
tokn instructions-lint . --format json > .tokn/instructions-baseline.json
tokn instructions-lint . --baseline ./.tokn/instructions-baseline.json
```

This lets teams block new instruction debt without forcing a full cleanup on day one.

### 5. CI Annotations

For GitHub Actions:

```bash
npm exec --yes --package @tokn-labs/tokn -- \
  tokn instructions-lint . --format github --fail-on-severity warning
```

For Azure Pipelines:

```bash
npm exec --yes --package @tokn-labs/tokn -- \
  tokn instructions-lint . --format azure --fail-on-severity warning
```

These modes make instruction issues visible where code review already happens.

### 6. Periodic Cleanup Review

Run a stricter report periodically instead of making every pull request strict:

```bash
tokn instructions-lint . --profile strict --fail-on-severity off --format markdown
```

Use this to find bloated files, long statements, oversized examples, and repeated guidance. Cleanup work is easier when it is planned separately from feature delivery.

## What Good Looks Like

Healthy instruction sets usually have these properties:

- one repository-wide file for rules that truly apply everywhere
- scoped files only when the scope changes behavior
- short bullet directives over long narrative paragraphs
- examples that show only the essential pattern
- no duplicate rules across overlapping scopes
- no platform-specific limits hidden inside generic guidance
- baselines and suppressions that expire or get reviewed

Tokn does not replace human judgment. It makes instruction quality visible enough for humans to maintain it deliberately.
