# ADR 0014: Instruction Drift Detection Pillar

## Status

Accepted

## Context

Tokn started with instruction linting focused on file shape, scope, duplication, conflict, clarity, and context economy. Those checks are useful, but a merged Cline PR showed a different high-value failure mode: instruction files can describe implementation paths that no longer exist.

In that case, repository agent guidance still pointed contributors and coding agents toward VS Code `ExtensionContext` storage and a removed `readGlobalStateFromDisk()` flow. The current implementation had moved to file-backed `StateManager` storage. The useful finding was not that the instruction was long or stylistically imperfect. The useful finding was that the instruction had drifted away from the codebase.

This is a stronger enterprise and OSS value proposition than generic prompt cleanup because it finds operationally stale guidance that can cause agents and humans to make incorrect changes.

## Decision

Tokn will treat **instruction drift detection** as a first-class pillar of `instructions-lint`.

Instruction drift means repository instruction files reference project facts that no longer appear to match the repository. Examples include:

- missing files or directories referenced by instruction text
- missing scripts, commands, or package-manager targets
- missing symbols, functions, classes, APIs, or config keys
- stale architecture names that have been replaced by newer source concepts
- cross-file instruction contradictions where one instruction file describes an older workflow and another describes the current one

This pillar stays read-only. Tokn should report evidence and likely impact, not rewrite instruction files.

## Product Boundary

Instruction drift detection is separate from compactness and prose quality.

- Compactness asks: "Is this instruction load too large or repetitive?"
- Clarity asks: "Is this instruction easy for an agent to follow?"
- Compatibility asks: "Will this instruction file load on the intended surface?"
- Drift asks: "Does this instruction still match the repository?"

Tokn should prioritize drift checks that are deterministic and locally verifiable before attempting semantic inference.

## MVP Direction

The first implementation should focus on low-risk reference checks:

1. Extract code-like references from instruction files:
   - paths such as `src/core/storage/utils/state-helpers.ts`
   - commands such as `npm run protos`
   - symbols such as `readGlobalStateFromDisk()`
   - config keys such as `context.globalState`
2. Resolve references against local repository files.
3. Report missing or suspicious references with structured evidence.
4. Keep confidence levels explicit.
5. Allow suppressions and baselines like other `instructions-lint` findings.

Initial rule IDs can be narrow:

- `missing-file-reference`
- `missing-command-reference`
- `missing-symbol-reference`
- `stale-instruction-reference`

Rules should start as warnings unless the evidence is unambiguous.

## Non-Goals

- Do not require network access.
- Do not execute arbitrary commands from instruction files.
- Do not infer correctness from language model calls.
- Do not rewrite instructions.
- Do not flag every unknown noun as stale.
- Do not turn Tokn into a full static-analysis engine.

## Consequences

This gives Tokn a sharper product story: instruction files are not just context budget. They are executable-adjacent guidance for agents and developers, and they can drift like code comments, docs, and runbooks.

It also changes the roadmap. Future work should invest in repository reference extraction, symbol indexing, and command validation before adding broad style rules.

The feature must remain conservative. A small number of high-confidence stale guidance findings is more valuable than a large number of speculative warnings.
