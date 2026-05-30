import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createFinding } from "../instructions/findings.js";
import type { InternalFileReport } from "../instructions/internal.js";
import {
  isSeverityFailing,
  postProcessFindings,
  resolveLintPolicy
} from "../instructions/policy.js";
import type { InstructionFinding } from "../types.js";

function createTempRepo(files: Record<string, string>, prefix: string): string {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  }
  return repoRoot;
}

function makeReport(file: string, findings: InstructionFinding[]): InternalFileReport {
  return {
    absolutePath: `/repo/${file}`,
    file,
    kind: "repository",
    preset: "copilot",
    excludeAgents: [],
    appliesToSurface: true,
    chars: 0,
    words: 0,
    estimatedTokens: 0,
    applyTo: [],
    blocks: [],
    statements: [],
    matchedFiles: [],
    matchedFileSet: new Set<string>(),
    findings
  };
}

test("instruction policy resolution merges config and options with option precedence", () => {
  const baselinePath = path.join(os.tmpdir(), `tokn-policy-baseline-${process.pid}.json`);
  fs.writeFileSync(baselinePath, JSON.stringify({ findings: [] }));
  const repoRoot = createTempRepo(
    {
      "tokn.config.json": JSON.stringify(
        {
          instructionsLint: {
            profile: "strict",
            failOnSeverity: "error",
            surface: "chat",
            preset: "copilot",
            model: "gpt-4o",
            ignore: ["generated/**"],
            budgets: {
              pathSpecificChars: 5000
            },
            rules: {
              "statement-too-long": { severity: "error" },
              "weak-modal-phrasing": { enabled: false }
            },
            suppressions: [
              {
                path: "legacy/**",
                rules: ["vague-instruction"],
                reason: "legacy window"
              }
            ],
            rollout: {
              stage: "advisory",
              owner: "platform-ai"
            }
          }
        },
        null,
        2
      ),
      "src/index.ts": "export const value = 1;\n"
    },
    "tokn-policy-config-"
  );

  const policy = resolveLintPolicy([repoRoot], {
    profile: "lite",
    failOnSeverity: "warning",
    surface: "code-review",
    preset: "agents-md",
    model: "claude-3-5-sonnet-latest",
    baseline: baselinePath,
    ignore: ["dist/**,build/**"],
    budgets: {
      statements: 40
    },
    ruleOverrides: {
      "statement-too-long": { severity: "warning" }
    },
    suppressions: [
      {
        path: "src/**",
        rules: ["statement-too-long"],
        reason: "temporary migration"
      }
    ]
  });

  assert.equal(policy.profile, "lite");
  assert.equal(policy.failOnSeverity, "warning");
  assert.equal(policy.surface, "code-review");
  assert.equal(policy.preset, "agents-md");
  assert.equal(policy.model, "claude-3-5-sonnet-latest");
  assert.equal(policy.baselinePath, baselinePath);
  assert.deepEqual(policy.ignore, ["generated/**", "dist/**", "build/**"]);
  assert.equal(policy.budgetOverrides.pathSpecificChars, 5000);
  assert.equal(policy.budgetOverrides.statements, 40);
  assert.equal(policy.budgets.pathSpecificChars, 5000);
  assert.equal(policy.budgets.statements, 40);
  assert.deepEqual(policy.ruleOverrides["statement-too-long"], { severity: "warning" });
  assert.deepEqual(policy.ruleOverrides["weak-modal-phrasing"], { enabled: false });
  assert.equal(policy.suppressions.length, 2);
  assert.ok(String(policy.appliedConfig?.source).endsWith("tokn.config.json"));
  assert.equal(policy.appliedConfig?.suppressionCount, 2);
  assert.deepEqual(policy.appliedConfig?.overriddenRules, [
    "statement-too-long",
    "weak-modal-phrasing"
  ]);
  assert.deepEqual(policy.appliedConfig?.rollout, {
    stage: "advisory",
    owner: "platform-ai"
  });
});

test("instruction policy post-processing applies overrides, suppressions, and baselines", () => {
  const survivingFinding = createFinding(
    ".github/copilot-instructions.md",
    "warning",
    "statement-too-long",
    "Statement is too long.",
    3
  );
  const disabledFinding = createFinding(
    ".github/copilot-instructions.md",
    "warning",
    "weak-modal-phrasing",
    "Weak wording.",
    4
  );
  const suppressedFinding = createFinding(
    "legacy/AGENTS.md",
    "warning",
    "vague-instruction",
    "Too vague.",
    1
  );
  const baselineFinding = createFinding(
    ".github/instructions/tests.instructions.md",
    "warning",
    "paragraph-narrative",
    "Narrative paragraph.",
    5
  );
  const baselinePath = path.join(os.tmpdir(), `tokn-policy-baseline-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(baselinePath, JSON.stringify({ findings: [baselineFinding] }, null, 2));
  const reports = [
    makeReport(".github/copilot-instructions.md", [survivingFinding, disabledFinding]),
    makeReport("legacy/AGENTS.md", [suppressedFinding]),
    makeReport(".github/instructions/tests.instructions.md", [baselineFinding])
  ];
  const policy = resolveLintPolicy([], {
    baseline: baselinePath,
    ruleOverrides: {
      "statement-too-long": { severity: "error" },
      "weak-modal-phrasing": { enabled: false }
    },
    suppressions: [
      {
        path: "legacy/**",
        rules: ["vague-instruction"],
        reason: "legacy window"
      }
    ]
  });

  const summary = postProcessFindings(reports, policy);
  const remainingFindings = reports.flatMap((report) => report.findings);

  assert.equal(summary.suppressedFindingCount, 2);
  assert.equal(summary.baselineMatchedFindingCount, 1);
  assert.equal(remainingFindings.length, 1);
  assert.equal(remainingFindings[0]?.ruleId, "statement-too-long");
  assert.equal(remainingFindings[0]?.severity, "error");
});

test("instruction policy fail threshold treats off, warning, and error distinctly", () => {
  const warning = createFinding("AGENTS.md", "warning", "vague-instruction", "Too vague.", 1);
  const error = createFinding("AGENTS.md", "error", "invalid-file-path", "Invalid path.", 1);

  assert.equal(isSeverityFailing(warning, "off"), false);
  assert.equal(isSeverityFailing(error, "off"), false);
  assert.equal(isSeverityFailing(warning, "warning"), true);
  assert.equal(isSeverityFailing(error, "warning"), true);
  assert.equal(isSeverityFailing(warning, "error"), false);
  assert.equal(isSeverityFailing(error, "error"), true);
});
