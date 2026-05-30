import { matchesGlob } from "./discovery.js";
import { createFinding } from "./findings.js";
import {
  type InstructionCoverageAnalysis,
  type InternalFileReport,
  type TargetInstructionLoad,
  compareTargetLoads,
  groupReportsByRepoRoot,
  isCopilotInstruction,
  isPathSpecificInstruction,
  isRepositoryInstruction,
  sampleItems
} from "./internal.js";
import type { InstructionCoverageMap } from "../types.js";

export function resolveMatchedFiles(report: InternalFileReport, repoFiles: string[]): string[] {
  if (isRepositoryInstruction(report)) {
    return [...repoFiles];
  }

  if (!isPathSpecificInstruction(report)) {
    return [];
  }

  if (isCopilotInstruction(report)) {
    if (report.applyTo.length === 0) {
      return [];
    }
    return repoFiles.filter((filePath) =>
      report.applyTo.some((pattern) => matchesGlob(filePath, pattern))
    );
  }

  if (report.preset === "agents-md") {
    if (!report.scopePath) {
      return [...repoFiles];
    }
    const scopePrefix = `${report.scopePath}/`;
    return repoFiles.filter((filePath) => filePath.startsWith(scopePrefix));
  }

  return [];
}

export function resolveInstructionScopeFindings(
  reports: InternalFileReport[],
  repoFilesByRoot: Map<string, string[]>,
  warnings: Set<string>
): void {
  const repoWideRoots = new Set(
    reports
      .filter((report) => report.preset === "copilot" && report.kind === "repository" && report.repoRoot)
      .map((report) => report.repoRoot as string)
  );

  for (const report of reports) {
    const repoFiles = report.repoRoot ? repoFilesByRoot.get(report.repoRoot) ?? [] : [];
    report.matchedFiles = resolveMatchedFiles(report, repoFiles);
    report.matchedFileSet = new Set(report.matchedFiles);

    if (
      report.preset === "copilot" &&
      report.kind === "path-specific" &&
      report.applyTo.some((pattern) => pattern === "**" || pattern === "**/*") &&
      report.repoRoot &&
      repoWideRoots.has(report.repoRoot)
    ) {
      report.findings.push(
        createFinding(
          report.file,
          "error",
          "global-applyto-overlap",
          "Path-specific instruction file uses applyTo: \"**\" even though a repository-wide copilot-instructions.md file already exists.",
          report.applyToLine ?? 1,
          "Keep repository-wide guidance in .github/copilot-instructions.md and narrow applyTo to a real subset.",
          {
            relatedLocation: {
              file: ".github/copilot-instructions.md",
              line: 1
            },
            patterns: report.applyTo,
            matchedFileCount: report.matchedFiles.length,
            ...(report.matchedFiles.length > 0
              ? { matchedFilesSample: sampleItems(report.matchedFiles) }
              : {})
          }
        )
      );
    }

    if (
      report.preset === "copilot" &&
      report.kind === "path-specific" &&
      report.applyTo.length > 0 &&
      report.matchedFiles.length === 0
    ) {
      const warning =
        `${report.file} applyTo patterns do not match any repository files.`;
      warnings.add(warning);
      report.findings.push(
        createFinding(
          report.file,
          "warning",
          "stale-applyto",
          "applyTo patterns do not match any repository files.",
          report.applyToLine ?? 1,
          "Update the glob patterns or delete the file if the scope no longer exists.",
          {
            patterns: report.applyTo,
            matchedFileCount: 0
          }
        )
      );
    }
  }
}

export function buildInstructionCoverageAnalysis(
  reports: InternalFileReport[],
  repoFilesByRoot: Map<string, string[]>
): InstructionCoverageAnalysis {
  const targetLoads: TargetInstructionLoad[] = [];
  const uncoveredTargetFiles: string[] = [];
  let targetFileCount = 0;
  const reportsByRoot = groupReportsByRepoRoot(reports);

  for (const [repoRoot, repoFiles] of repoFilesByRoot.entries()) {
    targetFileCount += repoFiles.length;
    const group = reportsByRoot.get(repoRoot) ?? [];

    const eligible = group
      .filter((report) => report.kind !== "unsupported" && report.appliesToSurface)
      .sort((left, right) => left.file.localeCompare(right.file));

    for (const repoFile of repoFiles) {
      const matched = eligible.filter((report) => report.matchedFileSet.has(repoFile));
      if (matched.length === 0) {
        uncoveredTargetFiles.push(repoFile);
        continue;
      }

      const instructionReports = matched.sort((left, right) => left.file.localeCompare(right.file));
      const estimatedTokens = instructionReports.reduce((sum, report) => sum + report.estimatedTokens, 0);
      const instructionFiles = instructionReports.map((report) => report.file);
      targetLoads.push({
        repoRoot,
        targetFile: repoFile,
        estimatedTokens,
        instructionFiles,
        instructionReports
      });
    }
  }

  return {
    targetFileCount,
    coveredTargetFileCount: targetLoads.length,
    uncoveredTargetFiles,
    targetLoads
  };
}

export function buildInstructionCoverageMap(analysis: InstructionCoverageAnalysis): InstructionCoverageMap {
  const coveredTargets = analysis.targetLoads
    .slice()
    .sort(compareTargetLoads)
    .map((load) => ({
      targetFile: load.targetFile,
      estimatedTokens: load.estimatedTokens,
      instructionCount: load.instructionFiles.length,
      instructionFiles: load.instructionFiles
    }));

  return {
    targetFileCount: analysis.targetFileCount,
    coveredTargetFileCount: analysis.coveredTargetFileCount,
    uncoveredTargetFileCount: analysis.uncoveredTargetFiles.length,
    coveredTargets,
    uncoveredTargetFilesSample: sampleItems(
      analysis.uncoveredTargetFiles
        .slice()
        .sort((left, right) => left.localeCompare(right)),
      10
    )
  };
}
