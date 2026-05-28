# Instruction Lint Subsystem

This directory contains the stable `instructions-lint` engine.

## Files

- `lint.ts`: executable lint pipeline, rule evaluation, coverage, policy post-processing, and report assembly
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
`lint.ts` answers "which parsed facts make a rule fire?".

Local rules should use only one parsed instruction file. Cross-file and target-load rules should run after scope resolution because they depend on matched repository files and instruction overlap.
