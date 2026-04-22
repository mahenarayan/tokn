import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { analyzePayload, evaluateCheck } from "../index.js";

const rootDir = process.cwd();

function readFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "fixtures", name), "utf8"));
}

test("evaluateCheck passes when thresholds are satisfied", () => {
  const report = analyzePayload(readFixture("anthropic-request.json"));
  const result = evaluateCheck(report, {
    maxTotalTokens: 100,
    maxUsagePercent: 1,
    failOnRisk: "high"
  });

  assert.equal(result.passed, true);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.violations, []);
});

test("evaluateCheck fails when thresholds are exceeded", () => {
  const report = analyzePayload(readFixture("suggestions-high-pressure.json"));
  const baseline = analyzePayload(readFixture("anthropic-request.json"));
  const result = evaluateCheck(
    report,
    {
      maxTotalTokens: 100000,
      maxUsagePercent: 80,
      maxSegmentTokens: { tool_schema: 300 },
      failOnRisk: "medium"
    },
    baseline
  );

  const codes = result.violations.map((violation) => violation.code);
  assert.equal(result.passed, false);
  assert.equal(result.exitCode, 2);
  assert.ok(codes.includes("max-total-tokens"));
  assert.ok(codes.includes("max-usage-percent"));
  assert.ok(codes.includes("max-segment-tokens"));
  assert.ok(codes.includes("fail-on-risk"));
  assert.equal(result.baseline?.diff.totalDelta, 111970);
});

test("evaluateCheck emits warnings when budget metadata is unavailable", () => {
  const report = analyzePayload(readFixture("unknown-model-request.json"));
  const result = evaluateCheck(report, {
    maxUsagePercent: 80,
    failOnRisk: "medium"
  });

  assert.equal(result.passed, true);
  assert.equal(result.violations.length, 0);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0] ?? "", /Usage percent is unavailable/);
  assert.match(result.warnings[1] ?? "", /Budget risk is unavailable/);
});

test("stored ContextReport can be reused as a baseline", () => {
  const baselineReport = analyzePayload(readFixture("anthropic-request.json"));
  const report = analyzePayload(readFixture("suggestions-high-pressure.json"));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokn-check-"));
  const baselinePath = path.join(tempDir, "baseline-report.json");
  fs.writeFileSync(baselinePath, JSON.stringify(baselineReport, null, 2));

  const loadedBaseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const result = evaluateCheck(report, { maxTotalTokens: 100000 }, loadedBaseline);

  assert.equal(result.baseline?.report.sourceType, "anthropic-messages");
  assert.equal(result.exitCode, 2);
});
