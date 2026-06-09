---
name: code-review
description: Review Tokn pull requests and local changes for correctness, regressions, API/schema risk, packaging risk, and instruction-lint behavior. Use this for PR review, autoreview, second-pass review, or pre-merge review tasks.
license: MIT
---

# Tokn Code Review

Run a structured review of Tokn changes. This is an advisory review skill:
verify every finding against the real code before suggesting or applying a fix.

Focus on bugs, behavioral regressions, missing tests, public contract changes,
release/package risk, and instruction-lint correctness. Avoid style-only
feedback unless it hides a real maintenance or correctness problem.

## Review Contract

- Treat review output as advisory. Do not blindly apply it.
- Read the touched files and adjacent code before judging a finding.
- Prefer concrete, actionable findings with file and line references.
- Reject speculative edge cases, broad rewrites, and fixes that make the code
  harder to reason about.
- Prefer small fixes at the existing ownership boundary.
- If a finding reveals a repeated bug class, inspect sibling code in the touched
  area before recommending a fix.
- If a fix changes behavior, identify the focused test or fixture that should
  prove it.
- Do not ask for public API, schema, CLI output, or package-surface changes
  unless they are intentional and documented.
- Do not recommend adding runtime dependencies unless the supply-chain tradeoff
  is explicit and the dependency is necessary.

## Tokn-Specific Review Priorities

1. `instructions-lint` correctness:
   - discovery and preset behavior stay deterministic
   - `AGENTS.md`, Copilot repository instructions, and path-specific Copilot
     instructions keep their current semantics
   - unsupported instruction surfaces remain visibility-only unless a PR
     intentionally expands support
   - `applyTo`, `description`, `excludeAgent`, ignore, suppressions, baselines,
     and rollout config keep existing precedence rules

2. Report and schema stability:
   - exported TypeScript types, JSON schemas, rule IDs, report fields, and CLI
     output are public contract
   - schema changes must be paired with contract tests and changelog/docs
   - golden output changes must reflect deliberate user-facing behavior

3. Token and budget behavior:
   - token estimates stay conservative and deterministic
   - provider billing is not implied by local token estimates
   - context pressure checks prefer predictable heuristics over false precision

4. Packaging and release integrity:
   - `package.json` `files` and `scripts/check-pack.mjs` stay aligned
   - runtime artifacts, schemas, public support docs, and published skills ship
     intentionally
   - internal source, tests, workflows, and planning docs stay out of the npm
     package unless a PR explicitly changes that policy

5. Security and supply-chain posture:
   - no new network, shell, credential, or file-write behavior without clear
     rationale
   - dependency additions require exact need, risk review, and package-lock
     consistency
   - GitHub Actions should remain least-privilege and pinned where the repo
     already expects that

6. Documentation and skills:
   - repo instructions and skills should be crisp, scoped, and non-conflicting
   - skills should not pre-approve shell/bash tools unless reviewed and needed
   - portable skill files should keep one canonical source of truth and thin
     adapters only

## Review Process

1. Identify the diff target:
   - for a PR, compare against the PR base branch
   - for local branch work, compare against `origin/main` unless another base is
     explicit
   - for a single committed change, inspect that commit and nearby code

2. Read in this order:
   - touched code or docs
   - adjacent modules that define the same contract
   - tests and fixtures covering the behavior
   - schemas, package files, workflows, or release docs when touched

3. Classify findings by severity:
   - Critical: likely release blocker, data/security issue, broken publish path,
     or public contract break
   - High: likely user-visible regression or missing test for risky behavior
   - Medium: maintainability issue that can create near-term correctness drift
   - Low: minor issue worth mentioning only if it is actionable

4. For each accepted finding, include:
   - file and line
   - concrete failure mode
   - why existing tests may miss it
   - minimal fix direction

5. If there are no actionable findings, say so clearly and mention any residual
   test or release risk.

## Expected Verification

Prefer focused verification first, then broader checks when behavior or package
surface changed.

- `npm test`
- `npm run smoke`
- `npm run pack:check`
- `npm run security:audit`
- `tokn instructions-lint .` when instruction files, lint behavior, docs, or
  skills changed

Do not require every command for tiny documentation-only changes. Require
package and audit checks when dependencies, `package.json`, package contents, or
release workflow behavior changed.

## Output Format

Start with findings, ordered by severity. Keep summaries secondary.

Use this shape:

```text
Findings:
- [High] path/to/file.ts:42 - Concrete issue and why it matters.

Open questions:
- Any decision that blocks a confident fix.

Verification:
- Checks reviewed or recommended.

Summary:
- Short note on the overall review result.
```

If there are no findings:

```text
Findings:
- None found.

Verification:
- Mention reviewed tests/checks and any residual risk.
```
