import {
  getInstructionRuleCategory
} from "./rules.js";
import {
  type InternalFileReport,
  instructionActivationType,
  surfaceApplicabilityForReport
} from "./internal.js";
import type {
  InstructionActivationType,
  InstructionFinding,
  InstructionFindingConfidence,
  InstructionFindingEvidence,
  InstructionLintSeverity,
  InstructionLintSurface,
  InstructionRuleId
} from "../types.js";

export function compareSeverity(left: InstructionLintSeverity, right: InstructionLintSeverity): number {
  const rank = { warning: 1, error: 2 } as const;
  return rank[left] - rank[right];
}

export function findingSort(left: InstructionFinding, right: InstructionFinding): number {
  const severityDiff = compareSeverity(right.severity, left.severity);
  if (severityDiff !== 0) {
    return severityDiff;
  }

  const fileDiff = left.file.localeCompare(right.file);
  if (fileDiff !== 0) {
    return fileDiff;
  }

  const lineDiff = left.line - right.line;
  if (lineDiff !== 0) {
    return lineDiff;
  }

  return left.ruleId.localeCompare(right.ruleId);
}

function defaultFindingConfidence(ruleId: InstructionRuleId): InstructionFindingConfidence {
  if (
    ruleId === "high-similarity-statement" ||
    ruleId === "possible-conflict" ||
    ruleId === "paragraph-narrative" ||
    ruleId === "vague-instruction"
  ) {
    return "medium";
  }
  return "high";
}

export function createFinding(
  file: string,
  severity: InstructionLintSeverity,
  ruleId: InstructionRuleId,
  message: string,
  line: number,
  suggestion?: string,
  evidence?: InstructionFindingEvidence,
  metadata: {
    confidence?: InstructionFindingConfidence;
    surfaceApplicability?: InstructionLintSurface[];
    activationType?: InstructionActivationType;
    groupId?: string;
  } = {}
): InstructionFinding {
  return {
    file,
    severity,
    category: getInstructionRuleCategory(ruleId),
    confidence: metadata.confidence ?? defaultFindingConfidence(ruleId),
    ...(metadata.surfaceApplicability ? { surfaceApplicability: metadata.surfaceApplicability } : {}),
    ...(metadata.activationType ? { activationType: metadata.activationType } : {}),
    ...(metadata.groupId ? { groupId: metadata.groupId } : {}),
    ruleId,
    message,
    line,
    ...(suggestion ? { suggestion } : {}),
    ...(evidence ? { evidence } : {})
  };
}

export function addFinding(
  report: InternalFileReport,
  seen: Set<string>,
  severity: InstructionLintSeverity,
  ruleId: InstructionRuleId,
  message: string,
  line: number,
  suggestion?: string,
  evidence?: InstructionFindingEvidence,
  metadata: {
    confidence?: InstructionFindingConfidence;
    surfaceApplicability?: InstructionLintSurface[];
    groupId?: string;
  } = {}
): void {
  const key = `${severity}|${ruleId}|${report.file}|${line}|${message}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  report.findings.push(
    createFinding(report.file, severity, ruleId, message, line, suggestion, evidence, {
      activationType: instructionActivationType(report),
      surfaceApplicability: surfaceApplicabilityForReport(report),
      ...metadata
    })
  );
}
