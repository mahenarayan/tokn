# Instructions Lint Demo Commands

Use this when you want a polished live demo flow for `instructions-lint` across both local fixtures and real public repositories.

## One Command Runner

Run the ready-made demo file from the repository root:

```bash
bash scripts/instructions-lint-demo.sh local
bash scripts/instructions-lint-demo.sh public
bash scripts/instructions-lint-demo.sh all
```

The script:

- builds `dist/cli.js` if needed
- clones a verified public repo set into `DEMO_ROOT` when required
- runs both passing and failing cases
- prints the command label and resulting exit code so the demo stays readable

## Verified Public Repos

These repos were verified on April 20, 2026 to contain GitHub Copilot instruction files:

- [rollup/rollup](https://github.com/rollup/rollup/blob/master/.github/copilot-instructions.md)
- [vitest-dev/vitest](https://github.com/vitest-dev/vitest/blob/main/.github/copilot-instructions.md)
- [forem/forem](https://github.com/forem/forem/blob/main/.github/copilot-instructions.md)
- [eclipse-theia/theia](https://github.com/eclipse-theia/theia/blob/master/.github/instructions/theia-coding.instructions.md)
- [camunda/camunda](https://github.com/camunda/camunda/blob/main/.github/instructions/ci-mcp-tooling.instructions.md)
- [microsoft/PowerToys](https://github.com/microsoft/PowerToys/blob/main/.github/copilot-instructions.md)

## Demo Flow

Use the local suite first:

- baseline pass
- invalid fixture with structured evidence
- coding-agent surface with model aware token share
- markdown output for PR style review

Then switch to the public suite:

- repository level instruction examples
- path specific instruction examples
- multiple surfaces
- both text and markdown output

If you want a local non-Copilot example during the same demo, run:

```bash
node dist/cli.js instructions-lint fixtures/instructions/agents-repo --preset agents-md
```

## Notes

- Public repos are cloned with `--depth 1 --filter=blob:none` to keep setup lighter.
- Set `DEMO_ROOT` if you want a persistent clone location:

```bash
DEMO_ROOT="$HOME/demo/tokn" bash scripts/instructions-lint-demo.sh public
```
