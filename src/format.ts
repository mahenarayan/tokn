import { formatPercent } from "./helpers.js";
import type { AgentSummary, ContextReport, DiffReport } from "./types.js";

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
