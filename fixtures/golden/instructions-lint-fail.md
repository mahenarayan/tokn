# Orqis Instructions Lint Report

## Summary
- Status: fail
- Profile: standard
- Fail on severity: error
- Files: 7
- Statements: 13
- Chars: 1730
- Matched scope files: 27
- Findings: 15 (4 errors, 11 warnings)

## Files
| File | Kind | Apply To | Chars | Statements | Matched | Findings |
| --- | --- | --- | --- | --- | --- | --- |
| .github/copilot-instructions.md | repository-wide | - | 1282 | 7 | 12 | 10 |
| .github/instructions/all.instructions.md | path-specific | ** | 83 | 1 | 12 | 1 |
| .github/instructions/legacy.md | unsupported | - | 39 | 1 | 0 | 1 |
| .github/instructions/no-frontmatter.instructions.md | path-specific | - | 74 | 1 | 0 | 1 |
| .github/instructions/rust.instructions.md | path-specific | **/*.rs | 74 | 1 | 0 | 1 |
| .github/instructions/semicolons.instructions.md | path-specific | **/*.ts, **/*.tsx | 95 | 1 | 2 | 1 |
| .github/instructions/style.instructions.md | path-specific | app/**/*.tsx | 83 | 1 | 1 | 0 |

## Findings
- **error** `.github/copilot-instructions.md:10` `order-dependent-wording`: Instruction relies on relative ordering, but Copilot does not guarantee instruction-file order across all surfaces.
- **error** `.github/instructions/all.instructions.md:2` `global-applyto-overlap`: Path-specific instruction file uses applyTo: "**" even though a repository-wide copilot-instructions.md file already exists.
- **error** `.github/instructions/legacy.md:1` `invalid-file-path`: Instruction file path is not a supported GitHub Copilot instructions location.
- **error** `.github/instructions/no-frontmatter.instructions.md:1` `missing-frontmatter`: Path-specific instruction files must start with YAML frontmatter containing applyTo.
- **warning** `.github/copilot-instructions.md:3` `exact-duplicate-statement`: Instruction duplicates .github/instructions/all.instructions.md:6 across overlapping scope.
- **warning** `.github/copilot-instructions.md:4` `high-similarity-statement`: Instruction is highly similar to .github/instructions/style.instructions.md:6 across overlapping scope.
- **warning** `.github/copilot-instructions.md:4` `possible-conflict`: Instruction may conflict with .github/instructions/semicolons.instructions.md:6 because overlapping files express opposite polarity for the same subject.
- **warning** `.github/copilot-instructions.md:4` `repo-wide-scoped-topics`: Repository-wide instructions mix in multiple scoped topics that likely belong in path-specific instruction files.
- **warning** `.github/copilot-instructions.md:10` `paragraph-narrative`: Paragraph-style narrative is harder for Copilot to scan than short atomic directives.
- **warning** `.github/copilot-instructions.md:10` `statement-too-long`: Instruction statement uses 36 words and exceeds the standard profile budget of 30.
- **warning** `.github/copilot-instructions.md:10` `vague-instruction`: Instruction is too generic to add repository-specific value.
- **warning** `.github/copilot-instructions.md:10` `weak-modal-phrasing`: Instruction uses weak modal phrasing that is easy for Copilot to ignore or interpret loosely.
- **warning** `.github/copilot-instructions.md:12` `oversized-code-example`: Code example is large enough to crowd out higher-signal instruction text.
- **warning** `.github/instructions/rust.instructions.md:2` `stale-applyto`: applyTo patterns do not match any repository files.
- **warning** `.github/instructions/semicolons.instructions.md:6` `possible-conflict`: Instruction may conflict with .github/instructions/style.instructions.md:6 because overlapping files express opposite polarity for the same subject.

## Warnings
- .github/instructions/rust.instructions.md applyTo patterns do not match any repository files.
