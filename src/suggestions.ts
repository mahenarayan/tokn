import { formatPercent } from "./helpers.js";
import type { ContextReport, ContextSegment, SegmentType, Suggestion } from "./types.js";

interface HeavyRule {
  code: string;
  segmentType: SegmentType;
  minTokens: number;
  minSharePercent: number;
  severity: Suggestion["severity"];
  message: (tokens: number, sharePercent: number) => string;
}

const HEAVY_RULES: HeavyRule[] = [
  {
    code: "tool-schema-heavy",
    segmentType: "tool_schema",
    minTokens: 256,
    minSharePercent: 20,
    severity: "warning",
    message: (tokens, sharePercent) =>
      `Tool schema uses ${tokens} tokens (${formatPercent(sharePercent)}) of visible context. Review whether every declared tool needs to be present in this request.`
  },
  {
    code: "assistant-history-heavy",
    segmentType: "assistant_history",
    minTokens: 256,
    minSharePercent: 25,
    severity: "warning",
    message: (tokens, sharePercent) =>
      `Assistant history uses ${tokens} tokens (${formatPercent(sharePercent)}) of visible context. Older assistant turns may be crowding out the current task.`
  },
  {
    code: "retrieval-context-heavy",
    segmentType: "retrieval_context",
    minTokens: 256,
    minSharePercent: 20,
    severity: "warning",
    message: (tokens, sharePercent) =>
      `Retrieval context uses ${tokens} tokens (${formatPercent(sharePercent)}) of visible context. Retrieved material may be dominating the prompt.`
  }
];

const DUPLICATE_ELIGIBLE_TYPES = new Set<SegmentType>([
  "assistant_history",
  "retrieval_context",
  "tool_result",
  "user"
]);

function normalizeText(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function visibleCompositionSegments(segments: ContextSegment[]): ContextSegment[] {
  return segments.filter(
    (segment) => segment.type !== "provider_overhead" && segment.type !== "agent_metadata"
  );
}

function segmentTotalsByType(segments: ContextSegment[]): Map<SegmentType, number> {
  const totals = new Map<SegmentType, number>();
  for (const segment of segments) {
    totals.set(segment.type, (totals.get(segment.type) ?? 0) + segment.tokenCount);
  }
  return totals;
}

function findRepeatedLargeSegments(
  segments: ContextSegment[],
  visibleTotal: number
): Suggestion[] {
  const groups = new Map<
    string,
    { type: SegmentType; count: number; totalTokens: number; labels: string[] }
  >();

  for (const segment of segments) {
    if (!DUPLICATE_ELIGIBLE_TYPES.has(segment.type) || segment.tokenCount < 64) {
      continue;
    }

    const normalized = normalizeText(segment.text);
    if (!normalized) {
      continue;
    }

    const key = `${segment.type}:${normalized}`;
    const group = groups.get(key) ?? {
      type: segment.type,
      count: 0,
      totalTokens: 0,
      labels: []
    };
    group.count += 1;
    group.totalTokens += segment.tokenCount;
    group.labels.push(segment.label);
    groups.set(key, group);
  }

  const duplicates = [...groups.values()]
    .filter((group) => group.count >= 2 && group.totalTokens >= 256)
    .sort((left, right) => right.totalTokens - left.totalTokens);

  const winner = duplicates[0];
  if (!winner) {
    return [];
  }

  const sharePercent = visibleTotal > 0 ? (winner.totalTokens / visibleTotal) * 100 : 0;
  return [
    {
      code: "repeated-large-segments",
      severity: "info",
      message: `Repeated ${winner.type.replaceAll("_", " ")} content appears ${winner.count} times and accounts for ${winner.totalTokens} tokens (${formatPercent(sharePercent)}) of visible context. Duplicate context may be inflating the prompt.`,
      segmentType: winner.type,
      tokenCount: winner.totalTokens,
      sharePercent,
      metadata: {
        count: winner.count,
        labels: winner.labels
      }
    }
  ];
}

export function buildSuggestions(report: Omit<ContextReport, "suggestions">): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const visibleSegments = visibleCompositionSegments(report.segments);
  const visibleTotal = visibleSegments.reduce((sum, segment) => sum + segment.tokenCount, 0);
  const totalsByType = segmentTotalsByType(report.segments);

  for (const rule of HEAVY_RULES) {
    const tokenCount = totalsByType.get(rule.segmentType) ?? 0;
    const sharePercent = visibleTotal > 0 ? (tokenCount / visibleTotal) * 100 : 0;
    if (tokenCount < rule.minTokens || sharePercent < rule.minSharePercent) {
      continue;
    }

    suggestions.push({
      code: rule.code,
      severity: rule.severity,
      message: rule.message(tokenCount, sharePercent),
      segmentType: rule.segmentType,
      tokenCount,
      sharePercent
    });
  }

  const providerOverheadTokens = totalsByType.get("provider_overhead") ?? 0;
  const providerOverheadShare =
    report.totalInputTokens > 0 ? (providerOverheadTokens / report.totalInputTokens) * 100 : 0;
  if (providerOverheadTokens >= 256 && providerOverheadShare >= 15) {
    suggestions.push({
      code: "provider-overhead-heavy",
      severity: "warning",
      message: `Provider overhead accounts for ${providerOverheadTokens} tokens (${formatPercent(providerOverheadShare)}) of total input. Hidden request framing or serialization overhead is materially above the visible segments.`,
      segmentType: "provider_overhead",
      tokenCount: providerOverheadTokens,
      sharePercent: providerOverheadShare
    });
  }

  if (report.budget.risk === "high" && report.budget.usagePercent !== undefined) {
    suggestions.push({
      code: "budget-pressure-high",
      severity: "warning",
      message: `Input usage is at ${formatPercent(report.budget.usagePercent)} of the model context window. Small prompt growth may push this request into truncation or summarization decisions.`,
      tokenCount: report.totalInputTokens,
      sharePercent: report.budget.usagePercent
    });
  } else if (report.budget.risk === "medium" && report.budget.usagePercent !== undefined) {
    suggestions.push({
      code: "budget-pressure-medium",
      severity: "info",
      message: `Input usage is at ${formatPercent(report.budget.usagePercent)} of the model context window. Budget headroom is tightening.`,
      tokenCount: report.totalInputTokens,
      sharePercent: report.budget.usagePercent
    });
  }

  suggestions.push(...findRepeatedLargeSegments(visibleSegments, visibleTotal));

  return suggestions;
}
