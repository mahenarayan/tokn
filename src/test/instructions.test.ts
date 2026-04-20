import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { lintInstructions } from "../index.js";

const rootDir = process.cwd();

function instructionFixture(name: string): string {
  return path.join(rootDir, "fixtures", "instructions", name);
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

test("lintInstructions discovers repository-wide and path-specific files from a repo root", () => {
  const report = lintInstructions(instructionFixture("valid-repo"));

  assert.equal(report.surface, "code-review");
  assert.equal(report.files.length, 2);
  assert.equal(report.findings.length, 0);
  assert.deepEqual(report.warnings, []);
  assert.equal(report.stats.applicableFiles, 2);

  const repoWide = report.files.find((file) => file.kind === "copilot-repository");
  const pathSpecific = report.files.find((file) => file.kind === "copilot-path-specific");

  assert.ok(repoWide);
  assert.ok(pathSpecific);
  assert.equal(repoWide?.appliesToSurface, true);
  assert.equal(pathSpecific?.appliesToSurface, true);
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

  const duplicate = report.findings.find((finding) => finding.ruleId === "exact-duplicate-statement");
  const staleApplyTo = report.findings.find((finding) => finding.ruleId === "stale-applyto");

  assert.equal(duplicate?.evidence?.relatedLocation?.file, ".github/instructions/all.instructions.md");
  assert.equal(duplicate?.evidence?.relatedLocation?.line, 6);
  assert.ok((duplicate?.evidence?.overlapFileCount ?? 0) > 0);
  assert.ok((duplicate?.evidence?.similarityScore ?? 0) >= 1);
  assert.deepEqual(staleApplyTo?.evidence?.patterns, ["**/*.rs"]);
  assert.equal(staleApplyTo?.evidence?.matchedFileCount, 0);
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

test("lintInstructions only applies the 4000 character cap on code-review", () => {
  const repoRoot = createInstructionRepo(
    {
      ".github/copilot-instructions.md": `# Repository Instructions\n\n- ${"use precise domain language ".repeat(220)}`,
      "src/index.ts": "export const value = 1;\n"
    },
    "orqis-instructions-char-limit-"
  );

  const codeReview = lintInstructions(repoRoot);
  const chat = lintInstructions(repoRoot, { surface: "chat" });

  assert.ok(codeReview.findings.some((finding) => finding.ruleId === "file-char-limit"));
  assert.ok(!chat.findings.some((finding) => finding.ruleId === "file-char-limit"));
  assert.equal(chat.surface, "chat");
});

test("lintInstructions respects excludeAgent for selected surfaces", () => {
  const repoRoot = createInstructionRepo(
    {
      ".github/instructions/review.instructions.md": [
        "---",
        'applyTo: "**/*.ts"',
        'excludeAgent: "code-review"',
        "---",
        "",
        "- Use explicit return types on exported functions."
      ].join("\n"),
      "src/index.ts": "export function demo(): number { return 1; }\n"
    },
    "orqis-instructions-exclude-agent-"
  );

  const codeReview = lintInstructions(repoRoot, { surface: "code-review" });
  const codingAgent = lintInstructions(repoRoot, { surface: "coding-agent" });

  assert.equal(codeReview.files[0]?.appliesToSurface, false);
  assert.deepEqual(codeReview.files[0]?.excludeAgents, ["code-review"]);
  assert.equal(codingAgent.files[0]?.appliesToSurface, true);
});

test("lintInstructions warns when a single target accumulates too many instruction tokens", () => {
  const repoRoot = createInstructionRepo(
    {
      ".github/copilot-instructions.md": `# Repository Instructions\n\n- ${"prefer narrow, repository-specific guidance ".repeat(40)}`,
      ".github/instructions/typescript.instructions.md": [
        "---",
        'applyTo: "**/*.ts"',
        "---",
        "",
        `- ${"prefer readonly models and explicit return types ".repeat(45)}`
      ].join("\n"),
      "src/index.ts": "export const value = 1;\n"
    },
    "orqis-instructions-token-budget-"
  );

  const report = lintInstructions(repoRoot, {
    surface: "coding-agent",
    failOnSeverity: "warning",
    model: "gpt-4o"
  });

  assert.ok(report.findings.some((finding) => finding.ruleId === "applicable-token-budget"));
  assert.ok(report.stats.maxApplicableTokens > 0);
  assert.equal(report.contextWindow, 128000);
  assert.ok((report.maxApplicableContextPercent ?? 0) > 0);

  const finding = report.findings.find((candidate) => candidate.ruleId === "applicable-token-budget");
  assert.equal(finding?.evidence?.targetFile, "src/index.ts");
  assert.ok((finding?.evidence?.actual as number) > (finding?.evidence?.expected as number));
  assert.ok((finding?.evidence?.contributorFiles?.length ?? 0) > 0);
});
