import { getModelLimit } from "./models.js";
import { asArray, isObject } from "./helpers.js";
import { estimateJsonTokens, estimateTextTokens } from "./tokenizer.js";
import type {
  AgentSnapshot,
  AgentSummary,
  BudgetSummary,
  ContextReport,
  ContextSegment,
  CountConfidence,
  DiffReport,
  Reclaimability,
  SegmentType
} from "./types.js";

type AnyObject = Record<string, unknown>;

function createSegment(
  id: string,
  type: SegmentType,
  label: string,
  source: string,
  text: string | undefined,
  confidence: CountConfidence,
  visibility: ContextSegment["visibility"],
  reclaimability: Reclaimability,
  role?: string,
  metadata?: Record<string, unknown>,
  tokenOverride?: number
): ContextSegment {
  return {
    id,
    type,
    label,
    source,
    tokenCount: tokenOverride ?? (text ? estimateTextTokens(text) : estimateJsonTokens(metadata ?? {})),
    confidence,
    visibility,
    reclaimability,
    ...(role ? { role } : {}),
    ...(text ? { text } : {}),
    ...(metadata ? { metadata } : {})
  };
}

function summarizeContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (isObject(entry) && typeof entry.text === "string") {
          return entry.text;
        }
        return JSON.stringify(entry);
      })
      .join("\n");
  }

  if (isObject(value)) {
    if (typeof value.text === "string") {
      return value.text;
    }
    return JSON.stringify(value);
  }

  return String(value ?? "");
}

function detectProvider(payload: AnyObject): string | undefined {
  if (payload.provider && typeof payload.provider === "string") {
    return payload.provider;
  }
  if ("anthropic_version" in payload || payload.type === "anthropic_request") {
    return "anthropic";
  }
  if ("messages" in payload || "input" in payload || "response_format" in payload) {
    return "openai";
  }
  return undefined;
}

function detectModel(payload: AnyObject): string | undefined {
  return typeof payload.model === "string" ? payload.model : undefined;
}

function usageInputTokens(payload: AnyObject): number | undefined {
  const usage = payload.usage;
  if (!isObject(usage)) {
    return undefined;
  }

  const candidates = [
    usage.input_tokens,
    usage.prompt_tokens,
    usage.inputTokens,
    usage.promptTokens
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number") {
      return candidate;
    }
  }

  return undefined;
}

function roleToSegment(role: string): SegmentType {
  switch (role) {
    case "system":
      return "system";
    case "developer":
      return "developer";
    case "assistant":
      return "assistant_history";
    case "tool":
      return "tool_result";
    default:
      return "user";
  }
}

function reclaimabilityForType(type: SegmentType): Reclaimability {
  switch (type) {
    case "assistant_history":
      return "summarize";
    case "tool_result":
    case "retrieval_context":
      return "cache";
    case "provider_overhead":
    case "system":
    case "developer":
    case "agent_metadata":
      return "keep";
    default:
      return "drop";
  }
}

function createBudget(model: string | undefined, usedInputTokens: number): BudgetSummary {
  const modelLimit = getModelLimit(model);
  if (!modelLimit) {
    return {
      reservedOutput: 0,
      usedInputTokens,
      risk: "unknown",
      ...(model ? { model } : {})
    };
  }

  const remainingInputHeadroom = Math.max(
    0,
    modelLimit.contextWindow - modelLimit.defaultReservedOutput - usedInputTokens
  );
  const usagePercent = (usedInputTokens / modelLimit.contextWindow) * 100;
  const risk =
    usagePercent >= 85 ? "high" : usagePercent >= 60 ? "medium" : "low";

  return {
    model: modelLimit.id,
    contextWindow: modelLimit.contextWindow,
    reservedOutput: modelLimit.defaultReservedOutput,
    usedInputTokens,
    remainingInputHeadroom,
    usagePercent,
    risk
  };
}

function finalizeReport(
  sourceType: string,
  model: string | undefined,
  provider: string | undefined,
  segments: ContextSegment[],
  warnings: string[],
  metadata?: Record<string, unknown>,
  exactTotal?: number
): ContextReport {
  const estimatedTotal = segments.reduce((sum, segment) => sum + segment.tokenCount, 0);

  if (exactTotal !== undefined && exactTotal > estimatedTotal) {
    segments.push(
      createSegment(
        `provider-overhead-${segments.length + 1}`,
        "provider_overhead",
        "Provider overhead",
        "provider",
        undefined,
        "provider-reported",
        "hidden/estimated",
        "keep",
        undefined,
        { exactTotal, estimatedVisibleTokens: estimatedTotal },
        exactTotal - estimatedTotal
      )
    );
  }

  const totalInputTokens = exactTotal ?? segments.reduce((sum, segment) => sum + segment.tokenCount, 0);
  const totalConfidence =
    exactTotal !== undefined
      ? "exact"
      : segments.some((segment) => segment.confidence === "heuristic")
        ? "heuristic"
        : "tokenizer-based";

  return {
    sourceType,
    segments,
    totalInputTokens,
    totalConfidence,
    budget: createBudget(model, totalInputTokens),
    warnings,
    ...(model ? { model } : {}),
    ...(provider ? { provider } : {}),
    ...(metadata ? { metadata } : {})
  };
}

function analyzeMessagesPayload(payload: AnyObject, sourceType: string): ContextReport {
  const messages = asArray(payload.messages);
  const provider = detectProvider(payload);
  const model = detectModel(payload);
  const exactTotal = usageInputTokens(payload);
  const warnings: string[] = [];
  const segments: ContextSegment[] = [];

  messages.forEach((message, index) => {
    if (!isObject(message)) {
      warnings.push(`Ignored non-object message at index ${index}.`);
      return;
    }

    const role = typeof message.role === "string" ? message.role : "user";
    const type = roleToSegment(role);
    const content = summarizeContent(message.content);
    segments.push(
      createSegment(
        `message-${index + 1}`,
        type,
        `${role} message ${index + 1}`,
        sourceType,
        content,
        exactTotal !== undefined ? "provider-reported" : "tokenizer-based",
        "explicit",
        reclaimabilityForType(type),
        role,
        { index }
      )
    );

    if (Array.isArray(message.tool_calls)) {
      segments.push(
        createSegment(
          `tool-schema-${index + 1}`,
          "tool_schema",
          `Tool schema ${index + 1}`,
          sourceType,
          JSON.stringify(message.tool_calls),
          exactTotal !== undefined ? "provider-reported" : "heuristic",
          "derived",
          "cache",
          "tool",
          { index }
        )
      );
    }
  });

  if (Array.isArray(payload.tools)) {
    segments.push(
      createSegment(
        "request-tools",
        "tool_schema",
        "Declared tools",
        sourceType,
        JSON.stringify(payload.tools),
        exactTotal !== undefined ? "provider-reported" : "heuristic",
        "derived",
        "cache"
      )
    );
  }

  return finalizeReport(sourceType, model, provider, segments, warnings, { sourceType }, exactTotal);
}

function analyzeOpenAIInputPayload(payload: AnyObject): ContextReport {
  const inputs = asArray(payload.input);
  const model = detectModel(payload);
  const provider = "openai";
  const exactTotal = usageInputTokens(payload);
  const warnings: string[] = [];
  const segments: ContextSegment[] = [];

  inputs.forEach((entry, index) => {
    if (typeof entry === "string") {
      segments.push(
        createSegment(
          `input-${index + 1}`,
          "user",
          `input ${index + 1}`,
          "openai-input",
          entry,
          exactTotal !== undefined ? "provider-reported" : "tokenizer-based",
          "explicit",
          "drop",
          "user"
        )
      );
      return;
    }

    if (!isObject(entry)) {
      warnings.push(`Ignored unsupported input entry at index ${index}.`);
      return;
    }

    const role = typeof entry.role === "string" ? entry.role : "user";
    const type = roleToSegment(role);
    segments.push(
      createSegment(
        `input-${index + 1}`,
        type,
        `${role} input ${index + 1}`,
        "openai-input",
        summarizeContent(entry.content),
        exactTotal !== undefined ? "provider-reported" : "tokenizer-based",
        "explicit",
        reclaimabilityForType(type),
        role,
        { index }
      )
    );
  });

  if (Array.isArray(payload.tools)) {
    segments.push(
      createSegment(
        "request-tools",
        "tool_schema",
        "Declared tools",
        "openai-input",
        JSON.stringify(payload.tools),
        exactTotal !== undefined ? "provider-reported" : "heuristic",
        "derived",
        "cache"
      )
    );
  }

  return finalizeReport("openai-input", model, provider, segments, warnings, undefined, exactTotal);
}

function analyzeTranscript(payload: AnyObject): ContextReport {
  const transcript = asArray(payload.transcript ?? payload.conversation ?? payload.turns);
  const model = detectModel(payload);
  const provider = detectProvider(payload);
  const warnings: string[] = [];
  const segments: ContextSegment[] = [];

  transcript.forEach((entry, index) => {
    if (!isObject(entry)) {
      warnings.push(`Ignored invalid transcript entry at index ${index}.`);
      return;
    }

    const role = typeof entry.role === "string" ? entry.role : "user";
    const type = roleToSegment(role);
    const label = typeof entry.label === "string" ? entry.label : `${role} turn ${index + 1}`;

    segments.push(
      createSegment(
        `turn-${index + 1}`,
        type,
        label,
        "transcript",
        summarizeContent(entry.content ?? entry.text),
        "tokenizer-based",
        "explicit",
        reclaimabilityForType(type),
        role,
        { index }
      )
    );

    if (entry.kind === "retrieval" || entry.source === "rag") {
      segments.push(
        createSegment(
          `retrieval-${index + 1}`,
          "retrieval_context",
          `Retrieval context ${index + 1}`,
          "transcript",
          JSON.stringify(entry),
          "heuristic",
          "derived",
          "cache",
          undefined,
          { index }
        )
      );
    }
  });

  return finalizeReport("transcript", model, provider, segments, warnings);
}

function normalizeAgentEntry(entry: AnyObject, index: number): AgentSnapshot {
  const payload = entry.payload;
  const report =
    isObject(entry.report) && Array.isArray(entry.report.segments)
      ? (entry.report as unknown as ContextReport)
      : isObject(payload)
        ? analyzePayload(payload)
        : undefined;

  return {
    id: typeof entry.id === "string" ? entry.id : `agent-${index + 1}`,
    ...(typeof entry.parentAgentId === "string" ? { parentAgentId: entry.parentAgentId } : {}),
    ...(typeof entry.model === "string" ? { model: entry.model } : report?.model ? { model: report.model } : {}),
    ...(typeof entry.provider === "string"
      ? { provider: entry.provider }
      : report?.provider
        ? { provider: report.provider }
        : {}),
    ...(typeof entry.turnNumber === "number" ? { turnNumber: entry.turnNumber } : {}),
    ...(typeof entry.timestamp === "string" ? { timestamp: entry.timestamp } : {}),
    ...(payload !== undefined ? { payload } : {}),
    ...(report ? { report } : {}),
    ...(isObject(entry.metadata) ? { metadata: entry.metadata } : {})
  };
}

export function analyzeAgentSnapshot(payload: unknown): AgentSummary {
  if (!isObject(payload) || !Array.isArray(payload.agents)) {
    throw new Error("Agent snapshot must contain an agents array.");
  }

  const warnings: string[] = [];
  const agents = payload.agents.map((entry, index) => {
    if (!isObject(entry)) {
      warnings.push(`Ignored invalid agent entry at index ${index}.`);
      return undefined;
    }
    return normalizeAgentEntry(entry, index);
  }).filter((entry): entry is AgentSnapshot => entry !== undefined);

  return { agents, warnings };
}

export function analyzePayload(payload: unknown): ContextReport {
  if (!isObject(payload)) {
    throw new Error("Input must be a JSON object.");
  }

  if (Array.isArray(payload.messages)) {
    const provider = detectProvider(payload);
    if (provider === "anthropic") {
      return analyzeMessagesPayload(payload, "anthropic-messages");
    }
    return analyzeMessagesPayload(payload, "openai-messages");
  }

  if ("input" in payload) {
    return analyzeOpenAIInputPayload(payload);
  }

  if ("transcript" in payload || "conversation" in payload || "turns" in payload) {
    return analyzeTranscript(payload);
  }

  throw new Error(
    "Unsupported payload shape. Expected messages, input, transcript/conversation/turns, or agent snapshot."
  );
}

export function diffReports(before: ContextReport, after: ContextReport): DiffReport {
  const map = new Map<string, { label: string; before: number; after: number }>();

  for (const segment of before.segments) {
    map.set(segment.id, { label: segment.label, before: segment.tokenCount, after: 0 });
  }
  for (const segment of after.segments) {
    const existing = map.get(segment.id);
    if (existing) {
      existing.after = segment.tokenCount;
    } else {
      map.set(segment.id, { label: segment.label, before: 0, after: segment.tokenCount });
    }
  }

  const entries = [...map.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      before: value.before,
      after: value.after,
      delta: value.after - value.before
    }))
    .filter((entry) => entry.delta !== 0)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));

  return {
    beforeSource: before.sourceType,
    afterSource: after.sourceType,
    totalBefore: before.totalInputTokens,
    totalAfter: after.totalInputTokens,
    totalDelta: after.totalInputTokens - before.totalInputTokens,
    entries
  };
}
