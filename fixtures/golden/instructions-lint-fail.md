# Tokn Instructions Lint Report

Status: **fail**

## Scope
- Preset: auto
- Detected presets: copilot
- Profile: standard
- Surface: code-review
- Fail threshold: error

## Summary
- Files: 7 total, 6 applicable
- Statements: 13 total, 12 applicable
- Size: 1730 chars, 441 estimated tokens (430 applicable)
- Matched target files: 20
- Largest applicable load: 392 tokens on app/view.tsx
- Findings: 15 total, 4 errors, 11 warnings

## Instruction Files
| File | Kind | Preset | Status | Tokens | Statements | Matched | Findings | Scope |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| .github/copilot-instructions.md | repository-wide | copilot | active | 323 | 7 | 12 | 10 | - |
| .github/instructions/all.instructions.md | path-specific | copilot | active | 22 | 1 | 5 | 1 | applyTo=** |
| .github/instructions/legacy.md | unsupported | unknown | not loaded | 11 | 1 | 0 | 1 | - |
| .github/instructions/no-frontmatter.instructions.md | path-specific | copilot | active | 19 | 1 | 0 | 1 | - |
| .github/instructions/rust.instructions.md | path-specific | copilot | active | 19 | 1 | 0 | 1 | applyTo=**/*.rs |
| .github/instructions/semicolons.instructions.md | path-specific | copilot | active | 25 | 1 | 2 | 1 | applyTo=**/*.ts,**/*.tsx |
| .github/instructions/style.instructions.md | path-specific | copilot | active | 22 | 1 | 1 | 0 | applyTo=app/**/*.tsx |

## Findings
- **error** `order-dependent-wording` at `.github/copilot-instructions.md:10`
  Problem: Instruction relies on relative ordering, but instruction runtimes do not guarantee file order across surfaces and presets.
  Fix: Rewrite the instruction so it stands alone without referring to rules above or below.
- **error** `global-applyto-overlap` at `.github/instructions/all.instructions.md:2`
  Problem: Path-specific instruction file uses applyTo: "**" even though a repository-wide copilot-instructions.md file already exists.
  Fix: Keep repository-wide guidance in .github/copilot-instructions.md and narrow applyTo to a real subset.
  Evidence: `related=.github/copilot-instructions.md:1` `patterns=**` `matched=5` `matched_sample=app/view.tsx,db/query.sql,docs/readme.md`
- **error** `invalid-file-path` at `.github/instructions/legacy.md:1`
  Problem: Instruction file path does not match a supported instruction preset location.
  Fix: Use .github/copilot-instructions.md, .github/instructions/*.instructions.md, or AGENTS.md.
- **error** `missing-frontmatter` at `.github/instructions/no-frontmatter.instructions.md:1`
  Problem: Path-specific instruction files must start with YAML frontmatter containing applyTo.
  Fix: Add frontmatter like --- applyTo: "**/*.ts" --- at the top of the file.
- **warning** `exact-duplicate-statement` at `.github/copilot-instructions.md:3`
  Problem: Instruction duplicates .github/instructions/all.instructions.md:6 across overlapping scope.
  Fix: Keep the rule in one file or narrow applyTo so the same instruction is not sent twice.
  Evidence: `related=.github/instructions/all.instructions.md:6` `overlap=5` `overlap_sample=app/view.tsx,db/query.sql,docs/readme.md` `similarity=100.0%`
- **warning** `high-similarity-statement` at `.github/copilot-instructions.md:4`
  Problem: Instruction is highly similar to .github/instructions/style.instructions.md:6 across overlapping scope.
  Fix: Merge the rules or remove the lower-signal variant.
  Evidence: `related=.github/instructions/style.instructions.md:6` `overlap=1` `overlap_sample=app/view.tsx` `similarity=100.0%`
- **warning** `possible-conflict` at `.github/copilot-instructions.md:4`
  Problem: Instruction may conflict with .github/instructions/semicolons.instructions.md:6 because overlapping files express opposite polarity for the same subject.
  Fix: Consolidate the rule or make the scope separation explicit.
  Evidence: `related=.github/instructions/semicolons.instructions.md:6` `overlap=2` `overlap_sample=app/view.tsx,src/index.ts` `similarity=100.0%`
- **warning** `repo-wide-scoped-topics` at `.github/copilot-instructions.md:4`
  Problem: Repository-scoped instructions mix in multiple scoped topics that likely belong in narrower instruction files.
  Fix: Move language-, path-, or subsystem-specific rules into narrower scoped instruction files.
- **warning** `paragraph-narrative` at `.github/copilot-instructions.md:10`
  Problem: Paragraph-style narrative is harder for instruction runtimes to scan than short atomic directives.
  Fix: Break this paragraph into short bullet rules.
- **warning** `statement-too-long` at `.github/copilot-instructions.md:10`
  Problem: Instruction statement uses 36 words and exceeds the standard profile budget of 30.
  Fix: Rewrite as one short directive with only the necessary why.
  Evidence: `actual=36` `expected=30`
- **warning** `vague-instruction` at `.github/copilot-instructions.md:10`
  Problem: Instruction is too generic to add repository-specific value.
  Fix: Replace generic quality advice with concrete repository rules, preferred tools, or explicit examples.
- **warning** `weak-modal-phrasing` at `.github/copilot-instructions.md:10`
  Problem: Instruction uses weak modal phrasing that is easy for assistants to ignore or interpret loosely.
  Fix: Use direct imperative wording instead of try to, should consider, or best effort language.
- **warning** `oversized-code-example` at `.github/copilot-instructions.md:12`
  Problem: Code example is large enough to crowd out higher-signal instruction text.
  Fix: Keep examples minimal and only show the pattern that Copilot must prefer or avoid.
- **warning** `stale-applyto` at `.github/instructions/rust.instructions.md:2`
  Problem: applyTo patterns do not match any repository files.
  Fix: Update the glob patterns or delete the file if the scope no longer exists.
  Evidence: `patterns=**/*.rs` `matched=0`
- **warning** `possible-conflict` at `.github/instructions/semicolons.instructions.md:6`
  Problem: Instruction may conflict with .github/instructions/style.instructions.md:6 because overlapping files express opposite polarity for the same subject.
  Fix: Consolidate the rule or make the scope separation explicit.
  Evidence: `related=.github/instructions/style.instructions.md:6` `overlap=1` `overlap_sample=app/view.tsx` `similarity=100.0%`

## Warnings
- .github/instructions/rust.instructions.md applyTo patterns do not match any repository files.
