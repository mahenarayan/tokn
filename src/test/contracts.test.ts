import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  formatInstructionLintReportMarkdown,
  INSTRUCTION_RULE_IDS,
  INSTRUCTION_RULES,
  lintInstructions
} from "../index.js";

const rootDir = process.cwd();

function readJsonFixture(relativePath: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function getObjectField(value: unknown, fieldName: string): Record<string, unknown> {
  assert.equal(typeof value, "object", `${fieldName} container must be an object`);
  assert.notEqual(value, null, `${fieldName} container must not be null`);
  assert.ok(!Array.isArray(value), `${fieldName} container must not be an array`);
  return value as Record<string, unknown>;
}

function getRuleIdsFromSchema(schema: unknown): string[] {
  const root = getObjectField(schema, "schema");
  const definitions = getObjectField(root.$defs, "$defs");
  const ruleId = getObjectField(definitions.ruleId, "ruleId");
  assert.ok(Array.isArray(ruleId.enum), "ruleId enum must be an array");
  return ruleId.enum.map((entry) => {
    assert.equal(typeof entry, "string", "rule id schema values must be strings");
    return entry;
  }).sort((left, right) => left.localeCompare(right));
}

test("instruction rule registry stays aligned with published JSON schemas", () => {
  const expectedRuleIds = [...INSTRUCTION_RULE_IDS].sort((left, right) => left.localeCompare(right));
  const configSchema = readJsonFixture("schemas/tokn-config.schema.json");
  const reportSchema = readJsonFixture("schemas/instructions-lint-report.schema.json");

  assert.deepEqual(getRuleIdsFromSchema(configSchema), expectedRuleIds);
  assert.deepEqual(getRuleIdsFromSchema(reportSchema), expectedRuleIds);
});

test("instruction rule definitions are internally consistent", () => {
  for (const ruleId of INSTRUCTION_RULE_IDS) {
    assert.equal(INSTRUCTION_RULES[ruleId].id, ruleId);
  }
});

test("instruction lint report includes all schema-required top-level fields", () => {
  const schema = readJsonFixture("schemas/instructions-lint-report.schema.json");
  const root = getObjectField(schema, "schema");
  assert.ok(Array.isArray(root.required), "report schema required must be an array");

  const report = lintInstructions("fixtures/instructions/valid-repo");
  for (const field of root.required) {
    assert.equal(typeof field, "string", "required fields must be strings");
    assert.ok(field in report, `report is missing schema-required field: ${field}`);
  }
});

test("SDK exports the stable markdown formatter for instruction lint reports", () => {
  const report = lintInstructions("fixtures/instructions/valid-repo");
  assert.match(formatInstructionLintReportMarkdown(report), /^# Tokn Instructions Lint Report/);
});
