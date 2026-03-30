import { diffReports } from "./analyzer.js";
import { formatPercent } from "./helpers.js";
import type {
  CheckResult,
  CheckRiskThreshold,
  CheckThresholds,
  CheckViolation,
  ContextReport,
  SegmentType
} from "./types.js";

const RISK_ORDER: Record<CheckRiskThreshold, number> = {
  low: 1,
  medium: 2,
  high: 3
};

export const KNOWN_SEGMENT_TYPES: SegmentType[] = [
  "system",
  "developer",
  "user",
  "assistant_history",
  "tool_schema",
  "tool_result",
  "retrieval_context",
  "attachment",
  "provider_overhead",
  "agent_metadata"
];

function aggregateSegmentTotals(report: ContextReport): Map<SegmentType, number> {
  const totals = new Map<SegmentType, number>();
  for (const segment of report.segments) {
    totals.set(segment.type, (totals.get(segment.type) ?? 0) + segment.tokenCount);
  }
  return totals;
}

export function evaluateCheck(
  report: ContextReport,
  thresholds: CheckThresholds,
  baseline?: ContextReport
): CheckResult {
  const warnings = [...report.warnings];
  const violations: CheckViolation[] = [];
  const segmentTotals = aggregateSegmentTotals(report);

  if (
    thresholds.maxTotalTokens !== undefined &&
    report.totalInputTokens > thresholds.maxTotalTokens
  ) {
    violations.push({
      code: "max-total-tokens",
      message: `Total input tokens ${report.totalInputTokens} exceed the configured limit ${thresholds.maxTotalTokens}.`,
      actual: report.totalInputTokens,
      expected: thresholds.maxTotalTokens
    });
  }

  if (thresholds.maxUsagePercent !== undefined) {
    if (report.budget.usagePercent === undefined) {
      warnings.push(
        "Usage percent is unavailable because model context-window metadata is unknown; max-usage-percent was not evaluated."
      );
    } else if (report.budget.usagePercent > thresholds.maxUsagePercent) {
      violations.push({
        code: "max-usage-percent",
        message: `Usage percent ${formatPercent(report.budget.usagePercent)} exceeds the configured limit ${formatPercent(thresholds.maxUsagePercent)}.`,
        actual: report.budget.usagePercent,
        expected: thresholds.maxUsagePercent
      });
    }
  }

  const segmentThresholds = thresholds.maxSegmentTokens ?? {};
  for (const [segmentType, limit] of Object.entries(segmentThresholds) as Array<[SegmentType, number]>) {
    const actual = segmentTotals.get(segmentType) ?? 0;
    if (actual > limit) {
      violations.push({
        code: "max-segment-tokens",
        message: `Segment type ${segmentType} uses ${actual} tokens and exceeds the configured limit ${limit}.`,
        actual,
        expected: limit,
        segmentType
      });
    }
  }

  if (thresholds.failOnRisk !== undefined) {
    if (report.budget.risk === "unknown") {
      warnings.push(
        "Budget risk is unavailable because model context-window metadata is unknown; fail-on-risk was not evaluated."
      );
    } else if (RISK_ORDER[report.budget.risk] >= RISK_ORDER[thresholds.failOnRisk]) {
      violations.push({
        code: "fail-on-risk",
        message: `Budget risk ${report.budget.risk} meets or exceeds the configured fail-on-risk threshold ${thresholds.failOnRisk}.`,
        actual: report.budget.risk,
        expected: thresholds.failOnRisk
      });
    }
  }

  const result: CheckResult = {
    passed: violations.length === 0,
    exitCode: violations.length === 0 ? 0 : 2,
    thresholds,
    violations,
    warnings,
    report,
    ...(baseline
      ? {
          baseline: {
            report: baseline,
            diff: diffReports(baseline, report)
          }
        }
      : {})
  };

  return result;
}
