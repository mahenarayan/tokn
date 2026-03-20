import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const cliPath = path.join(rootDir, "dist", "cli.js");

function runCli(args: string[]): string {
  return execFileSync("node", [cliPath, ...args], {
    cwd: rootDir,
    encoding: "utf8"
  }).trim();
}

function readGolden(name: string): string {
  return fs.readFileSync(path.join(rootDir, "fixtures", "golden", name), "utf8").trim();
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
