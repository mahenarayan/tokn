import { formatPercent } from "./helpers.js";
import type {
  AgentSummary,
  CheckResult,
  ContextReport,
  DiffReport,
  InstructionFileKind,
  InstructionFinding,
  InstructionFindingEvidence,
  InstructionLintReport
} from "./types.js";

function markdownTable(headers: string[], rows: string[][]): string[] {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`)
  ];
}

function formatInstructionFileKind(kind: InstructionFileKind): string {
  switch (kind) {
    case "copilot-repository":
      return "repository-wide";
    case "copilot-path-specific":
      return "path-specific";
    case "unsupported":
      return "unsupported";
  }
}

function formatInstructionFindingEvidenceParts(evidence: InstructionFindingEvidence): string[] {
  const parts: string[] = [];

  if (evidence.actual !== undefined && evidence.expected !== undefined) {
    parts.push(`actual=${evidence.actual}`);
    parts.push(`expected=${evidence.expected}`);
  } else if (evidence.actual !== undefined) {
    parts.push(`actual=${evidence.actual}`);
  } else if (evidence.expected !== undefined) {
    parts.push(`expected=${evidence.expected}`);
  }

  if (evidence.surface) {
    parts.push(`surface=${evidence.surface}`);
  }
  if (evidence.targetFile) {
    parts.push(`target=${evidence.targetFile}`);
  }
  if (evidence.relatedLocation) {
    parts.push(`related=${evidence.relatedLocation.file}:${evidence.relatedLocation.line}`);
  }
  if (evidence.patterns && evidence.patterns.length > 0) {
    parts.push(`patterns=${evidence.patterns.join(",")}`);
  }
  if (evidence.overlapFileCount !== undefined) {
    parts.push(`overlap=${evidence.overlapFileCount}`);
  }
  if (evidence.overlapFilesSample && evidence.overlapFilesSample.length > 0) {
    parts.push(`overlap_sample=${evidence.overlapFilesSample.join(",")}`);
  }
  if (evidence.matchedFileCount !== undefined) {
    parts.push(`matched=${evidence.matchedFileCount}`);
  }
  if (evidence.matchedFilesSample && evidence.matchedFilesSample.length > 0) {
    parts.push(`matched_sample=${evidence.matchedFilesSample.join(",")}`);
  }
  if (evidence.contributorFiles && evidence.contributorFiles.length > 0) {
    parts.push(`contributors=${evidence.contributorFiles.join(",")}`);
  }
  if (evidence.similarityScore !== undefined) {
    parts.push(`similarity=${(evidence.similarityScore * 100).toFixed(1)}%`);
  }

  return parts;
}

function appendInstructionFindingText(lines: string[], finding: InstructionFinding): void {
  lines.push(
    `- [${finding.severity}] ${finding.file}:${finding.line} ${finding.ruleId}: ${finding.message}`
  );
  if (!finding.evidence) {
    return;
  }

  const evidenceParts = formatInstructionFindingEvidenceParts(finding.evidence);
  if (evidenceParts.length > 0) {
    lines.push(`  evidence: ${evidenceParts.join(" | ")}`);
  }
}

function appendInstructionFindingMarkdown(lines: string[], finding: InstructionFinding): void {
  lines.push(
    `- **${finding.severity}** \`${finding.file}:${finding.line}\` \`${finding.ruleId}\`: ${finding.message}`
  );
  if (!finding.evidence) {
    return;
  }

  const evidenceParts = formatInstructionFindingEvidenceParts(finding.evidence);
  if (evidenceParts.length > 0) {
    lines.push(`  Evidence: ${evidenceParts.map((part) => `\`${part}\``).join(" ")}`);
  }
}

export function formatInspectReport(report: ContextReport): string {
  const lines = [
    `Source: ${report.sourceType}`,
    `Provider: ${report.provider ?? "unknown"}`,
    `Model: ${report.model ?? "unknown"}`,
    `Input tokens: ${report.totalInputTokens} (${report.totalConfidence})`,
    `Headroom: ${report.budget.remainingInputHeadroom ?? "unknown"} remaining`,
    `Risk: ${report.budget.risk} (${formatPercent(report.budget.usagePercent)})`,
    "",
    "Segments:"
  ];

  const sorted = [...report.segments].sort((left, right) => right.tokenCount - left.tokenCount);
  for (const segment of sorted) {
    lines.push(
      `- ${segment.label}: ${segment.tokenCount} tokens | ${segment.type} | ${segment.confidence} | ${segment.reclaimability}`
    );
  }

  if (report.suggestions.length > 0) {
    lines.push("", "Suggestions:");
    for (const suggestion of report.suggestions) {
      lines.push(`- [${suggestion.severity}] ${suggestion.message}`);
    }
  }

  if (report.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

export function formatDiffReport(report: DiffReport): string {
  const lines = [
    `Before: ${report.totalBefore} tokens`,
    `After: ${report.totalAfter} tokens`,
    `Delta: ${report.totalDelta >= 0 ? "+" : ""}${report.totalDelta} tokens`,
    "",
    "Changes:"
  ];

  for (const entry of report.entries) {
    lines.push(
      `- ${entry.label}: ${entry.before} -> ${entry.after} (${entry.delta >= 0 ? "+" : ""}${entry.delta})`
    );
  }

  return lines.join("\n");
}

export function formatInspectReportMarkdown(report: ContextReport): string {
  const lines = [
    "# Orqis Inspect Report",
    "",
    "## Summary",
    `- Source: ${report.sourceType}`,
    `- Provider: ${report.provider ?? "unknown"}`,
    `- Model: ${report.model ?? "unknown"}`,
    `- Input tokens: ${report.totalInputTokens} (${report.totalConfidence})`,
    `- Headroom: ${report.budget.remainingInputHeadroom ?? "unknown"} remaining`,
    `- Risk: ${report.budget.risk} (${formatPercent(report.budget.usagePercent)})`,
    "",
    "## Segments"
  ];

  const sorted = [...report.segments].sort((left, right) => right.tokenCount - left.tokenCount);
  if (sorted.length === 0) {
    lines.push("- none");
  } else {
    lines.push(
      ...markdownTable(
        ["Label", "Tokens", "Type", "Confidence", "Reclaimability"],
        sorted.map((segment) => [
          segment.label,
          String(segment.tokenCount),
          segment.type,
          segment.confidence,
          segment.reclaimability
        ])
      )
    );
  }

  if (report.suggestions.length > 0) {
    lines.push("", "## Suggestions");
    for (const suggestion of report.suggestions) {
      lines.push(`- **${suggestion.severity}**: ${suggestion.message}`);
    }
  }

  if (report.warnings.length > 0) {
    lines.push("", "## Warnings");
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

export function formatDiffReportMarkdown(report: DiffReport): string {
  const lines = [
    "# Orqis Diff Report",
    "",
    "## Summary",
    `- Before: ${report.totalBefore} tokens`,
    `- After: ${report.totalAfter} tokens`,
    `- Delta: ${report.totalDelta >= 0 ? "+" : ""}${report.totalDelta} tokens`,
    "",
    "## Changes"
  ];

  if (report.entries.length === 0) {
    lines.push("- none");
  } else {
    lines.push(
      ...markdownTable(
        ["Label", "Before", "After", "Delta"],
        report.entries.map((entry) => [
          entry.label,
          String(entry.before),
          String(entry.after),
          `${entry.delta >= 0 ? "+" : ""}${entry.delta}`
        ])
      )
    );
  }

  return lines.join("\n");
}

export function formatBudgetReport(report: ContextReport): string {
  const budget = report.budget;
  return [
    `Model: ${budget.model ?? report.model ?? "unknown"}`,
    `Input tokens used: ${budget.usedInputTokens}`,
    `Context window: ${budget.contextWindow ?? "unknown"}`,
    `Reserved output: ${budget.reservedOutput}`,
    `Remaining input headroom: ${budget.remainingInputHeadroom ?? "unknown"}`,
    `Usage: ${formatPercent(budget.usagePercent)}`,
    `Risk: ${budget.risk}`
  ].join("\n");
}

export function formatBudgetReportMarkdown(report: ContextReport): string {
  const budget = report.budget;
  return [
    "# Orqis Budget Report",
    "",
    "## Summary",
    `- Model: ${budget.model ?? report.model ?? "unknown"}`,
    `- Input tokens used: ${budget.usedInputTokens}`,
    `- Context window: ${budget.contextWindow ?? "unknown"}`,
    `- Reserved output: ${budget.reservedOutput}`,
    `- Remaining input headroom: ${budget.remainingInputHeadroom ?? "unknown"}`,
    `- Usage: ${formatPercent(budget.usagePercent)}`,
    `- Risk: ${budget.risk}`
  ].join("\n");
}

export function formatCheckReport(result: CheckResult): string {
  const lines = [
    `Status: ${result.passed ? "pass" : "fail"}`,
    `Source: ${result.report.sourceType}`,
    `Provider: ${result.report.provider ?? "unknown"}`,
    `Model: ${result.report.model ?? "unknown"}`,
    `Input tokens: ${result.report.totalInputTokens} (${result.report.totalConfidence})`,
    `Usage: ${formatPercent(result.report.budget.usagePercent)}`,
    `Risk: ${result.report.budget.risk}`,
    "",
    "Thresholds:"
  ];

  if (result.thresholds.maxTotalTokens !== undefined) {
    lines.push(`- max total tokens: ${result.thresholds.maxTotalTokens}`);
  }
  if (result.thresholds.maxUsagePercent !== undefined) {
    lines.push(`- max usage percent: ${formatPercent(result.thresholds.maxUsagePercent)}`);
  }
  if (result.thresholds.failOnRisk !== undefined) {
    lines.push(`- fail on risk: ${result.thresholds.failOnRisk}`);
  }
  const segmentThresholds = result.thresholds.maxSegmentTokens ?? {};
  for (const [segmentType, limit] of Object.entries(segmentThresholds)) {
    lines.push(`- max segment tokens: ${segmentType} <= ${limit}`);
  }

  lines.push("", "Violations:");
  if (result.violations.length === 0) {
    lines.push("- none");
  } else {
    for (const violation of result.violations) {
      lines.push(`- ${violation.message}`);
    }
  }

  if (result.baseline) {
    lines.push(
      "",
      "Baseline:",
      `- source: ${result.baseline.report.sourceType}`,
      `- input tokens: ${result.baseline.report.totalInputTokens}`,
      `- delta vs baseline: ${result.baseline.diff.totalDelta >= 0 ? "+" : ""}${result.baseline.diff.totalDelta} tokens`
    );

    const topChanges = result.baseline.diff.entries.slice(0, 3);
    if (topChanges.length > 0) {
      lines.push("Top changes:");
      for (const entry of topChanges) {
        lines.push(
          `- ${entry.label}: ${entry.delta >= 0 ? "+" : ""}${entry.delta} tokens`
        );
      }
    }
  }

  if (result.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

export function formatInstructionLintReport(report: InstructionLintReport): string {
  const lines = [
    `Status: ${report.passed ? "pass" : "fail"}`,
    `Profile: ${report.profile}`,
    `Surface: ${report.surface}`,
    `Model: ${report.model ?? "unknown"}`,
    `Context window: ${report.contextWindow ?? "unknown"}`,
    `Max applicable context share: ${formatPercent(report.maxApplicableContextPercent)}`,
    `Fail on severity: ${report.failOnSeverity}`,
    `Files: ${report.stats.totalFiles}`,
    `Applicable files: ${report.stats.applicableFiles}`,
    `Statements: ${report.stats.totalStatements}`,
    `Applicable statements: ${report.stats.applicableStatements}`,
    `Chars: ${report.stats.totalChars}`,
    `Estimated tokens: ${report.stats.totalEstimatedTokens} total | ${report.stats.applicableEstimatedTokens} applicable`,
    `Matched scope files: ${report.stats.totalMatchedFiles}`,
    `Max applicable tokens: ${report.stats.maxApplicableTokens}${report.stats.maxApplicableTargetFile ? ` (${report.stats.maxApplicableTargetFile})` : ""}`,
    `Findings: ${report.findings.length} (${report.stats.errorCount} errors, ${report.stats.warningCount} warnings)`,
    "",
    "Files:"
  ];

  if (report.files.length === 0) {
    lines.push("- none");
  } else {
    for (const file of report.files) {
      const applyTo = file.applyTo && file.applyTo.length > 0 ? ` | applyTo=${file.applyTo.join(",")}` : "";
      const excludeAgents =
        file.excludeAgents && file.excludeAgents.length > 0
          ? ` | excludeAgent=${file.excludeAgents.join(",")}`
          : "";
      const matched = file.matchedFileCount !== undefined ? ` | matches=${file.matchedFileCount}` : "";
      lines.push(
        `- ${file.file}: ${formatInstructionFileKind(file.kind)} | active=${file.appliesToSurface ? "yes" : "no"} | chars=${file.chars} | tokens=${file.estimatedTokens} | statements=${file.statementCount}${matched} | findings=${file.findings.length}${applyTo}${excludeAgents}`
      );
    }
  }

  lines.push("", "Findings:");
  if (report.findings.length === 0) {
    lines.push("- none");
  } else {
    for (const finding of report.findings) {
      appendInstructionFindingText(lines, finding);
    }
  }

  if (report.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

export function formatAgentSummary(summary: AgentSummary): string {
  const lines = ["Agents:"];
  for (const agent of summary.agents) {
    lines.push(
      `- ${agent.id}: ${agent.report?.totalInputTokens ?? 0} tokens | model=${agent.model ?? "unknown"} | parent=${agent.parentAgentId ?? "root"}`
    );
    const suggestions = agent.report?.suggestions ?? [];
    for (const suggestion of suggestions) {
      lines.push(`  suggestion: [${suggestion.severity}] ${suggestion.message}`);
    }
  }
  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of summary.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  return lines.join("\n");
}

export function formatAgentSummaryMarkdown(summary: AgentSummary): string {
  const lines = [
    "# Orqis Agent Report",
    "",
    "## Agents"
  ];

  if (summary.agents.length === 0) {
    lines.push("- none");
  } else {
    lines.push(
      ...markdownTable(
        ["Agent", "Tokens", "Model", "Parent"],
        summary.agents.map((agent) => [
          agent.id,
          String(agent.report?.totalInputTokens ?? 0),
          agent.model ?? "unknown",
          agent.parentAgentId ?? "root"
        ])
      )
    );

    for (const agent of summary.agents) {
      const suggestions = agent.report?.suggestions ?? [];
      if (suggestions.length === 0) {
        continue;
      }
      lines.push("", `### ${agent.id} Suggestions`);
      for (const suggestion of suggestions) {
        lines.push(`- **${suggestion.severity}**: ${suggestion.message}`);
      }
    }
  }

  if (summary.warnings.length > 0) {
    lines.push("", "## Warnings");
    for (const warning of summary.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

export function formatInstructionLintReportMarkdown(report: InstructionLintReport): string {
  const lines = [
    "# Orqis Instructions Lint Report",
    "",
    "## Summary",
    `- Status: ${report.passed ? "pass" : "fail"}`,
    `- Profile: ${report.profile}`,
    `- Surface: ${report.surface}`,
    `- Model: ${report.model ?? "unknown"}`,
    `- Context window: ${report.contextWindow ?? "unknown"}`,
    `- Max applicable context share: ${formatPercent(report.maxApplicableContextPercent)}`,
    `- Fail on severity: ${report.failOnSeverity}`,
    `- Files: ${report.stats.totalFiles}`,
    `- Applicable files: ${report.stats.applicableFiles}`,
    `- Statements: ${report.stats.totalStatements}`,
    `- Applicable statements: ${report.stats.applicableStatements}`,
    `- Chars: ${report.stats.totalChars}`,
    `- Estimated tokens: ${report.stats.totalEstimatedTokens} total / ${report.stats.applicableEstimatedTokens} applicable`,
    `- Matched scope files: ${report.stats.totalMatchedFiles}`,
    `- Max applicable tokens: ${report.stats.maxApplicableTokens}${report.stats.maxApplicableTargetFile ? ` (${report.stats.maxApplicableTargetFile})` : ""}`,
    `- Findings: ${report.findings.length} (${report.stats.errorCount} errors, ${report.stats.warningCount} warnings)`,
    "",
    "## Files"
  ];

  if (report.files.length === 0) {
    lines.push("- none");
  } else {
    lines.push(
      ...markdownTable(
        ["File", "Kind", "Active", "Apply To", "Exclude Agent", "Chars", "Tokens", "Statements", "Matched", "Findings"],
        report.files.map((file) => [
          file.file,
          formatInstructionFileKind(file.kind),
          file.appliesToSurface ? "yes" : "no",
          file.applyTo?.join(", ") ?? "-",
          file.excludeAgents?.join(", ") ?? "-",
          String(file.chars),
          String(file.estimatedTokens),
          String(file.statementCount),
          String(file.matchedFileCount ?? 0),
          String(file.findings.length)
        ])
      )
    );
  }

  lines.push("", "## Findings");
  if (report.findings.length === 0) {
    lines.push("- none");
  } else {
    for (const finding of report.findings) {
      appendInstructionFindingMarkdown(lines, finding);
    }
  }

  if (report.warnings.length > 0) {
    lines.push("", "## Warnings");
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}
