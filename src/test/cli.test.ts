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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orqis-cli-check-"));
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
