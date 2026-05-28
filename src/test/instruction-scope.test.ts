import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInstructionCoverageAnalysis,
  buildInstructionCoverageMap,
  resolveInstructionScopeFindings
} from "../instructions/scope.js";
import type { InternalFileReport } from "../instructions/internal.js";

const repoRoot = "/repo";

function makeReport(
  overrides: Partial<InternalFileReport> & Pick<InternalFileReport, "file" | "kind">
): InternalFileReport {
  const { file, kind, ...rest } = overrides;
  return {
    absolutePath: `${repoRoot}/${file}`,
    file,
    kind,
    repoRoot,
    excludeAgents: [],
    appliesToSurface: true,
    chars: 0,
    words: 0,
    estimatedTokens: 1,
    applyTo: [],
    blocks: [],
    statements: [],
    matchedFiles: [],
    matchedFileSet: new Set<string>(),
    findings: [],
    ...rest
  };
}

test("scope resolution matches supported instruction scopes and reports broken scopes", () => {
  const repoFiles = [
    "src/index.ts",
    "src/component.tsx",
    "docs/guide.md",
    "packages/ui/button.ts",
    "packages/ui/README.md"
  ];
  const reports = [
    makeReport({
      file: ".github/copilot-instructions.md",
      kind: "repository",
      preset: "copilot"
    }),
    makeReport({
      file: ".github/instructions/global.instructions.md",
      kind: "path-specific",
      preset: "copilot",
      applyTo: ["**"],
      applyToLine: 2
    }),
    makeReport({
      file: ".github/instructions/typescript.instructions.md",
      kind: "path-specific",
      preset: "copilot",
      applyTo: ["src/**/*.ts", "src/**/*.tsx"]
    }),
    makeReport({
      file: ".github/instructions/stale.instructions.md",
      kind: "path-specific",
      preset: "copilot",
      applyTo: ["legacy/**/*.ts"],
      applyToLine: 2
    }),
    makeReport({
      file: "packages/ui/AGENTS.md",
      kind: "path-specific",
      preset: "agents-md",
      scopePath: "packages/ui"
    }),
    makeReport({
      file: ".github/instructions/manual.instructions.md",
      kind: "path-specific",
      preset: "copilot",
      description: "Use when the user asks about architecture."
    })
  ];
  const warnings = new Set<string>();

  resolveInstructionScopeFindings(reports, new Map([[repoRoot, repoFiles]]), warnings);

  const byFile = new Map(reports.map((report) => [report.file, report]));
  assert.deepEqual(byFile.get(".github/copilot-instructions.md")?.matchedFiles, repoFiles);
  assert.deepEqual(byFile.get(".github/instructions/typescript.instructions.md")?.matchedFiles, [
    "src/index.ts",
    "src/component.tsx"
  ]);
  assert.deepEqual(byFile.get("packages/ui/AGENTS.md")?.matchedFiles, [
    "packages/ui/button.ts",
    "packages/ui/README.md"
  ]);
  assert.deepEqual(byFile.get(".github/instructions/manual.instructions.md")?.matchedFiles, []);

  const globalFinding = byFile.get(".github/instructions/global.instructions.md")?.findings[0];
  assert.equal(globalFinding?.ruleId, "global-applyto-overlap");
  assert.equal(globalFinding?.severity, "error");
  assert.deepEqual(globalFinding?.evidence?.patterns, ["**"]);
  assert.equal(globalFinding?.evidence?.matchedFileCount, repoFiles.length);

  const staleFinding = byFile.get(".github/instructions/stale.instructions.md")?.findings[0];
  assert.equal(staleFinding?.ruleId, "stale-applyto");
  assert.equal(staleFinding?.severity, "warning");
  assert.deepEqual([...warnings], [
    ".github/instructions/stale.instructions.md applyTo patterns do not match any repository files."
  ]);
});

test("coverage analysis aggregates active instruction load per target", () => {
  const srcInstructions = makeReport({
    file: ".github/instructions/src.instructions.md",
    kind: "path-specific",
    preset: "copilot",
    estimatedTokens: 6,
    matchedFiles: ["src/index.ts", "src/component.tsx"],
    matchedFileSet: new Set(["src/index.ts", "src/component.tsx"])
  });
  const componentInstructions = makeReport({
    file: ".github/instructions/component.instructions.md",
    kind: "path-specific",
    preset: "copilot",
    estimatedTokens: 5,
    matchedFiles: ["src/component.tsx"],
    matchedFileSet: new Set(["src/component.tsx"])
  });
  const uiAgents = makeReport({
    file: "packages/ui/AGENTS.md",
    kind: "path-specific",
    preset: "agents-md",
    estimatedTokens: 7,
    matchedFiles: ["packages/ui/button.ts"],
    matchedFileSet: new Set(["packages/ui/button.ts"])
  });
  const inactiveRepositoryInstructions = makeReport({
    file: ".github/copilot-instructions.md",
    kind: "repository",
    preset: "copilot",
    appliesToSurface: false,
    estimatedTokens: 99,
    matchedFiles: ["docs/guide.md", "src/index.ts", "src/component.tsx", "packages/ui/button.ts"],
    matchedFileSet: new Set(["docs/guide.md", "src/index.ts", "src/component.tsx", "packages/ui/button.ts"])
  });
  const repoFilesByRoot = new Map([
    [repoRoot, ["docs/guide.md", "src/index.ts", "src/component.tsx", "packages/ui/button.ts"]]
  ]);

  const analysis = buildInstructionCoverageAnalysis(
    [srcInstructions, componentInstructions, uiAgents, inactiveRepositoryInstructions],
    repoFilesByRoot
  );
  const coverage = buildInstructionCoverageMap(analysis);

  assert.equal(coverage.targetFileCount, 4);
  assert.equal(coverage.coveredTargetFileCount, 3);
  assert.equal(coverage.uncoveredTargetFileCount, 1);
  assert.deepEqual(coverage.uncoveredTargetFilesSample, ["docs/guide.md"]);
  assert.deepEqual(
    coverage.coveredTargets.map((target) => [
      target.targetFile,
      target.estimatedTokens,
      target.instructionFiles
    ]),
    [
      [
        "src/component.tsx",
        11,
        [
          ".github/instructions/component.instructions.md",
          ".github/instructions/src.instructions.md"
        ]
      ],
      ["packages/ui/button.ts", 7, ["packages/ui/AGENTS.md"]],
      ["src/index.ts", 6, [".github/instructions/src.instructions.md"]]
    ]
  );
});
