# Tokn Instruction Repair

Use this skill to repair Tokn `instructions-lint` findings in repository
instruction files while preserving the team's real engineering intent.

This is a harness-neutral workflow. It can be used by any assistant, agent, or
automation that can read Tokn findings, edit files, and run a verification
command.

## Purpose

Make repository instructions crisp, scoped, consistent, and deterministic.
Optimize signal before length. Token reduction should come from removing
duplication, ambiguity, stale scope, narrative filler, and oversized examples,
not from deleting useful guidance.

## Inputs

- Tokn `instructions-lint` findings in JSON, text, Markdown, GitHub, or Azure
  output.
- The instruction files referenced by findings.
- Nearby repository context only when needed to resolve scope or intent.
- The configured verification command, usually `tokn instructions-lint .`.

## Non-Goals

- Do not rewrite instructions with a different policy intent.
- Do not remove important requirements only to reduce token count.
- Do not invent repository conventions that are not evident from files or
  findings.
- Do not add new public Tokn config, schema, or tool-specific instruction
  surfaces unless the user explicitly asks for that.
- Do not suppress findings instead of fixing them unless there is a clear
  rollout or legacy-migration reason.

## Workflow

1. Read Tokn findings first and group them by file and rule ID.
2. Open each referenced instruction file before proposing edits.
3. Identify the intended rule behind each finding.
4. Preserve every unique requirement unless it is duplicated, contradictory,
   stale, or not actionable.
5. Prefer atomic bullets over paragraphs.
6. Prefer direct rules such as "Use X for Y" or "Do X when Y".
7. Consolidate duplicate or highly similar statements into one canonical rule
   in the narrowest applicable file.
8. Move path-specific guidance out of repository-wide files when the scope is
   clear and the harness supports scoped instruction files.
9. Resolve conflicts by choosing the more specific, safer, or more
   repository-evident rule. If intent is unclear, stop and report the decision
   needed.
10. Replace oversized code examples with compact patterns, anti-patterns, or
    references unless exact code is essential.
11. Run Tokn again and iterate until findings are fixed or explicitly justified.

## Rule Repair Guide

| Tokn rule | Repair approach |
| --- | --- |
| `vague-instruction` | Replace generic advice with repository-specific action. |
| `weak-modal-phrasing` | Replace optional phrasing with clear priority, condition, or requirement. |
| `statement-too-long` | Split into smaller directives without changing meaning. |
| `paragraph-narrative` | Convert prose into focused bullets. |
| `exact-duplicate-statement` | Keep one canonical copy in the most appropriate file. |
| `high-similarity-statement` | Merge overlapping rules or make the distinction explicit. |
| `possible-conflict` | Resolve into one consistent rule or report the unresolved decision. |
| `repo-wide-scoped-topics` | Move narrow guidance to path-specific instructions when supported. |
| `stale-applyto` | Update the glob or remove the stale instruction if the target no longer exists. |
| `applicable-token-budget` | Reduce repeated, broad, or low-signal instructions before deleting useful rules. |
| `oversized-code-example` | Replace with a short pattern, anti-pattern, or reference. |
| `malformed-frontmatter` | Fix frontmatter syntax and value types without changing instruction meaning. |
| `missing-frontmatter` | Add required frontmatter for path-specific instruction files. |
| `missing-applyto` | Add a deterministic `applyTo` glob or supported description activation. |
| `invalid-exclude-agent` | Replace unsupported values with supported surface names. |
| `global-applyto-overlap` | Narrow the path-specific glob or move the rule into repository-wide instructions. |
| `file-char-limit` | Compact the file for code-review usage without dropping unique requirements. |
| `invalid-file-path` | Move the instruction to a supported location or report that it is visibility-only. |
| `unsupported-agent-surface` | Leave visible unless the user asks to migrate to a supported surface. |

## Rewrite Principles

- Keep instructions imperative and observable.
- State conditions explicitly: language, path, package, framework, runtime,
  surface, or workflow.
- Remove filler such as "where possible", "best practices", "be mindful", and
  "try to" unless the uncertainty is intentional.
- Prefer one instruction per bullet.
- Keep examples short and representative.
- Use consistent terminology across files.
- Keep repository-wide files for global rules only.
- Keep scoped files for rules that apply to a clear path, language, package, or
  workflow.

## Output

Return:

- A short repair summary.
- The patch or edited files.
- Any unresolved decisions.
- Any intentionally preserved findings and why.
- The final Tokn verification command and result.

When the harness supports file edits, apply the patch directly. When it does
not, return a unified diff.
