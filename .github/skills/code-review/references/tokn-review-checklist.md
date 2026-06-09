# Tokn Review Checklist

Use this checklist when a Tokn PR touches instruction lint, report contracts,
packaging, release automation, skills, or dependency behavior.

## Instruction Lint Correctness

- Discovery and preset behavior must stay deterministic.
- `AGENTS.md`, Copilot repository instructions, and path-specific Copilot
  instructions must keep their current semantics unless the PR explicitly
  changes that contract.
- Unsupported instruction surfaces should remain visibility-only unless support
  is intentionally expanded.
- `applyTo`, `description`, `excludeAgent`, ignore, suppressions, baselines, and
  rollout config must keep existing precedence rules.
- Cross-file findings should run after scope resolution because duplicates,
  conflicts, overlap, and target-load pressure depend on matched files.

## Report And Schema Stability

- Exported TypeScript types, JSON schemas, rule IDs, report fields, and CLI
  output are public contract.
- Schema changes need contract tests and matching changelog/docs.
- Golden output changes should reflect deliberate user-facing behavior.
- New rules should be registered in the rule registry and schemas together.

## Token And Budget Behavior

- Token estimates should stay conservative and deterministic.
- Local token estimates must not be presented as provider billing numbers.
- Context-pressure checks should prefer predictable heuristics over false
  precision.
- Budget changes should include focused tests for repository, path-specific, and
  per-target behavior when applicable.

## Packaging And Release Integrity

- `package.json` `files` and `scripts/check-pack.mjs` must stay aligned.
- Runtime artifacts, schemas, public support docs, and published skill packs
  should ship intentionally.
- Internal source, tests, workflows, and planning docs should stay out of the
  npm package unless the PR explicitly changes that policy.
- Release changes should keep `docs/releasing.md`, `CHANGELOG.md`, and package
  versions consistent.

## Security And Supply Chain

- No new network, shell, credential, or file-write behavior without clear
  rationale.
- Runtime dependency additions need an explicit need, risk review, and
  package-lock consistency.
- GitHub Actions should remain least-privilege and pinned where the repo already
  expects pinning.

## Documentation And Skills

- Repo instructions and skills should be crisp, scoped, and non-conflicting.
- Skills should not pre-approve shell/bash tools unless reviewed and necessary.
- Portable skill packs should keep one canonical source of truth and thin
  adapters only.
- Skills should avoid hidden operational behavior; scripts and external tools
  should be explicit.
