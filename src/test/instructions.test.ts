import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { lintInstructions } from "../index.js";

const rootDir = process.cwd();

function instructionFixture(name: string): string {
  return path.join(rootDir, "fixtures", "instructions", name);
}

test("lintInstructions discovers repository-wide and path-specific files from a repo root", () => {
  const report = lintInstructions(instructionFixture("valid-repo"));

  assert.equal(report.files.length, 2);
  assert.equal(report.findings.length, 0);
  assert.deepEqual(report.warnings, []);

  const repoWide = report.files.find((file) => file.kind === "copilot-repository");
  const pathSpecific = report.files.find((file) => file.kind === "copilot-path-specific");

  assert.ok(repoWide);
  assert.ok(pathSpecific);
  assert.equal(pathSpecific?.matchedFileCount, 2);
  assert.deepEqual(pathSpecific?.applyTo, ["**/*.ts", "**/*.tsx"]);
});

test("lintInstructions detects invalid names, malformed scope setup, duplicates, and conflicts", () => {
  const report = lintInstructions(instructionFixture("invalid-repo"));
  const codes = new Set(report.findings.map((finding) => finding.ruleId));

  assert.equal(report.passed, false);
  assert.equal(report.exitCode, 2);
  assert.ok(codes.has("invalid-file-path"));
  assert.ok(codes.has("missing-frontmatter"));
  assert.ok(codes.has("global-applyto-overlap"));
  assert.ok(codes.has("stale-applyto"));
  assert.ok(codes.has("exact-duplicate-statement"));
  assert.ok(codes.has("possible-conflict"));
  assert.ok(codes.has("order-dependent-wording"));
  assert.ok(codes.has("weak-modal-phrasing"));
  assert.ok(codes.has("vague-instruction"));
  assert.ok(report.warnings.some((warning) => warning.includes("do not match any repository files")));
});

test("lintInstructions statement budget warnings vary by compactness profile", () => {
  const standard = lintInstructions(instructionFixture("verbose-repo"), {
    profile: "standard",
    failOnSeverity: "warning"
  });
  const lite = lintInstructions(instructionFixture("verbose-repo"), {
    profile: "lite",
    failOnSeverity: "warning"
  });

  assert.ok(standard.findings.some((finding) => finding.ruleId === "statement-too-long"));
  assert.ok(!lite.findings.some((finding) => finding.ruleId === "statement-too-long"));
  assert.equal(standard.exitCode, 2);
  assert.equal(lite.exitCode, 0);
});

test("lintInstructions accepts a single file path and still resolves applyTo overlap", () => {
  const report = lintInstructions(
    path.join(
      instructionFixture("valid-repo"),
      ".github",
      "instructions",
      "typescript.instructions.md"
    )
  );

  assert.equal(report.files.length, 1);
  assert.equal(report.files[0]?.kind, "copilot-path-specific");
  assert.equal(report.files[0]?.matchedFileCount, 2);
  assert.equal(report.files[0]?.findings.length, 0);
});
