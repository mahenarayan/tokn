---
name: code-review
description: Review Tokn pull requests and local changes for correctness, regressions, API/schema risk, packaging risk, and instruction-lint behavior. Use this for PR review, autoreview, second-pass review, or pre-merge review tasks.
license: MIT
---

# Tokn Code Review

Run a structured review of Tokn changes. This is advisory: verify every finding
against the real code before suggesting or applying a fix.

Focus on bugs, behavioral regressions, missing tests, public contract changes,
release/package risk, and instruction-lint correctness. Avoid style-only
feedback unless it hides a real maintenance or correctness problem.

For detailed Tokn review priorities, read
`references/tokn-review-checklist.md` when the diff touches instruction lint,
schemas, packaging, workflows, release docs, or skills.

## Review Contract

- Treat review output as advisory. Do not blindly apply it.
- Read touched files and adjacent code before judging a finding.
- Prefer concrete findings with file and line references.
- Reject speculative edge cases, broad rewrites, and fixes that make the
  codebase harder to reason about.
- Prefer small fixes at the existing ownership boundary.
- If a finding reveals a repeated bug class, inspect sibling code in the touched
  area before recommending a fix.
- Do not ask for public API, schema, CLI output, or package-surface changes
  unless they are intentional and documented.
- Do not recommend runtime dependencies unless the supply-chain tradeoff is
  explicit and the dependency is necessary.

## Review Process

1. Identify the diff target: PR base branch, explicit base, or `origin/main`.
2. Read touched files, adjacent contract modules, relevant tests/fixtures, and
   schemas/package/workflow/release files when touched.
3. Classify accepted findings by impact: Critical, High, Medium, or Low.
4. For each accepted finding, include file/line, concrete failure mode, why
   tests may miss it, and a minimal fix direction.
5. If there are no actionable findings, say so clearly and mention residual
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
