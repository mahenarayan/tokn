import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const cliPath = path.join(rootDir, "dist", "cli.js");

function runCliProcess(args: string[]) {
  return spawnSync("node", [cliPath, ...args], {
    cwd: rootDir,
    encoding: "utf8"
  });
}

function runCli(args: string[]): string {
  const result = runCliProcess(args);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function readGolden(name: string): string {
  return fs.readFileSync(path.join(rootDir, "fixtures", "golden", name), "utf8").trim();
}

function createInstructionRepo(
  files: Record<string, string>,
  prefix: string
): string {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  }
  return repoRoot;
}

function runCliJson(args: string[]): unknown {
  return JSON.parse(runCli(args));
}

test("cli inspect prints a composition report", () => {
  const output = runCli(["inspect", "fixtures/openai-request.json"]);

  assert.match(output, /Source: openai-messages/);
  assert.match(output, /Input tokens: 164 \(exact\)/);
  assert.match(output, /Segments:/);
  assert.match(output, /Declared tools:/);
});

test("cli diff prints the token delta for the added assistant turn", () => {
  const output = runCli(["diff", "fixtures/turn-1.json", "fixtures/turn-2.json"]);

  assert.match(output, /Before: 12 tokens/);
  assert.match(output, /Delta: \+15 tokens/);
  assert.match(output, /assistant turn 3: 0 -> 15 \(\+15\)/);
});

test("cli budget prints headroom and risk", () => {
  const output = runCli([
    "budget",
    "fixtures/anthropic-request.json",
    "--model",
    "claude-3-5-sonnet-latest"
  ]);

  assert.match(output, /Model: claude-3-5-sonnet-latest/);
  assert.match(output, /Remaining input headroom:/);
  assert.match(output, /Risk: low/);
});

test("cli agent-report prints per-agent totals", () => {
  const output = runCli(["agent-report", "fixtures/agent-snapshot.json"]);

  assert.match(output, /Agents:/);
  assert.match(output, /supervisor:/);
  assert.match(output, /worker-a:/);
  assert.match(output, /parent=supervisor/);
});

test("cli inspect matches golden output", () => {
  const output = runCli(["inspect", "fixtures/openai-request.json"]);
  assert.equal(output, readGolden("inspect-openai.txt"));
});

test("cli diff matches golden output", () => {
  const output = runCli(["diff", "fixtures/turn-1.json", "fixtures/turn-2.json"]);
  assert.equal(output, readGolden("diff-turns.txt"));
});

test("cli budget matches golden output", () => {
  const output = runCli([
    "budget",
    "fixtures/anthropic-request.json",
    "--model",
    "claude-3-5-sonnet-latest"
  ]);
  assert.equal(output, readGolden("budget-anthropic.txt"));
});

test("cli agent-report matches golden output", () => {
  const output = runCli(["agent-report", "fixtures/agent-snapshot.json"]);
  assert.equal(output, readGolden("agent-report.txt"));
});

test("cli inspect supports OpenAI Responses-style fixtures", () => {
  const output = runCli(["inspect", "fixtures/openai-responses-request.json"]);

  assert.match(output, /Source: openai-responses/);
  assert.match(output, /instructions/);
  assert.match(output, /attachment/);
});

test("cli inspect supports OpenAI-compatible chat log fixtures", () => {
  const output = runCli(["inspect", "fixtures/openai-compatible-chat-log.json"]);

  assert.match(output, /Source: openai-compatible-request-log/);
  assert.match(output, /Provider: openai/);
  assert.match(output, /Wrapped request body extracted from request_body/);
});

test("cli inspect supports OpenAI-compatible responses log fixtures", () => {
  const output = runCli(["inspect", "fixtures/openai-compatible-responses-log.json"]);

  assert.match(output, /Source: openai-compatible-request-log/);
  assert.match(output, /Provider: openai/);
  assert.match(output, /Wrapped request body extracted from body/);
});

test("cli agent-report supports trace fixtures", () => {
  const output = runCli(["agent-report", "fixtures/openinference-trace.json"]);

  assert.match(output, /planner:/);
  assert.match(output, /worker-a:/);
  assert.match(output, /parent=planner/);
});

test("cli inspect supports Langfuse trace fixtures", () => {
  const output = runCli(["inspect", "fixtures/langfuse-trace.json"]);

  assert.match(output, /Source: langfuse-trace/);
  assert.match(output, /Agent planner/);
  assert.match(output, /Agent worker-a/);
});

test("cli agent-report supports Langfuse trace fixtures", () => {
  const output = runCli(["agent-report", "fixtures/langfuse-trace.json"]);

  assert.match(output, /planner:/);
  assert.match(output, /worker-a:/);
  assert.match(output, /parent=planner/);
});

test("cli inspect supports --json", () => {
  const output = runCliJson(["inspect", "fixtures/openai-request.json", "--json"]) as Record<string, unknown>;

  assert.equal(output.sourceType, "openai-messages");
  assert.equal(output.totalInputTokens, 164);
  assert.ok(Array.isArray(output.segments));
});

test("cli diff supports --json", () => {
  const output = runCliJson(["diff", "fixtures/turn-1.json", "fixtures/turn-2.json", "--json"]) as Record<string, unknown>;

  assert.equal(output.totalDelta, 15);
  assert.ok(Array.isArray(output.entries));
});

test("cli budget supports --json", () => {
  const output = runCliJson([
    "budget",
    "--json",
    "fixtures/anthropic-request.json",
    "--model",
    "claude-3-5-sonnet-latest"
  ]) as Record<string, unknown>;

  assert.equal(output.model, "claude-3-5-sonnet-latest");
  assert.equal(output.risk, "low");
  assert.equal(output.contextWindow, 200000);
});

test("cli agent-report supports --json", () => {
  const output = runCliJson(["agent-report", "--json", "fixtures/agent-snapshot.json"]) as Record<string, unknown>;

  assert.ok(Array.isArray(output.agents));
  assert.equal((output.agents as unknown[]).length, 2);
});

test("cli inspect prints suggestions for high-pressure payloads", () => {
  const output = runCli(["inspect", "fixtures/suggestions-high-pressure.json"]);

  assert.match(output, /Suggestions:/);
  assert.match(output, /\[warning\] Tool schema uses/);
  assert.match(output, /\[warning\] Provider overhead accounts for/);
  assert.match(output, /\[warning\] Input usage is at/);
});

test("cli agent-report prints per-agent suggestions when present", () => {
  const output = runCli(["agent-report", "fixtures/agent-snapshot-suggestions.json"]);

  assert.match(output, /planner:/);
  assert.match(output, /suggestion: \[warning\] Tool schema uses/);
  assert.match(output, /worker-a:/);
});

test("cli inspect matches golden output for suggestions", () => {
  const output = runCli(["inspect", "fixtures/suggestions-high-pressure.json"]);
  assert.equal(output, readGolden("inspect-suggestions.txt"));
});

test("cli agent-report matches golden output for suggestions", () => {
  const output = runCli(["agent-report", "fixtures/agent-snapshot-suggestions.json"]);
  assert.equal(output, readGolden("agent-report-suggestions.txt"));
});

test("cli inspect --json includes suggestions", () => {
  const output = runCliJson(["inspect", "fixtures/suggestions-high-pressure.json", "--json"]) as Record<string, unknown>;

  assert.ok(Array.isArray(output.suggestions));
  assert.ok((output.suggestions as unknown[]).length > 0);
});

test("cli inspect supports --format markdown", () => {
  const output = runCli(["inspect", "fixtures/suggestions-high-pressure.json", "--format", "markdown"]);
  assert.equal(output, readGolden("inspect-suggestions.md"));
});

test("cli diff supports --format markdown", () => {
  const output = runCli(["diff", "fixtures/turn-1.json", "fixtures/turn-2.json", "--format", "markdown"]);
  assert.equal(output, readGolden("diff-turns.md"));
});

test("cli budget supports --format markdown", () => {
  const output = runCli([
    "budget",
    "fixtures/anthropic-request.json",
    "--model",
    "claude-3-5-sonnet-latest",
    "--format",
    "markdown"
  ]);
  assert.equal(output, readGolden("budget-anthropic.md"));
});

test("cli agent-report supports --format markdown", () => {
  const output = runCli([
    "agent-report",
    "fixtures/agent-snapshot-suggestions.json",
    "--format",
    "markdown"
  ]);
  assert.equal(output, readGolden("agent-report-suggestions.md"));
});

test("cli inspect supports --format json as an alias for json output", () => {
  const output = runCliJson(["inspect", "fixtures/openai-request.json", "--format", "json"]) as Record<string, unknown>;

  assert.equal(output.sourceType, "openai-messages");
  assert.equal(output.totalInputTokens, 164);
});

test("cli rejects conflicting --json and --format markdown", () => {
  const result = runCliProcess([
    "inspect",
    "fixtures/openai-request.json",
    "--json",
    "--format",
    "markdown"
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--json cannot be combined with a non-json --format/);
});

test("cli supports inline value flags", () => {
  const inspect = runCliJson([
    "inspect",
    "fixtures/openai-request.json",
    "--format=json"
  ]) as Record<string, unknown>;
  const lint = runCliJson([
    "instructions-lint",
    "fixtures/instructions/valid-repo",
    "--format=json",
    "--profile=strict"
  ]) as Record<string, unknown>;

  assert.equal(inspect.sourceType, "openai-messages");
  assert.equal(lint.profile, "strict");
});

test("cli rejects missing values for value flags", () => {
  const result = runCliProcess([
    "instructions-lint",
    "fixtures/instructions/valid-repo",
    "--profile"
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--profile requires a value/);
});

test("cli rejects inline values for boolean flags", () => {
  const result = runCliProcess([
    "inspect",
    "fixtures/openai-request.json",
    "--json=true"
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--json does not accept a value/);
});

test("cli rejects options that do not belong to the selected command", () => {
  const result = runCliProcess([
    "inspect",
    "fixtures/openai-request.json",
    "--profile",
    "strict"
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Option --profile is not supported for inspect/);
});

test("cli rejects extra positional arguments", () => {
  const result = runCliProcess([
    "inspect",
    "fixtures/openai-request.json",
    "fixtures/turn-1.json"
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /inspect received unexpected extra argument/);
});

test("cli prints help with success", () => {
  const result = runCliProcess(["--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /tokn <command> --help/);
  assert.match(result.stdout, /Examples:/);
});

test("cli prints subcommand help with examples", () => {
  const cases = [
    {
      command: "instructions-lint",
      example: "tokn instructions-lint ."
    },
    {
      command: "inspect",
      example: "tokn inspect ./fixtures/openai-request.json"
    },
    {
      command: "diff",
      example: "tokn diff ./fixtures/turn-1.json ./fixtures/turn-2.json"
    },
    {
      command: "budget",
      example: "tokn budget ./fixtures/anthropic-request.json --model claude-3-5-sonnet-latest"
    },
    {
      command: "agent-report",
      example: "tokn agent-report ./fixtures/agent-snapshot.json"
    },
    {
      command: "check",
      example: "tokn check ./fixtures/anthropic-request.json --model claude-3-5-sonnet-latest --max-total-tokens 100"
    }
  ];

  for (const { command, example } of cases) {
    const result = runCliProcess([command, "--help"]);
    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
    assert.match(result.stdout, /Usage:/, command);
    assert.match(result.stdout, /Options:/, command);
    assert.match(result.stdout, /Examples:/, command);
    assert.ok(result.stdout.includes(example), command);
  }
});

test("cli supports help command and short help for subcommands", () => {
  const helpCommand = runCliProcess(["help", "instructions-lint"]);
  const shortFlag = runCliProcess(["instructions-lint", "-h"]);

  assert.equal(helpCommand.status, 0, helpCommand.stderr);
  assert.match(helpCommand.stdout, /Tokn instructions-lint/);
  assert.match(helpCommand.stdout, /Examples:/);

  assert.equal(shortFlag.status, 0, shortFlag.stderr);
  assert.match(shortFlag.stdout, /Tokn instructions-lint/);
  assert.match(shortFlag.stdout, /Examples:/);
});

test("cli check passes when thresholds are satisfied", () => {
  const result = runCliProcess([
    "check",
    "fixtures/anthropic-request.json",
    "--model",
    "claude-3-5-sonnet-latest",
    "--max-total-tokens",
    "100",
    "--max-usage-percent",
    "1",
    "--fail-on-risk",
    "high"
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Status: pass/);
  assert.match(result.stdout, /Violations:\n- none/);
});

test("cli check fails with exit code 2 when thresholds are exceeded", () => {
  const result = runCliProcess([
    "check",
    "fixtures/suggestions-high-pressure.json",
    "--max-total-tokens",
    "100000",
    "--max-usage-percent",
    "80",
    "--max-segment-tokens",
    "tool_schema=300",
    "--fail-on-risk",
    "medium",
    "--baseline",
    "fixtures/anthropic-request.json"
  ]);

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /Status: fail/);
  assert.match(result.stdout, /Budget risk high meets or exceeds/);
  assert.match(result.stdout, /Baseline:/);
  assert.match(result.stdout, /delta vs baseline: \+111970 tokens/);
});

test("cli check matches golden output for pass case", () => {
  const output = runCli([
    "check",
    "fixtures/anthropic-request.json",
    "--model",
    "claude-3-5-sonnet-latest",
    "--max-total-tokens",
    "100",
    "--max-usage-percent",
    "1",
    "--fail-on-risk",
    "high"
  ]);

  assert.equal(output, readGolden("check-pass.txt"));
});

test("cli check matches golden output for failure case", () => {
  const result = runCliProcess([
    "check",
    "fixtures/suggestions-high-pressure.json",
    "--max-total-tokens",
    "100000",
    "--max-usage-percent",
    "80",
    "--max-segment-tokens",
    "tool_schema=300",
    "--fail-on-risk",
    "medium",
    "--baseline",
    "fixtures/anthropic-request.json"
  ]);

  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout.trim(), readGolden("check-fail.txt"));
});

test("cli check supports --json", () => {
  const result = runCliProcess([
    "check",
    "fixtures/suggestions-high-pressure.json",
    "--max-total-tokens",
    "100000",
    "--max-usage-percent",
    "80",
    "--max-segment-tokens",
    "tool_schema=300",
    "--fail-on-risk",
    "medium",
    "--baseline",
    "fixtures/anthropic-request.json",
    "--json"
  ]);

  assert.equal(result.status, 2, result.stderr);
  const output = JSON.parse(result.stdout) as Record<string, unknown>;
  assert.equal(output.passed, false);
  assert.equal(output.exitCode, 2);
  assert.ok(Array.isArray(output.violations));
});

test("cli check warns when model metadata is unavailable", () => {
  const result = runCliProcess([
    "check",
    "fixtures/unknown-model-request.json",
    "--max-usage-percent",
    "80",
    "--fail-on-risk",
    "medium"
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Warnings:/);
  assert.match(result.stdout, /Usage percent is unavailable/);
  assert.match(result.stdout, /Budget risk is unavailable/);
});

test("cli check accepts a stored ContextReport as baseline input", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokn-cli-check-"));
  const baselinePath = path.join(tempDir, "baseline-report.json");
  const baselineReport = runCliJson([
    "inspect",
    "fixtures/anthropic-request.json",
    "--json"
  ]);
  fs.writeFileSync(baselinePath, JSON.stringify(baselineReport, null, 2));

  const result = runCliProcess([
    "check",
    "fixtures/suggestions-high-pressure.json",
    "--max-total-tokens",
    "100000",
    "--baseline",
    baselinePath
  ]);

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /Baseline:/);
  assert.match(result.stdout, /source: anthropic-messages/);
});

test("cli check rejects unknown segment types", () => {
  const result = runCliProcess([
    "check",
    "fixtures/anthropic-request.json",
    "--max-segment-tokens",
    "unknown=10"
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown segment type/);
});

test("cli instructions-lint passes on a valid repository fixture", () => {
  const result = runCliProcess(["instructions-lint", "fixtures/instructions/valid-repo"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Tokn Instructions Lint: pass/);
  assert.match(result.stdout, /Preset: auto/);
  assert.match(result.stdout, /Detected presets: copilot/);
  assert.match(result.stdout, /Instruction files: 2 loaded of 2 scanned/);
  assert.match(result.stdout, /Limits Used:/);
  assert.match(result.stdout, /Statement: one parsed instruction directive/);
  assert.match(result.stdout, /Findings:\n- none/);
});

test("cli instructions-lint fails with exit code 2 on invalid repository fixture", () => {
  const result = runCliProcess(["instructions-lint", "fixtures/instructions/invalid-repo"]);

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /Tokn Instructions Lint: fail/);
  assert.match(result.stdout, /global-applyto-overlap/);
  assert.match(result.stdout, /invalid-file-path/);
});

test("cli instructions-lint reports known unsupported agent surfaces without failing the default gate", () => {
  const repoRoot = createInstructionRepo(
    {
      "package.json": "{}\n",
      "CLAUDE.md": "# Claude Code\n\n- Run npm test before committing.\n",
      ".cursor/rules/react.mdc": "# Cursor\n\n- Prefer function components for UI changes.\n"
    },
    "tokn-cli-agent-surfaces-"
  );

  const result = runCliProcess(["instructions-lint", repoRoot, "--format", "json"]);
  assert.equal(result.status, 0, result.stderr);

  const output = JSON.parse(result.stdout) as Record<string, unknown>;
  assert.equal(output.passed, true);

  const stats = output.stats as Record<string, unknown>;
  assert.equal(stats.unsupportedFiles, 2);

  const findings = output.findings as Array<Record<string, unknown>>;
  assert.equal(findings.length, 2);
  assert.ok(findings.every((finding) => finding.ruleId === "unsupported-agent-surface"));
  assert.ok(findings.every((finding) => finding.severity === "warning"));

  const strictResult = runCliProcess([
    "instructions-lint",
    repoRoot,
    "--fail-on-severity",
    "warning"
  ]);
  assert.equal(strictResult.status, 2, strictResult.stderr);
  assert.match(strictResult.stdout, /unsupported-agent-surface/);
});

test("cli instructions-lint matches golden output for pass case", () => {
  const output = runCli(["instructions-lint", "fixtures/instructions/valid-repo"]);
  assert.equal(output, readGolden("instructions-lint-pass.txt"));
});

test("cli instructions-lint matches golden output for failure case", () => {
  const result = runCliProcess(["instructions-lint", "fixtures/instructions/invalid-repo"]);

  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout.trim(), readGolden("instructions-lint-fail.txt"));
});

test("cli instructions-lint supports --json", () => {
  const result = runCliProcess([
    "instructions-lint",
    "fixtures/instructions/invalid-repo",
    "--json"
  ]);

  assert.equal(result.status, 2, result.stderr);
  const output = JSON.parse(result.stdout) as Record<string, unknown>;
  assert.equal(output.kind, "instructions-lint-report");
  assert.equal(output.schemaVersion, "instructions-lint-report/v1");
  assert.equal(output.schemaPath, "schemas/instructions-lint-report.schema.json");
  assert.equal(output.passed, false);
  assert.equal(output.exitCode, 2);
  assert.equal(output.preset, "auto");
  assert.ok(Array.isArray(output.files));
  assert.ok(Array.isArray(output.findings));

  const findings = output.findings as Array<Record<string, unknown>>;
  const duplicate = findings.find((finding) => finding.ruleId === "exact-duplicate-statement");
  const evidence = duplicate?.evidence as Record<string, unknown> | undefined;
  const relatedLocation = evidence?.relatedLocation as Record<string, unknown> | undefined;
  assert.equal(relatedLocation?.file, ".github/instructions/all.instructions.md");
  assert.equal(relatedLocation?.line, 6);
});

test("cli instructions-lint supports --config and includes rollout controls in json output", () => {
  const repoRoot = createInstructionRepo(
    {
      "tokn.config.json": JSON.stringify(
        {
          instructionsLint: {
            rollout: {
              stage: "baseline",
              owner: "platform-ai",
              policyVersion: "2026.04"
            },
            profile: "strict",
            rules: {
              "statement-too-long": { severity: "error" }
            },
            ignore: ["generated/**"]
          }
        },
        null,
        2
      ),
      ".github/copilot-instructions.md": [
        "# Repository Instructions",
        "",
        "- Keep exported interfaces explicit, spell out the constrained domain vocabulary for every repository-facing API change, include the compatibility rationale in each review note, and document migration impact so downstream teams can evaluate risk without asking for hidden context."
      ].join("\n"),
      "src/index.ts": "export const value = 1;\n",
      "generated/out.ts": "export const value = 2;\n"
    },
    "tokn-cli-config-"
  );

  const result = runCliProcess([
    "instructions-lint",
    repoRoot,
    "--config",
    path.join(repoRoot, "tokn.config.json"),
    "--format",
    "json"
  ]);
  assert.equal(result.status, 2, result.stderr);

  const output = JSON.parse(result.stdout) as Record<string, unknown>;

  const config = output.config as Record<string, unknown>;
  const stats = output.stats as Record<string, unknown>;
  const findings = output.findings as Array<Record<string, unknown>>;

  assert.equal(output.profile, "strict");
  assert.ok(String(config.source).endsWith("tokn.config.json"));
  assert.deepEqual(config.ignore, ["generated/**"]);
  assert.deepEqual(config.rollout, {
    stage: "baseline",
    owner: "platform-ai",
    policyVersion: "2026.04"
  });
  assert.equal(stats.ignoredTargetFileCount, 1);
  assert.equal(findings[0]?.severity, "error");
});

test("cli instructions-lint prints a calibrated starter config", () => {
  const result = runCliProcess([
    "instructions-lint",
    "fixtures/instructions/noise-regression-repo",
    "--init-config"
  ]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as Record<string, unknown>;
  const section = output.instructionsLint as Record<string, unknown>;
  const budgets = section.budgets as Record<string, unknown>;

  assert.equal(section.surface, "all");
  assert.equal(section.failOnSeverity, "warning");
  assert.equal((section.rollout as Record<string, unknown>).stage, "advisory");
  assert.equal(typeof budgets.pathSpecificChars, "number");
  assert.ok((budgets.pathSpecificChars as number) >= 2500);
});

test("cli init and calibrate print calibrated starter configs", () => {
  for (const command of ["init", "calibrate"]) {
    const result = runCliProcess([
      command,
      "fixtures/instructions/noise-regression-repo",
      "--surface",
      "coding-agent"
    ]);

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as Record<string, unknown>;
    const section = output.instructionsLint as Record<string, unknown>;
    const budgets = section.budgets as Record<string, unknown>;

    assert.equal(section.surface, "coding-agent");
    assert.equal(section.failOnSeverity, "warning");
    assert.equal(typeof budgets.maxApplicableTokens, "number");
  }
});

test("cli instructions-lint supports --baseline for incremental rollout", () => {
  const baselineDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokn-cli-baseline-"));
  const baselinePath = path.join(baselineDir, "baseline.json");
  const baselineResult = runCliProcess([
    "instructions-lint",
    "fixtures/instructions/invalid-repo",
    "--format",
    "json"
  ]);
  assert.equal(baselineResult.status, 2, baselineResult.stderr);
  fs.writeFileSync(baselinePath, baselineResult.stdout);

  const result = runCliProcess([
    "instructions-lint",
    "fixtures/instructions/invalid-repo",
    "--baseline",
    baselinePath,
    "--fail-on-severity",
    "warning"
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Baseline:/);
  assert.match(result.stdout, /Baseline-matched findings:/);
  assert.match(result.stdout, /Findings:\n- none/);
});

test("cli instructions-lint supports --format markdown", () => {
  const output = runCli([
    "instructions-lint",
    "fixtures/instructions/valid-repo",
    "--format",
    "markdown"
  ]);

  assert.equal(output, readGolden("instructions-lint-pass.md"));
});

test("cli instructions-lint supports markdown for failure output", () => {
  const result = runCliProcess([
    "instructions-lint",
    "fixtures/instructions/invalid-repo",
    "--format",
    "markdown"
  ]);

  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout.trim(), readGolden("instructions-lint-fail.md"));
});

test("cli instructions-lint renders structured evidence in text output", () => {
  const result = runCliProcess(["instructions-lint", "fixtures/instructions/invalid-repo"]);
  assert.equal(result.status, 2, result.stderr);
  const output = result.stdout.trim();

  assert.match(output, /Evidence: related=\.github\/instructions\/all\.instructions\.md:6/);
  assert.match(output, /patterns=\*\*\/\*\.rs/);
  assert.match(output, /matched=0/);
  assert.match(output, /Fix: /);
});

test("cli instructions-lint supports --format github", () => {
  const result = runCliProcess([
    "instructions-lint",
    "fixtures/instructions/invalid-repo",
    "--format",
    "github"
  ]);

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /::error file=\.github\/instructions\/legacy\.md,line=1,title=Tokn invalid-file-path::/);
  assert.match(result.stdout, /::warning file=\.github\/instructions\/rust\.instructions\.md,line=2,title=Tokn stale-applyto::/);
  assert.match(result.stdout, /::notice title=Tokn instructions-lint findings::/);
});

test("cli instructions-lint supports --format azure", () => {
  const result = runCliProcess([
    "instructions-lint",
    "fixtures/instructions/invalid-repo",
    "--format",
    "azure"
  ]);

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /##vso\[task\.logissue type=error;sourcepath=\.github\/instructions\/legacy\.md;linenumber=1;code=invalid-file-path;\]/);
  assert.match(result.stdout, /##vso\[task\.logissue type=warning;sourcepath=\.github\/instructions\/rust\.instructions\.md;linenumber=2;code=stale-applyto;\]/);
  assert.match(result.stdout, /##vso\[task\.logissue type=error;code=tokn-instructions-lint-summary;\]Tokn instructions-lint found issues:/);
});

test("cli instructions-lint supports single-file lint", () => {
  const output = runCli([
    "instructions-lint",
    "fixtures/instructions/valid-repo/.github/instructions/typescript.instructions.md"
  ]);

  assert.match(output, /typescript.instructions.md/);
  assert.match(output, /2 matched files/);
});

test("cli instructions-lint supports preset-aware AGENTS.md linting", () => {
  const output = runCli([
    "instructions-lint",
    "fixtures/instructions/agents-repo",
    "--preset",
    "agents-md"
  ]);

  assert.match(output, /Detected presets: agents-md/);
  assert.match(output, /frontend\/AGENTS\.md/);
  assert.match(output, /scope=frontend/);
});

test("cli instructions-lint supports --surface and only applies the 4000-char rule to code-review", () => {
  const repoRoot = createInstructionRepo(
    {
      ".github/copilot-instructions.md": `# Repository Instructions\n\n- ${"use precise domain language ".repeat(220)}`,
      "src/index.ts": "export const value = 1;\n"
    },
    "tokn-cli-instructions-surface-"
  );

  const defaultAll = runCliProcess(["instructions-lint", repoRoot]);
  const codeReview = runCliProcess(["instructions-lint", repoRoot, "--surface", "code-review"]);
  const chat = runCliProcess(["instructions-lint", repoRoot, "--surface", "chat"]);

  assert.equal(defaultAll.status, 0, defaultAll.stderr);
  assert.equal(codeReview.status, 2, codeReview.stderr);
  assert.equal(chat.status, 0, chat.stderr);
  assert.match(defaultAll.stdout, /Surface: all/);
  assert.match(codeReview.stdout, /Surface: code-review/);
  assert.match(chat.stdout, /Surface: chat/);
  assert.match(defaultAll.stdout, /file-char-limit/);
  assert.match(defaultAll.stdout, /would exceed GitHub Copilot code review/);
  assert.match(codeReview.stdout, /file-char-limit/);
  assert.doesNotMatch(chat.stdout, /file-char-limit/);
});

test("cli instructions-lint supports --model for context share reporting", () => {
  const output = runCliJson([
    "instructions-lint",
    "fixtures/instructions/valid-repo",
    "--model",
    "gpt-4o",
    "--format",
    "json"
  ]) as Record<string, unknown>;

  assert.equal(output.model, "gpt-4o");
  assert.equal(output.contextWindow, 128000);
  assert.equal(output.surface, "all");
});

test("cli instructions-lint respects --fail-on-severity", () => {
  const defaultResult = runCliProcess([
    "instructions-lint",
    "fixtures/instructions/verbose-repo",
    "--profile",
    "strict"
  ]);
  const warningResult = runCliProcess([
    "instructions-lint",
    "fixtures/instructions/verbose-repo",
    "--profile",
    "strict",
    "--fail-on-severity",
    "warning"
  ]);

  assert.equal(defaultResult.status, 0, defaultResult.stderr);
  assert.equal(warningResult.status, 2, warningResult.stderr);
  assert.match(warningResult.stdout, /statement-too-long/);
});

test("cli instructions-lint supports advisory fail threshold", () => {
  const result = runCliProcess([
    "instructions-lint",
    "fixtures/instructions/invalid-repo",
    "--fail-on-severity",
    "off"
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Tokn Instructions Lint: advisory/);
  assert.match(result.stdout, /Fail threshold: off/);
  assert.match(result.stdout, /invalid-file-path/);
});
