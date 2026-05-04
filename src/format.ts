import { formatPercent } from "./helpers.js";
import {
  COPILOT_CODE_REVIEW_CHAR_LIMIT,
  resolveInstructionBudgets
} from "./instructions/limits.js";
import type {
  AgentSummary,
  CheckResult,
  ContextReport,
  DiffReport,
  InstructionFileKind,
  InstructionFinding,
  InstructionFindingEvidence,
  InstructionLintPreset,
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
    case "repository":
      return "repository-wide";
    case "path-specific":
      return "path-specific";
    case "unsupported":
      return "unsupported";
  }
}

function formatInstructionPreset(preset?: InstructionLintPreset): string {
  switch (preset) {
    case "copilot":
      return "copilot";
    case "agents-md":
      return "agents-md";
    default:
      return "unknown";
  }
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatInstructionDetectedPresets(report: InstructionLintReport): string {
  return report.detectedPresets.length > 0 ? report.detectedPresets.join(", ") : "none";
}

function hasInstructionContextBudget(report: InstructionLintReport): boolean {
  return Boolean(report.model) ||
    report.contextWindow !== undefined ||
    (report.maxApplicableContextPercent !== undefined && !Number.isNaN(report.maxApplicableContextPercent));
}

function formatInstructionMaxApplicableLoad(report: InstructionLintReport): string {
  const tokens = `${report.stats.maxApplicableTokens} estimated tokens`;
  return report.stats.maxApplicableTargetFile
    ? `${tokens} on ${report.stats.maxApplicableTargetFile}`
    : tokens;
}

function instructionSeverityRank(severity: "warning" | "error"): number {
  return severity === "error" ? 2 : 1;
}

function formatInstructionResultReason(report: InstructionLintReport): string {
  if (report.failOnSeverity === "off") {
    return "advisory mode; findings are reported but do not fail the process";
  }

  const thresholdRank = instructionSeverityRank(report.failOnSeverity);
  const failingFindings = report.findings.filter(
    (finding) => instructionSeverityRank(finding.severity) >= thresholdRank
  ).length;

  if (failingFindings === 0) {
    return `pass; no findings at or above fail threshold ${report.failOnSeverity}`;
  }

  return `fail; ${pluralize(failingFindings, "finding")} at or above fail threshold ${report.failOnSeverity}`;
}

function formatInstructionFileLoad(report: InstructionLintReport): string {
  const unsupportedFiles = report.stats.unsupportedFiles;
  const unsupportedSuffix = unsupportedFiles > 0 ? `, ${unsupportedFiles} unsupported` : "";
  return `${report.stats.applicableFiles} loaded of ${report.stats.totalFiles} scanned${unsupportedSuffix}`;
}

function formatInstructionActiveText(report: InstructionLintReport): string {
  return `${report.stats.applicableEstimatedTokens} estimated tokens from ${pluralize(
    report.stats.applicableStatements,
    "parsed statement"
  )}`;
}

function formatInstructionFindingTotals(report: InstructionLintReport): string {
  return `${report.stats.errorCount} errors, ${report.stats.warningCount} warnings`;
}

function instructionSummaryLines(report: InstructionLintReport): string[] {
  return [
    `- Result: ${formatInstructionResultReason(report)}`,
    `- Instruction files: ${formatInstructionFileLoad(report)}`,
    `- Active instruction text: ${formatInstructionActiveText(report)}`,
    `- Largest target load: ${formatInstructionMaxApplicableLoad(report)}`,
    `- Target matches: ${report.stats.totalMatchedFiles} matched file references across instruction scopes`,
    `- Findings: ${formatInstructionFindingTotals(report)}`
  ];
}

function instructionLimitLines(report: InstructionLintReport): string[] {
  const budgets = resolveInstructionBudgets(report.profile, report.config?.budgetOverrides);
  const lines = [
    `- Profile ${report.profile}: repository files <= ${budgets.repositoryChars} chars / ${budgets.repositoryTokens} estimated tokens`,
    `- Profile ${report.profile}: path-specific files <= ${budgets.pathSpecificChars} chars / ${budgets.pathSpecificTokens} estimated tokens`,
    `- Profile ${report.profile}: target load <= ${budgets.maxApplicableTokens} estimated tokens; statements <= ${budgets.statements} per file; statement length <= ${budgets.wordsPerStatement} words`
  ];

  if (report.surface === "code-review" && report.detectedPresets.includes("copilot")) {
    lines.push(
      `- Copilot code review platform limit: ${COPILOT_CODE_REVIEW_CHAR_LIMIT} chars per instruction file`
    );
  }
  if ((report.surface === "all" || report.surface === "auto") && report.detectedPresets.includes("copilot")) {
    lines.push(
      `- Conditional Copilot code review platform limit: ${COPILOT_CODE_REVIEW_CHAR_LIMIT} chars per instruction file`
    );
  }

  return lines;
}

function formatInstructionSurfacePurpose(surface: string): string {
  switch (surface) {
    case "code-review":
      return "code review compatibility";
    case "all":
      return "all supported instruction surfaces";
    case "auto":
      return "all supported instruction surfaces";
    case "chat":
      return "chat assistance";
    case "coding-agent":
      return "autonomous coding agents";
    default:
      return "AI-assisted development";
  }
}

function instructionTermLines(report: InstructionLintReport): string[] {
  return [
    "- Lint purpose: context and agent engineering for repository instruction files; code review is one supported surface.",
    `- Surface: ${report.surface} means ${formatInstructionSurfacePurpose(report.surface)} for this run.`,
    "- Statement: one parsed instruction directive, counted from a bullet, numbered item, or paragraph block.",
    `- Applicable: loaded for the selected surface (${report.surface}) and eligible for matching target files.`,
    "- Target load: total active instruction tokens that can apply to one repository file.",
    "- Estimated tokens: local approximation for context pressure, not provider billing."
  ];
}

function formatInstructionFileScope(file: InstructionLintReport["files"][number]): string {
  const scopeParts: string[] = [];
  if (file.applyTo && file.applyTo.length > 0) {
    scopeParts.push(`applyTo=${file.applyTo.join(",")}`);
  }
  if (file.description) {
    scopeParts.push("activation=description");
  }
  if (file.scopePath) {
    scopeParts.push(`scope=${file.scopePath}`);
  }
  if (file.excludeAgents && file.excludeAgents.length > 0) {
    scopeParts.push(`excludeAgent=${file.excludeAgents.join(",")}`);
  }
  return scopeParts.length > 0 ? scopeParts.join("; ") : "-";
}

function formatInstructionFileStatus(file: InstructionLintReport["files"][number]): string {
  if (file.kind === "unsupported") {
    return "not loaded";
  }
  return file.appliesToSurface ? "active" : "inactive for surface";
}

function formatInstructionLintStatus(report: InstructionLintReport): string {
  if (report.failOnSeverity === "off") {
    return "advisory";
  }
  return report.passed ? "pass" : "fail";
}

function formatInstructionFileText(file: InstructionLintReport["files"][number]): string {
  const details = [formatInstructionFileKind(file.kind)];
  const preset = formatInstructionPreset(file.preset);
  if (preset !== "unknown") {
    details.push(preset);
  }
  details.push(formatInstructionFileStatus(file));
  details.push(`${file.estimatedTokens} tokens`);
  details.push(pluralize(file.statementCount, "statement"));
  if (file.matchedFileCount !== undefined) {
    details.push(`${pluralize(file.matchedFileCount, "matched file")}`);
  }
  details.push(pluralize(file.findings.length, "finding"));

  const scope = formatInstructionFileScope(file);
  if (scope !== "-") {
    details.push(scope);
  }

  return `- ${file.file}: ${details.join(", ")}`;
}

function formatInstructionFindingEvidenceParts(evidence: InstructionFindingEvidence): string[] {
  const parts: string[] = [];

  if (evidence.actual !== undefined && evidence.expected !== undefined) {
    parts.push(`observed=${evidence.actual}`);
    parts.push(`limit=${evidence.expected}`);
  } else if (evidence.actual !== undefined) {
    parts.push(`observed=${evidence.actual}`);
  } else if (evidence.expected !== undefined) {
    parts.push(`limit=${evidence.expected}`);
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
  lines.push(`- [${finding.severity}] ${finding.ruleId} at ${finding.file}:${finding.line}`);
  lines.push(`  Problem: ${finding.message}`);
  if (finding.suggestion) {
    lines.push(`  Fix: ${finding.suggestion}`);
  }

  if (finding.evidence) {
    const evidenceParts = formatInstructionFindingEvidenceParts(finding.evidence);
    if (evidenceParts.length > 0) {
      lines.push(`  Evidence: ${evidenceParts.join(" | ")}`);
    }
  }
}

function appendInstructionFindingMarkdown(lines: string[], finding: InstructionFinding): void {
  lines.push(`- **${finding.severity}** \`${finding.ruleId}\` at \`${finding.file}:${finding.line}\``);
  lines.push(`  Problem: ${finding.message}`);
  if (finding.suggestion) {
    lines.push(`  Fix: ${finding.suggestion}`);
  }

  if (finding.evidence) {
    const evidenceParts = formatInstructionFindingEvidenceParts(finding.evidence);
    if (evidenceParts.length > 0) {
      lines.push(`  Evidence: ${evidenceParts.map((part) => `\`${part}\``).join(" ")}`);
    }
  }
}

function appendInstructionLintControlLines(lines: string[], report: InstructionLintReport): void {
  const controlLines: string[] = [];

  if (report.config?.source) {
    controlLines.push(`Config: ${report.config.source}`);
  }
  if (report.config?.baselinePath) {
    controlLines.push(`Baseline: ${report.config.baselinePath}`);
  }
  if (report.config && report.config.overriddenRules.length > 0) {
    controlLines.push(`Rule overrides: ${report.config.overriddenRules.join(", ")}`);
  }
  if (report.config?.budgetOverrides && Object.keys(report.config.budgetOverrides).length > 0) {
    controlLines.push(
      `Budget overrides: ${Object.entries(report.config.budgetOverrides)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")}`
    );
  }
  if (report.config?.rollout) {
    const rollout = report.config.rollout;
    const rolloutParts = [
      rollout.stage ? `stage=${rollout.stage}` : undefined,
      rollout.owner ? `owner=${rollout.owner}` : undefined,
      rollout.policyVersion ? `policy=${rollout.policyVersion}` : undefined,
      rollout.ticket ? `ticket=${rollout.ticket}` : undefined,
      rollout.expiresOn ? `expires=${rollout.expiresOn}` : undefined
    ].filter((part): part is string => Boolean(part));
    if (rolloutParts.length > 0) {
      controlLines.push(`Rollout: ${rolloutParts.join(" | ")}`);
    }
  }
  if (report.config && report.config.ignore.length > 0) {
    controlLines.push(`Ignore globs: ${report.config.ignore.join(", ")}`);
  }
  if (report.config && report.config.suppressionCount > 0) {
    controlLines.push(`Suppressions: ${report.config.suppressionCount}`);
  }
  if (report.stats.ignoredInstructionFileCount > 0) {
    controlLines.push(`Ignored instruction files: ${report.stats.ignoredInstructionFileCount}`);
  }
  if (report.stats.ignoredTargetFileCount > 0) {
    controlLines.push(`Ignored target files: ${report.stats.ignoredTargetFileCount}`);
  }
  if (report.stats.suppressedFindingCount > 0) {
    controlLines.push(`Suppressed findings: ${report.stats.suppressedFindingCount}`);
  }
  if (report.stats.baselineMatchedFindingCount > 0) {
    controlLines.push(`Baseline-matched findings: ${report.stats.baselineMatchedFindingCount}`);
  }

  if (controlLines.length === 0) {
    return;
  }

  lines.push("", "Rollout Controls:", ...controlLines.map((line) => `- ${line}`));
}

function appendInstructionLintControlMarkdown(lines: string[], report: InstructionLintReport): void {
  const controlLines: string[] = [];

  if (report.config?.source) {
    controlLines.push(`- Config: ${report.config.source}`);
  }
  if (report.config?.baselinePath) {
    controlLines.push(`- Baseline: ${report.config.baselinePath}`);
  }
  if (report.config && report.config.overriddenRules.length > 0) {
    controlLines.push(`- Rule overrides: ${report.config.overriddenRules.join(", ")}`);
  }
  if (report.config?.budgetOverrides && Object.keys(report.config.budgetOverrides).length > 0) {
    controlLines.push(
      `- Budget overrides: ${Object.entries(report.config.budgetOverrides)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")}`
    );
  }
  if (report.config?.rollout) {
    const rollout = report.config.rollout;
    const rolloutParts = [
      rollout.stage ? `stage=${rollout.stage}` : undefined,
      rollout.owner ? `owner=${rollout.owner}` : undefined,
      rollout.policyVersion ? `policy=${rollout.policyVersion}` : undefined,
      rollout.ticket ? `ticket=${rollout.ticket}` : undefined,
      rollout.expiresOn ? `expires=${rollout.expiresOn}` : undefined
    ].filter((part): part is string => Boolean(part));
    if (rolloutParts.length > 0) {
      controlLines.push(`- Rollout: ${rolloutParts.join(" | ")}`);
    }
  }
  if (report.config && report.config.ignore.length > 0) {
    controlLines.push(`- Ignore globs: ${report.config.ignore.join(", ")}`);
  }
  if (report.config && report.config.suppressionCount > 0) {
    controlLines.push(`- Suppressions: ${report.config.suppressionCount}`);
  }
  if (report.stats.ignoredInstructionFileCount > 0) {
    controlLines.push(`- Ignored instruction files: ${report.stats.ignoredInstructionFileCount}`);
  }
  if (report.stats.ignoredTargetFileCount > 0) {
    controlLines.push(`- Ignored target files: ${report.stats.ignoredTargetFileCount}`);
  }
  if (report.stats.suppressedFindingCount > 0) {
    controlLines.push(`- Suppressed findings: ${report.stats.suppressedFindingCount}`);
  }
  if (report.stats.baselineMatchedFindingCount > 0) {
    controlLines.push(`- Baseline-matched findings: ${report.stats.baselineMatchedFindingCount}`);
  }

  if (controlLines.length === 0) {
    return;
  }

  lines.push("", "## Rollout Controls", ...controlLines);
}

function escapeGithubCommandData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeGithubProperty(value: string): string {
  return escapeGithubCommandData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

function escapeAzureProperty(value: string): string {
  return value
    .replace(/%/g, "%25")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/]/g, "%5D")
    .replace(/;/g, "%3B");
}

function escapeAzureMessage(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/]/g, "%5D");
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
    "# Tokn Inspect Report",
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
    "# Tokn Diff Report",
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
    "# Tokn Budget Report",
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

export function formatCheckReportMarkdown(result: CheckResult): string {
  const lines = [
    "# Tokn Check Report",
    "",
    "## Summary",
    `- Status: ${result.passed ? "pass" : "fail"}`,
    `- Source: ${result.report.sourceType}`,
    `- Provider: ${result.report.provider ?? "unknown"}`,
    `- Model: ${result.report.model ?? "unknown"}`,
    `- Input tokens: ${result.report.totalInputTokens} (${result.report.totalConfidence})`,
    `- Usage: ${formatPercent(result.report.budget.usagePercent)}`,
    `- Risk: ${result.report.budget.risk}`,
    "",
    "## Thresholds"
  ];

  if (result.thresholds.maxTotalTokens !== undefined) {
    lines.push(`- Max total tokens: ${result.thresholds.maxTotalTokens}`);
  }
  if (result.thresholds.maxUsagePercent !== undefined) {
    lines.push(`- Max usage percent: ${formatPercent(result.thresholds.maxUsagePercent)}`);
  }
  if (result.thresholds.failOnRisk !== undefined) {
    lines.push(`- Fail on risk: ${result.thresholds.failOnRisk}`);
  }
  for (const [segmentType, limit] of Object.entries(result.thresholds.maxSegmentTokens ?? {})) {
    lines.push(`- Max segment tokens: ${segmentType} <= ${limit}`);
  }

  lines.push("", "## Violations");
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
      "## Baseline",
      `- Source: ${result.baseline.report.sourceType}`,
      `- Input tokens: ${result.baseline.report.totalInputTokens}`,
      `- Delta vs baseline: ${result.baseline.diff.totalDelta >= 0 ? "+" : ""}${result.baseline.diff.totalDelta} tokens`
    );
  }

  if (result.warnings.length > 0) {
    lines.push("", "## Warnings");
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

export function formatInstructionLintReport(report: InstructionLintReport): string {
  const lines = [
    `Tokn Instructions Lint: ${formatInstructionLintStatus(report)}`,
    "",
    "Scope:",
    `- Preset: ${report.preset}`,
    `- Detected presets: ${formatInstructionDetectedPresets(report)}`,
    `- Profile: ${report.profile}`,
    `- Surface: ${report.surface} (${formatInstructionSurfacePurpose(report.surface)})`,
    `- Fail threshold: ${report.failOnSeverity}`,
    "",
    "Summary:",
    ...instructionSummaryLines(report),
    "",
    "Limits Used:",
    ...instructionLimitLines(report),
    "",
    "Terms:",
    ...instructionTermLines(report)
  ];

  if (hasInstructionContextBudget(report)) {
    lines.push(
      "",
      "Context Budget:",
      `- Model: ${report.model ?? "unknown"}`,
      `- Context window: ${report.contextWindow ?? "unknown"}`,
      `- Max applicable context share: ${formatPercent(report.maxApplicableContextPercent)}`
    );
  }

  appendInstructionLintControlLines(lines, report);
  lines.push("", "Instruction Files:");

  if (report.files.length === 0) {
    lines.push("- none");
  } else {
    for (const file of report.files) {
      lines.push(formatInstructionFileText(file));
    }
  }

  lines.push("", "Findings:");
  if (report.findings.length === 0) {
    lines.push("- none");
  } else {
    for (const [index, finding] of report.findings.entries()) {
      if (index > 0) {
        lines.push("");
      }
      appendInstructionFindingText(lines, finding);
    }
  }

  if (report.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  if (report.notes.length > 0) {
    lines.push("", "Notes:");
    for (const note of report.notes) {
      lines.push(`- ${note}`);
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
    "# Tokn Agent Report",
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
    "# Tokn Instructions Lint Report",
    "",
    `Status: **${formatInstructionLintStatus(report)}**`,
    "",
    "## Scope",
    `- Preset: ${report.preset}`,
    `- Detected presets: ${formatInstructionDetectedPresets(report)}`,
    `- Profile: ${report.profile}`,
    `- Surface: ${report.surface} (${formatInstructionSurfacePurpose(report.surface)})`,
    `- Fail threshold: ${report.failOnSeverity}`,
    "",
    "## Summary",
    ...instructionSummaryLines(report),
    "",
    "## Limits Used",
    ...instructionLimitLines(report),
    "",
    "## Terms",
    ...instructionTermLines(report),
  ];

  if (hasInstructionContextBudget(report)) {
    lines.push(
      "",
      "## Context Budget",
      `- Model: ${report.model ?? "unknown"}`,
      `- Context window: ${report.contextWindow ?? "unknown"}`,
      `- Max applicable context share: ${formatPercent(report.maxApplicableContextPercent)}`
    );
  }

  appendInstructionLintControlMarkdown(lines, report);
  lines.push("", "## Instruction Files");

  if (report.files.length === 0) {
    lines.push("- none");
  } else {
    lines.push(
      ...markdownTable(
        ["File", "Kind", "Preset", "Status", "Tokens", "Statements", "Matched", "Findings", "Scope"],
        report.files.map((file) => [
          file.file,
          formatInstructionFileKind(file.kind),
          formatInstructionPreset(file.preset),
          formatInstructionFileStatus(file),
          String(file.estimatedTokens),
          String(file.statementCount),
          String(file.matchedFileCount ?? 0),
          String(file.findings.length),
          formatInstructionFileScope(file)
        ])
      )
    );
  }

  lines.push("", "## Findings");
  if (report.findings.length === 0) {
    lines.push("- none");
  } else {
    for (const [index, finding] of report.findings.entries()) {
      if (index > 0) {
        lines.push("");
      }
      appendInstructionFindingMarkdown(lines, finding);
    }
  }

  if (report.warnings.length > 0) {
    lines.push("", "## Warnings");
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  if (report.notes.length > 0) {
    lines.push("", "## Notes");
    for (const note of report.notes) {
      lines.push(`- ${note}`);
    }
  }

  return lines.join("\n");
}

export function formatInstructionLintReportGithub(report: InstructionLintReport): string {
  const lines: string[] = [];

  for (const finding of report.findings) {
    const level = finding.severity === "error" ? "error" : "warning";
    const properties = [
      `file=${escapeGithubProperty(finding.file)}`,
      `line=${finding.line}`,
      `title=${escapeGithubProperty(`Tokn ${finding.ruleId}`)}`
    ];
    const evidenceParts = finding.evidence
      ? formatInstructionFindingEvidenceParts(finding.evidence)
      : [];
    const messageParts = [`[${finding.ruleId}] ${finding.message}`];
    if (finding.suggestion) {
      messageParts.push(`Suggestion: ${finding.suggestion}`);
    }
    if (evidenceParts.length > 0) {
      messageParts.push(`Evidence: ${evidenceParts.join(" | ")}`);
    }

    lines.push(`::${level} ${properties.join(",")}::${escapeGithubCommandData(messageParts.join(" "))}`);
  }

  const summaryLevel = report.passed ? "notice" : "notice";
  const summaryTitle = report.passed ? "Tokn instructions-lint passed" : "Tokn instructions-lint findings";
  lines.push(
    `::${summaryLevel} title=${escapeGithubProperty(summaryTitle)}::${escapeGithubCommandData(
      `files=${report.stats.totalFiles} findings=${report.findings.length} errors=${report.stats.errorCount} warnings=${report.stats.warningCount}`
    )}`
  );

  return lines.join("\n");
}

export function formatInstructionLintReportAzure(report: InstructionLintReport): string {
  const lines: string[] = [];

  for (const finding of report.findings) {
    const level = finding.severity === "error" ? "error" : "warning";
    const evidenceParts = finding.evidence
      ? formatInstructionFindingEvidenceParts(finding.evidence)
      : [];
    const messageParts = [`[${finding.ruleId}] ${finding.message}`];
    if (finding.suggestion) {
      messageParts.push(`Suggestion: ${finding.suggestion}`);
    }
    if (evidenceParts.length > 0) {
      messageParts.push(`Evidence: ${evidenceParts.join(" | ")}`);
    }

    lines.push(
      `##vso[task.logissue type=${level};sourcepath=${escapeAzureProperty(finding.file)};linenumber=${finding.line};code=${escapeAzureProperty(finding.ruleId)};]${escapeAzureMessage(messageParts.join(" "))}`
    );
  }

  const summary = `Tokn instructions-lint ${report.passed ? "passed" : "found issues"}: files=${report.stats.totalFiles} findings=${report.findings.length} errors=${report.stats.errorCount} warnings=${report.stats.warningCount}`;
  if (report.passed) {
    lines.push(summary);
  } else {
    lines.push(
      `##vso[task.logissue type=error;code=tokn-instructions-lint-summary;]${escapeAzureMessage(summary)}`
    );
  }

  return lines.join("\n");
}
