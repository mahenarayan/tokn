# Instruction Drift Detection

Instruction drift happens when an instruction file still describes an older version of the repository.

This is different from a style issue. A stale instruction can send agents and contributors toward the wrong API, command, file path, or architecture boundary.

## Example

A repository instruction says:

```markdown
Adding a global state key requires reading from `context.globalState.get()` in
`readGlobalStateFromDisk()`.
```

But the repository implementation has moved to file-backed storage:

```text
src/core/storage/utils/state-helpers.ts
readGlobalStateFromStorage()
StateManager.getGlobalStateKey()
StateManager.setGlobalState()
```

The instruction is now stale. It can cause future agent edits to use legacy APIs even though the current codebase has moved on.

## Why This Matters

Instruction files are recurring model input. When they drift, every coding agent using them can repeat the same outdated assumption.

Good drift findings are usually more valuable than generic wording feedback because they point to a concrete mismatch:

- a referenced file no longer exists
- a referenced function or command no longer exists
- a rule describes a workflow that another instruction file has superseded
- a global instruction points agents at an old architecture boundary

## Tokn Checks Today

Tokn treats drift detection as a first-class `instructions-lint` pillar.

The initial feature set is deterministic and local:

- extract paths, commands, symbols, and config keys from instruction files
- check whether referenced files exist
- check whether package scripts or common commands exist without executing them
- check whether referenced symbols appear in the repository
- report structured evidence and confidence

Current rule IDs:

| Rule | Purpose |
| --- | --- |
| `missing-file-reference` | instruction references a file or directory that does not exist |
| `missing-command-reference` | instruction references a package script or command target that is not defined |
| `missing-symbol-reference` | instruction references a code symbol that cannot be found locally |

Tokn intentionally does not try to infer every stale architecture sentence. It checks explicit local references first because those findings are reviewable, suppressible, and suitable for CI.

## What Good Looks Like

A useful finding should read like this:

```text
[warning] missing-symbol-reference at .github/copilot-instructions.md:47
Problem: Instruction references `readGlobalStateFromDisk()`, but no matching symbol was found.
Fix: Update the instruction to the current storage flow or suppress this finding if the reference is intentional.
Evidence: symbol=readGlobalStateFromDisk | searched=repository | related=src/core/storage/utils/state-helpers.ts
```

The goal is not to flag every unknown word. The goal is to find stale guidance with enough evidence that a maintainer can act on it quickly.
