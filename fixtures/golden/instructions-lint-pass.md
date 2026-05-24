# Tokn Instructions Lint Report

Status: **pass**

## Scope
- Preset: auto
- Detected presets: copilot
- Profile: standard
- Surface: all (all supported instruction surfaces)
- Fail threshold: error

## Summary
- Result: pass; no findings at or above fail threshold error
- Instruction files: 2 loaded of 2 scanned
- Active instruction text: 75 estimated tokens from 5 parsed statements
- Largest target load: 75 estimated tokens on src/component.tsx
- Target matches: 7 matched file references across instruction scopes
- Findings: 0 errors, 0 warnings

## Limits Used
- Profile standard: repository files <= 2500 chars / 650 estimated tokens
- Profile standard: path-specific files <= 2500 chars / 650 estimated tokens
- Profile standard: target load <= 2400 estimated tokens; statements <= 24 per file; statement length <= 50 words
- Conditional Copilot code review platform limit: 4000 chars per instruction file

## Terms
- Lint purpose: context and agent engineering for repository instruction files; code review is one supported surface.
- Surface: all means all supported instruction surfaces for this run.
- Statement: one parsed instruction directive, counted from a bullet, numbered item, or paragraph block.
- Applicable: loaded for the selected surface (all) and eligible for matching target files.
- Target load: total active instruction tokens that can apply to one repository file.
- Estimated tokens: local approximation for context pressure, not provider billing.

## Instruction Files
| File | Kind | Preset | Status | Tokens | Statements | Matched | Findings | Scope |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| .github/copilot-instructions.md | repository-wide | copilot | active | 46 | 3 | 5 | 0 | - |
| .github/instructions/typescript.instructions.md | path-specific | copilot | active | 29 | 2 | 2 | 0 | applyTo=**/*.ts,**/*.tsx |

## Coverage Map
- Targets covered: 5 of 5 repository files
- Uncovered targets: 0

Top non-instruction target loads:

| Target | Tokens | Instruction files | Instructions |
| --- | --- | --- | --- |
| src/component.tsx | 75 | 2 | .github/copilot-instructions.md, .github/instructions/typescript.instructions.md |
| src/index.ts | 75 | 2 | .github/copilot-instructions.md, .github/instructions/typescript.instructions.md |
| docs/guide.md | 46 | 1 | .github/copilot-instructions.md |

## Findings
- none
