# Instruction Lint Subsystem

This directory contains the stable `instructions-lint` engine. The code is
organized as a deterministic analysis pipeline: discovery, parsing, local
checks, scope composition, cross-file checks, policy filtering, and report
assembly.

## Files

- `lint.ts`: executable lint pipeline, file parsing, and report assembly
- `internal.ts`: shared internal report model, surface helpers, grouping, and deterministic sort helpers
- `findings.ts`: finding construction, default confidence, and sorting
- `policy.ts`: config/CLI policy resolution, fail thresholds, suppressions, baselines, and final finding policy
- `scope.ts`: matched-file resolution, scope findings, coverage analysis, and coverage map assembly
- `rule-checks.ts`: deterministic local, cross-file, and target-load rule execution
- `discovery.ts`: path normalization, repository-root inference, candidate discovery, and preset classification
- `markdown.ts`: frontmatter parsing, Markdown block parsing, and statement extraction
- `text.ts`: shared word counting, statement tokenization, negation detection, and similarity helpers
- `limits.ts`: profile budgets and platform limits
- `rules.ts`: stable rule registry with IDs, categories, default severities, preset metadata, and surface metadata
- `config.ts`: config discovery and normalization for `tokn.config.json` and `.toknrc.json`

## Pipeline

`lintInstructions` is the public entry point. Internally it runs these deterministic passes:

1. Resolve policy from config and CLI options.
2. Collect instruction candidates and visible repository files.
3. Parse frontmatter, Markdown blocks, and normalized statements.
4. Run local file rules against one instruction file at a time.
5. Resolve path scopes, matched targets, and coverage.
6. Run cross-file and target-load rules that require composed repository context.
7. Apply rule overrides, suppressions, and baselines.
8. Assemble the versioned `InstructionLintReport`.

## Rule Composition

Rule metadata and executable rule logic are intentionally separate.

`rules.ts` answers "what public rule IDs exist?".
`policy.ts` answers "which rollout/config decisions affect the lint run?".
`scope.ts` answers "which instruction files apply to which repository files?".
`rule-checks.ts` answers "which parsed facts make a rule fire?".
`lint.ts` answers "which deterministic passes run, in what order?".

Local rules should use only one parsed instruction file. Cross-file and target-load rules should run after scope resolution because they depend on matched repository files and instruction overlap.

## Change Guidelines

- Put new public rule IDs and metadata in `rules.ts`.
- Put config parsing, option precedence, suppression, baseline, and severity policy in `policy.ts` or `config.ts`.
- Put file discovery and preset classification in `discovery.ts`.
- Put target matching, coverage, and scope-derived findings in `scope.ts`.
- Put executable lint checks in `rule-checks.ts`; keep formatters out of rule decisions.
- Add or update feature-level tests in `src/test/` when changing a pass. Golden output changes should be intentional because CLI text is product surface.

Avoid changing `InstructionLintReport`, config schemas, or exported types as an incidental refactor. Those are public contracts and should be reviewed as API changes.
