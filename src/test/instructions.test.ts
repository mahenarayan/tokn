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

  assert.equal(report.preset, "auto");
  assert.deepEqual(report.detectedPresets, ["copilot"]);
  assert.equal(report.surface, "code-review");
  assert.equal(report.files.length, 2);
  assert.equal(report.findings.length, 0);
  assert.deepEqual(report.warnings, []);
  assert.equal(report.stats.applicableFiles, 2);

  const repoWide = report.files.find((file) => file.kind === "repository");
  const pathSpecific = report.files.find((file) => file.kind === "path-specific");

  assert.ok(repoWide);
  assert.ok(pathSpecific);
  assert.equal(repoWide?.preset, "copilot");
  assert.equal(pathSpecific?.preset, "copilot");
  assert.equal(repoWide?.appliesToSurface, true);
  assert.equal(pathSpecific?.appliesToSurface, true);
  assert.equal(pathSpecific?.matchedFileCount, 2);
  assert.deepEqual(pathSpecific?.applyTo, ["**/*.ts", "**/*.tsx"]);
});

test("lintInstructions accepts description-triggered Copilot instruction files", () => {
  const repoRoot = createInstructionRepo(
    {
      ".github/instructions/architecture.instructions.md": [
        "---",
        'description: "Use when the user asks about architecture decisions or ADRs."',
        "---",
        "",
        "- Reference accepted ADRs before proposing architectural changes."
      ].join("\n"),
      "src/index.ts": "export const value = 1;\n"
    },
    "tokn-instructions-description-"
  );

  const report = lintInstructions(repoRoot);
  const file = report.files.find((candidate) => candidate.file.endsWith("architecture.instructions.md"));

  assert.ok(file);
  assert.equal(file?.kind, "path-specific");
  assert.equal(file?.description, "Use when the user asks about architecture decisions or ADRs.");
  assert.equal(file?.matchedFileCount, 0);
  assert.ok(!report.findings.some((finding) => finding.ruleId === "missing-applyto"));
  assert.ok(report.warnings.some((warning) => warning.includes("description-only activation")));
});

test("lintInstructions keeps the real-world noise regression fixture focused", () => {
  const report = lintInstructions(instructionFixture("noise-regression-repo"), {
    failOnSeverity: "off"
  });
  const findings = report.findings;
  const moderateBudgetRules = new Set([
    "path-specific-char-budget",
    "path-specific-token-budget",
    "statement-count-budget",
    "applicable-token-budget"
  ]);

  assert.equal(report.exitCode, 0);
  assert.ok(!findings.some((finding) => finding.ruleId === "missing-applyto"));
  assert.equal(
    report.warnings.filter((warning) => warning.includes("description-only activation")).length,
    2
  );
  assert.ok(!findings.some((finding) => finding.ruleId === "order-dependent-wording"));
  assert.deepEqual(
    findings
      .filter((finding) => moderateBudgetRules.has(finding.ruleId))
      .filter((finding) => !finding.file.endsWith("testcode.instructions.md"))
      .map((finding) => `${finding.ruleId}:${finding.file}`),
    []
  );
  assert.ok(findings.some((finding) => finding.ruleId === "file-char-limit" && finding.file.endsWith("testcode.instructions.md")));
  assert.ok(findings.some((finding) => finding.ruleId === "weak-modal-phrasing" && finding.file.endsWith("cooperation.instructions.md")));
  assert.ok(findings.some((finding) => finding.ruleId === "oversized-code-example" && finding.file.endsWith("testcode.instructions.md")));
  assert.ok(findings.some((finding) => finding.ruleId === "statement-too-long" && finding.file.endsWith("testcode.instructions.md")));

  const chatReport = lintInstructions(instructionFixture("noise-regression-repo"), {
    surface: "chat",
    failOnSeverity: "off"
  });
  assert.ok(!chatReport.findings.some((finding) => finding.ruleId === "file-char-limit"));
});

test("lintInstructions discovers AGENTS.md files through the agents-md preset", () => {
  const report = lintInstructions(instructionFixture("agents-repo"), {
    preset: "agents-md"
  });

  assert.equal(report.preset, "agents-md");
  assert.deepEqual(report.detectedPresets, ["agents-md"]);
  assert.equal(report.findings.length, 0);
  assert.equal(report.files.length, 2);

  const repoWide = report.files.find((file) => file.file === "AGENTS.md");
  const scoped = report.files.find((file) => file.file === "frontend/AGENTS.md");

  assert.equal(repoWide?.kind, "repository");
  assert.equal(repoWide?.preset, "agents-md");
  assert.equal(scoped?.kind, "path-specific");
  assert.equal(scoped?.preset, "agents-md");
  assert.equal(scoped?.scopePath, "frontend");
  assert.ok((scoped?.matchedFileCount ?? 0) >= 2);
});

test("lintInstructions discovers symlinked known agent instruction surfaces", () => {
  const repoRoot = createInstructionRepo(
    {
      "AGENTS.md": "# Agents\n\n- Run the relevant tests before finalizing.\n",
      "src/index.ts": "export const value = 1;\n"
    },
    "tokn-instructions-symlinked-agent-surface-"
  );
  fs.symlinkSync("AGENTS.md", path.join(repoRoot, "CLAUDE.md"));

  const report = lintInstructions(repoRoot);
  const claudeFile = report.files.find((file) => file.file === "CLAUDE.md");

  assert.ok(claudeFile);
  assert.equal(claudeFile.kind, "unsupported");
  assert.equal(claudeFile.findings[0]?.ruleId, "unsupported-agent-surface");
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
  const strict = lintInstructions(instructionFixture("verbose-repo"), {
    profile: "strict",
    failOnSeverity: "warning"
  });
  const lite = lintInstructions(instructionFixture("verbose-repo"), {
    profile: "lite",
    failOnSeverity: "warning"
  });

  assert.ok(strict.findings.some((finding) => finding.ruleId === "statement-too-long"));
  assert.ok(!lite.findings.some((finding) => finding.ruleId === "statement-too-long"));
  assert.equal(strict.exitCode, 2);
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
  assert.equal(report.files[0]?.kind, "path-specific");
  assert.equal(report.files[0]?.preset, "copilot");
  assert.equal(report.files[0]?.matchedFileCount, 2);
  assert.equal(report.files[0]?.findings.length, 0);
});

test("lintInstructions preset filtering keeps the engine generic without mixing presets implicitly", () => {
  const repoRoot = createInstructionRepo(
    {
      ".github/copilot-instructions.md": "# Repo\n\n- Use concise Copilot rules.\n",
      "AGENTS.md": "# Agents\n\n- Keep tasks bounded.\n",
      "src/index.ts": "export const value = 1;\n"
    },
    "tokn-instructions-preset-"
  );

  const auto = lintInstructions(repoRoot);
  const copilot = lintInstructions(repoRoot, { preset: "copilot" });
  const agents = lintInstructions(repoRoot, { preset: "agents-md" });

  assert.deepEqual(auto.detectedPresets, ["agents-md", "copilot"]);
  assert.equal(auto.files.length, 2);
  assert.equal(copilot.files.length, 1);
  assert.equal(copilot.files[0]?.preset, "copilot");
  assert.equal(agents.files.length, 1);
  assert.equal(agents.files[0]?.preset, "agents-md");
});

test("lintInstructions only applies the 4000 character cap on code-review", () => {
  const repoRoot = createInstructionRepo(
    {
      ".github/copilot-instructions.md": `# Repository Instructions\n\n- ${"use precise domain language ".repeat(220)}`,
      "src/index.ts": "export const value = 1;\n"
    },
    "tokn-instructions-char-limit-"
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
    "tokn-instructions-exclude-agent-"
  );

  const codeReview = lintInstructions(repoRoot, { surface: "code-review" });
  const codingAgent = lintInstructions(repoRoot, { surface: "coding-agent" });

  assert.equal(codeReview.files[0]?.appliesToSurface, false);
  assert.deepEqual(codeReview.files[0]?.excludeAgents, ["code-review"]);
  assert.equal(codingAgent.files[0]?.appliesToSurface, true);
});

test("lintInstructions maps Copilot cloud-agent exclusions to the coding-agent surface", () => {
  const repoRoot = createInstructionRepo(
    {
      ".github/instructions/cloud.instructions.md": [
        "---",
        'applyTo: "**/*.ts"',
        'excludeAgent: "cloud-agent"',
        "---",
        "",
        "- Keep generated diffs focused."
      ].join("\n"),
      "src/index.ts": "export function demo(): number { return 1; }\n"
    },
    "tokn-instructions-cloud-agent-"
  );

  const codingAgent = lintInstructions(repoRoot, { surface: "coding-agent" });
  const codeReview = lintInstructions(repoRoot, { surface: "code-review" });

  assert.equal(codingAgent.files[0]?.appliesToSurface, false);
  assert.deepEqual(codingAgent.files[0]?.excludeAgents, ["coding-agent"]);
  assert.equal(codeReview.files[0]?.appliesToSurface, true);
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
    "tokn-instructions-token-budget-"
  );

  const report = lintInstructions(repoRoot, {
    profile: "strict",
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

test("lintInstructions emits a stable schema contract and discovers config defaults", () => {
  const repoRoot = createInstructionRepo(
    {
      "tokn.config.json": JSON.stringify(
        {
          instructionsLint: {
            profile: "strict",
            surface: "chat",
            rules: {
              "statement-too-long": { severity: "error" },
              "weak-modal-phrasing": { enabled: false }
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
        "- Try to keep exported interfaces explicit, spell out the constrained domain vocabulary for every repository-facing API change, include the compatibility rationale in each review note, and document migration impact so downstream teams can evaluate risk without asking for hidden context."
      ].join("\n"),
      "src/index.ts": "export const value = 1;\n",
      "generated/out.ts": "export const generated = 1;\n"
    },
    "tokn-instructions-config-"
  );

  const report = lintInstructions(repoRoot);
  const finding = report.findings.find((candidate) => candidate.ruleId === "statement-too-long");

  assert.equal(report.kind, "instructions-lint-report");
  assert.equal(report.schemaVersion, "instructions-lint-report/v1");
  assert.equal(report.schemaPath, "schemas/instructions-lint-report.schema.json");
  assert.equal(report.profile, "strict");
  assert.equal(report.surface, "chat");
  assert.ok(String(report.config?.source).endsWith("tokn.config.json"));
  assert.deepEqual(report.config?.ignore, ["generated/**"]);
  assert.deepEqual(report.config?.overriddenRules, ["statement-too-long", "weak-modal-phrasing"]);
  assert.equal(report.stats.ignoredTargetFileCount, 1);
  assert.equal(finding?.severity, "error");
  assert.ok(!report.findings.some((candidate) => candidate.ruleId === "weak-modal-phrasing"));
});

test("lintInstructions supports advisory enterprise rollout config", () => {
  const repoRoot = createInstructionRepo(
    {
      "tokn.config.json": JSON.stringify(
        {
          instructionsLint: {
            rollout: {
              stage: "advisory",
              owner: "platform-ai",
              policyVersion: "2026.04",
              ticket: "AI-1234",
              expiresOn: "2026-06-30"
            },
            failOnSeverity: "off"
          }
        },
        null,
        2
      ),
      ".github/instructions/legacy.md": "- Follow best practices.\n",
      "src/index.ts": "export const value = 1;\n"
    },
    "tokn-instructions-enterprise-rollout-"
  );

  const report = lintInstructions(repoRoot);

  assert.equal(report.failOnSeverity, "off");
  assert.equal(report.passed, true);
  assert.equal(report.exitCode, 0);
  assert.ok(report.findings.some((finding) => finding.ruleId === "invalid-file-path"));
  assert.deepEqual(report.config?.rollout, {
    stage: "advisory",
    owner: "platform-ai",
    policyVersion: "2026.04",
    ticket: "AI-1234",
    expiresOn: "2026-06-30"
  });
});

test("lintInstructions rejects invalid rollout metadata", () => {
  const repoRoot = createInstructionRepo(
    {
      "tokn.config.json": JSON.stringify(
        {
          instructionsLint: {
            rollout: {
              stage: "trial",
              expiresOn: "06/30/2026"
            }
          }
        },
        null,
        2
      ),
      ".github/copilot-instructions.md": "# Repository Instructions\n\n- Keep changes small.\n",
      "src/index.ts": "export const value = 1;\n"
    },
    "tokn-instructions-invalid-rollout-"
  );

  assert.throws(
    () => lintInstructions(repoRoot),
    /instructionsLint\.rollout\.stage must be one of/
  );
});

test("lintInstructions applies suppressions from config", () => {
  const repoRoot = createInstructionRepo(
    {
      "tokn.config.json": JSON.stringify(
        {
          instructionsLint: {
            suppressions: [
              {
                path: ".github/copilot-instructions.md",
                rules: ["statement-too-long"],
                reason: "legacy migration window"
              }
            ]
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
      "src/index.ts": "export const value = 1;\n"
    },
    "tokn-instructions-suppressions-"
  );

  const report = lintInstructions(repoRoot, {
    profile: "strict",
    failOnSeverity: "warning"
  });

  assert.equal(report.findings.length, 0);
  assert.equal(report.stats.suppressedFindingCount, 1);
  assert.equal(report.exitCode, 0);
  assert.equal(report.config?.suppressionCount, 1);
});

test("lintInstructions supports baseline suppression for incremental rollout", () => {
  const baselineReport = lintInstructions(instructionFixture("invalid-repo"), {
    failOnSeverity: "warning"
  });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokn-instructions-baseline-"));
  const baselinePath = path.join(tempDir, "instructions-baseline.json");
  fs.writeFileSync(baselinePath, JSON.stringify(baselineReport, null, 2));

  const report = lintInstructions(instructionFixture("invalid-repo"), {
    failOnSeverity: "warning",
    baseline: baselinePath
  });

  assert.equal(report.findings.length, 0);
  assert.equal(report.stats.baselineMatchedFindingCount, baselineReport.findings.length);
  assert.equal(report.exitCode, 0);
  assert.equal(report.config?.baselinePath, baselinePath);
});

test("lintInstructions refuses oversized instruction files before parsing", () => {
  const repoRoot = createInstructionRepo(
    {
      ".github/copilot-instructions.md": `# Repository Instructions\n\n- ${"x".repeat(1024 * 1024)}`,
      "src/index.ts": "export const value = 1;\n"
    },
    "tokn-instructions-oversized-"
  );

  assert.throws(
    () => lintInstructions(repoRoot),
    /exceeds the 1048576 byte safety limit/
  );
});
