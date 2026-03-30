import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { analyzeAgentSnapshot, analyzePayload, diffReports } from "../index.js";

const rootDir = process.cwd();

function readFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "fixtures", name), "utf8"));
}

test("fixture: openai request reports exact usage and provider overhead", () => {
  const report = analyzePayload(readFixture("openai-request.json"));

  assert.equal(report.sourceType, "openai-messages");
  assert.equal(report.totalInputTokens, 164);
  assert.equal(report.totalConfidence, "exact");
  assert.ok(report.segments.some((segment) => segment.type === "provider_overhead"));
  assert.ok(report.segments.some((segment) => segment.type === "tool_schema"));
});

test("fixture: anthropic request reports tokenizer-based budget", () => {
  const report = analyzePayload(readFixture("anthropic-request.json"));

  assert.equal(report.sourceType, "anthropic-messages");
  assert.equal(report.provider, "anthropic");
  assert.equal(report.totalConfidence, "tokenizer-based");
  assert.equal(report.budget.model, "claude-3-5-sonnet-latest");
});

test("fixture: transcript diff isolates the added assistant turn", () => {
  const before = analyzePayload(readFixture("turn-1.json"));
  const after = analyzePayload(readFixture("turn-2.json"));
  const diff = diffReports(before, after);

  assert.equal(diff.totalDelta, after.totalInputTokens - before.totalInputTokens);
  assert.deepEqual(
    diff.entries.map((entry) => entry.label),
    ["assistant turn 3"]
  );
});

test("fixture: multimodal request expands into typed content segments", () => {
  const report = analyzePayload(readFixture("multimodal-request.json"));

  assert.ok(report.segments.some((segment) => segment.type === "attachment"));
  assert.ok(report.segments.some((segment) => segment.type === "retrieval_context"));
  assert.ok(report.segments.some((segment) => segment.type === "tool_result"));
  assert.ok(report.segments.some((segment) => segment.label.includes("user message 2 part 1")));
});

test("fixture: agent snapshot supports both summary and aggregate analysis", () => {
  const snapshot = readFixture("agent-snapshot.json");
  const summary = analyzeAgentSnapshot(snapshot);
  const report = analyzePayload(snapshot);

  assert.equal(summary.agents.length, 2);
  assert.equal(report.sourceType, "agent-snapshot");
  assert.equal(report.segments.length, 2);
  assert.ok(report.totalInputTokens > 0);
});

test("fixture: OpenAI Responses request maps instructions, attachments, and tool outputs", () => {
  const report = analyzePayload(readFixture("openai-responses-request.json"));

  assert.equal(report.sourceType, "openai-responses");
  assert.equal(report.provider, "openai");
  assert.equal(report.totalInputTokens, 256);
  assert.ok(report.segments.some((segment) => segment.type === "developer"));
  assert.ok(report.segments.some((segment) => segment.type === "attachment"));
  assert.ok(report.segments.some((segment) => segment.type === "tool_result"));
  assert.ok(report.segments.some((segment) => segment.type === "tool_schema"));
});

test("fixture: OpenAI Responses output is analyzable as future context", () => {
  const report = analyzePayload(readFixture("openai-responses-output.json"));

  assert.equal(report.sourceType, "openai-responses-output");
  assert.ok(report.segments.some((segment) => segment.type === "assistant_history"));
  assert.ok(report.segments.some((segment) => segment.type === "tool_schema"));
  assert.ok(report.segments.some((segment) => segment.type === "retrieval_context"));
});

test("fixture: Anthropic structured payload maps system, attachments, tool use, and tool result blocks", () => {
  const report = analyzePayload(readFixture("anthropic-structured.json"));

  assert.equal(report.sourceType, "anthropic-messages");
  assert.ok(report.segments.some((segment) => segment.type === "system"));
  assert.ok(report.segments.some((segment) => segment.type === "attachment"));
  assert.ok(report.segments.some((segment) => segment.type === "tool_schema"));
  assert.ok(report.segments.some((segment) => segment.type === "tool_result"));
});

test("fixture: OpenInference trace imports into agent summary and aggregate report", () => {
  const trace = readFixture("openinference-trace.json");
  const summary = analyzeAgentSnapshot(trace);
  const report = analyzePayload(trace);

  assert.equal(summary.agents.length, 2);
  assert.equal(summary.agents[1]?.parentAgentId, "planner");
  assert.ok(summary.agents[0]?.report?.segments.some((segment) => segment.type === "retrieval_context"));
  assert.ok(summary.agents[1]?.report?.segments.some((segment) => segment.type === "tool_result"));
  assert.equal(report.sourceType, "openinference-trace");
  assert.equal(report.segments.length, 2);
});

test("fixture: high-pressure request emits actionable suggestions", () => {
  const report = analyzePayload(readFixture("suggestions-high-pressure.json"));

  const codes = report.suggestions.map((suggestion) => suggestion.code);
  assert.ok(codes.includes("tool-schema-heavy"));
  assert.ok(codes.includes("assistant-history-heavy"));
  assert.ok(codes.includes("retrieval-context-heavy"));
  assert.ok(codes.includes("provider-overhead-heavy"));
  assert.ok(codes.includes("budget-pressure-high"));
  assert.ok(codes.includes("repeated-large-segments"));
});

test("fixture: low-pressure request can still produce zero suggestions", () => {
  const report = analyzePayload(readFixture("anthropic-request.json"));
  assert.deepEqual(report.suggestions, []);
});
