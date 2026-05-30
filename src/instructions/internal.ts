import type { CandidateFile } from "./discovery.js";
import type { MarkdownBlock, Statement } from "./markdown.js";
import type {
  InstructionActivationType,
  InstructionExcludeAgent,
  InstructionFileKind,
  InstructionFinding,
  InstructionLintPreset,
  InstructionLintSurface
} from "../types.js";

export interface InternalFileReport {
  absolutePath: string;
  file: string;
  kind: InstructionFileKind;
  preset?: InstructionLintPreset;
  repoRoot?: string;
  scopePath?: string;
  excludeAgents: InstructionExcludeAgent[];
  excludeAgentsLine?: number;
  appliesToSurface: boolean;
  chars: number;
  words: number;
  estimatedTokens: number;
  applyTo: string[];
  applyToLine?: number;
  description?: string;
  descriptionLine?: number;
  blocks: MarkdownBlock[];
  statements: Statement[];
  matchedFiles: string[];
  matchedFileSet: Set<string>;
  findings: InstructionFinding[];
}

export interface PostProcessSummary {
  suppressedFindingCount: number;
  baselineMatchedFindingCount: number;
}

export interface IgnoreSummary {
  ignoredInstructionFileCount: number;
  ignoredTargetFileCount: number;
}

export interface InstructionInputCollection {
  candidates: CandidateFile[];
  repoFilesByRoot: Map<string, string[]>;
  ignoreSummary: IgnoreSummary;
  warnings: Set<string>;
}

export interface TargetInstructionLoad {
  repoRoot: string;
  targetFile: string;
  estimatedTokens: number;
  instructionFiles: string[];
  instructionReports: InternalFileReport[];
}

export interface InstructionCoverageAnalysis {
  targetFileCount: number;
  coveredTargetFileCount: number;
  uncoveredTargetFiles: string[];
  targetLoads: TargetInstructionLoad[];
}

export const CONCRETE_SURFACES = ["code-review", "chat", "coding-agent"] as const;
export type ConcreteInstructionLintSurface = typeof CONCRETE_SURFACES[number];

export function isRepositoryInstruction(report: Pick<InternalFileReport, "kind">): boolean {
  return report.kind === "repository";
}

export function isPathSpecificInstruction(report: Pick<InternalFileReport, "kind">): boolean {
  return report.kind === "path-specific";
}

export function isCopilotInstruction(report: Pick<InternalFileReport, "preset">): boolean {
  return report.preset === "copilot";
}

export function isAllSurface(surface: InstructionLintSurface): boolean {
  return surface === "all" || surface === "auto";
}

export function concreteSurfaceApplies(
  report: Pick<InternalFileReport, "kind" | "excludeAgents">,
  surface: ConcreteInstructionLintSurface
): boolean {
  if (report.kind === "unsupported") {
    return false;
  }
  if (surface === "chat") {
    return true;
  }
  return !report.excludeAgents.includes(surface);
}

export function appliesToSurface(
  report: Pick<InternalFileReport, "kind" | "excludeAgents">,
  surface: InstructionLintSurface
): boolean {
  if (report.kind === "unsupported") {
    return false;
  }
  if (isAllSurface(surface)) {
    return true;
  }
  return concreteSurfaceApplies(report, surface as ConcreteInstructionLintSurface);
}

export function surfaceApplicabilityForReport(
  report: Pick<InternalFileReport, "kind" | "excludeAgents">
): ConcreteInstructionLintSurface[] {
  return CONCRETE_SURFACES.filter((surface) => concreteSurfaceApplies(report, surface));
}

export function instructionActivationType(
  report: Pick<InternalFileReport, "kind" | "preset" | "applyTo" | "description" | "scopePath">
): InstructionActivationType {
  if (report.kind === "unsupported") {
    return "unsupported";
  }
  if (report.kind === "repository") {
    return "repository";
  }
  if (report.preset === "agents-md" && report.scopePath) {
    return "directory";
  }
  if (report.applyTo.length > 0) {
    return "path";
  }
  if (report.description) {
    return "description";
  }
  return "path";
}

export function sampleItems(items: string[], limit = 3): string[] {
  return items.slice(0, limit);
}

export function groupReportsByRepoRoot(reports: InternalFileReport[]): Map<string, InternalFileReport[]> {
  const grouped = new Map<string, InternalFileReport[]>();

  for (const report of reports) {
    if (!report.repoRoot) {
      continue;
    }
    const existing = grouped.get(report.repoRoot) ?? [];
    existing.push(report);
    grouped.set(report.repoRoot, existing);
  }

  return grouped;
}

export function compareTargetLoads(left: TargetInstructionLoad, right: TargetInstructionLoad): number {
  if (left.estimatedTokens !== right.estimatedTokens) {
    return right.estimatedTokens - left.estimatedTokens;
  }

  const targetDiff = left.targetFile.localeCompare(right.targetFile);
  if (targetDiff !== 0) {
    return targetDiff;
  }

  const instructionDiff = left.instructionFiles.join("\0").localeCompare(right.instructionFiles.join("\0"));
  if (instructionDiff !== 0) {
    return instructionDiff;
  }

  return left.repoRoot.localeCompare(right.repoRoot);
}
