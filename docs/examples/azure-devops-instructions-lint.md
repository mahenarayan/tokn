# Azure DevOps Instructions Lint

This example shows how to start using Tokn in Azure DevOps Services without adding a custom extension.

Tokn does not modify files and runs offline during analysis. The pipeline needs network access only to install the package unless your organization mirrors `@tokn-labs/tokn` into an internal npm feed.

## Minimal Gate

```yaml
trigger:
  branches:
    include:
      - main

pool:
  vmImage: ubuntu-latest

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: 22.x

  - script: |
      npm exec --yes --package @tokn-labs/tokn -- tokn instructions-lint . \
        --format azure \
        --fail-on-severity warning
    displayName: Lint repository instructions
```

Use this when the repository already has a small instruction set and you are ready to fail the build on warnings.

## Enterprise Rollout

Most enterprise teams should start with a baseline. That lets the first PR introduce visibility without blocking every existing issue.

Create `tokn.config.json`:

```json
{
  "$schema": "https://github.com/mahenarayan/tokn/blob/main/schemas/tokn-config.schema.json",
  "instructionsLint": {
    "rollout": {
      "stage": "advisory",
      "owner": "platform-ai",
      "policyVersion": "2026.04"
    },
    "profile": "standard",
    "surface": "coding-agent",
    "failOnSeverity": "off",
    "ignore": ["generated/**", "vendor/**"],
    "baseline": "./.tokn/instructions-baseline.json"
  }
}
```

Generate the first baseline locally:

```bash
mkdir -p .tokn
tokn instructions-lint . --config ./tokn.config.json --format json > .tokn/instructions-baseline.json
```

Then use this Azure Pipelines job:

```yaml
trigger:
  branches:
    include:
      - main

pool:
  vmImage: ubuntu-latest

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: 22.x

  - script: |
      npm ci --ignore-scripts
    displayName: Install repository dependencies

  - script: |
      npm exec --yes --package @tokn-labs/tokn -- tokn instructions-lint . \
        --config ./tokn.config.json \
        --format azure
    displayName: Annotate new instruction findings

  - script: |
      mkdir -p "$(Build.ArtifactStagingDirectory)/tokn"
      npm exec --yes --package @tokn-labs/tokn -- tokn instructions-lint . \
        --config ./tokn.config.json \
        --format json \
        > "$(Build.ArtifactStagingDirectory)/tokn/instructions-lint.json"
    condition: always()
    displayName: Write instruction lint report

  - task: PublishPipelineArtifact@1
    condition: always()
    inputs:
      targetPath: "$(Build.ArtifactStagingDirectory)/tokn"
      artifact: tokn-instructions-lint
```

The first lint step annotates the build. The JSON artifact gives platform and architecture teams a stable report they can trend outside the pipeline.

The YAML uses standard Azure Pipelines pieces:

- `NodeTool@0` installs Node.js and adds it to `PATH`: <https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/node-tool-v0?view=azure-pipelines>
- `##vso[task.logissue ...]` emits build warnings and errors: <https://learn.microsoft.com/en-us/azure/devops/pipelines/scripts/logging-commands?view=azure-devops>
- `PublishPipelineArtifact@1` publishes the JSON report artifact: <https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/publish-pipeline-artifact-v1?view=azure-pipelines>

## When To Tighten

Start with:

- `profile: "standard"`
- `surface: "coding-agent"` if coding agents are the main concern
- `rollout.stage: "advisory"` and `failOnSeverity: "off"` while teams review the first reports
- `failOnSeverity: "warning"` only after the baseline is accepted

Tighten later by:

- moving `rollout.stage` from `advisory` to `baseline`, then `enforced`
- removing suppressions as owners clean up legacy files
- moving from `standard` to `strict` for stronger instruction sets
- adding `--model` when you want context window share reporting in the JSON artifact
