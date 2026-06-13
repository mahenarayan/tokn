# Cline Instruction Drift Case Study

This is a small public example of instruction drift being fixed in a real repository.

PR: [cline/cline#11025](https://github.com/cline/cline/pull/11025)

## What Drift Looked Like

The repository guidance still pointed contributors toward an older global-state storage flow after the implementation had moved to file-backed `StateManager` storage.

That kind of mismatch is easy to miss because instruction files read like documentation, but coding agents treat them as recurring context.

## Why It Matters

Stale instructions can make future agent edits repeat outdated assumptions:

- use an old API or storage boundary
- reference a moved file
- ask contributors to run a command that no longer exists
- preserve a workflow the codebase has already replaced

## How Tokn Frames This

Tokn does not claim to prove semantic correctness. Its drift checks are intentionally narrower:

- explicit file and directory references
- explicit package-script references
- explicit backticked symbol references
- structured evidence and confidence in the finding

The Cline PR is useful as a proof point for the problem class: repository instructions can drift from implementation, and a deterministic linter can help teams review that layer more deliberately.
