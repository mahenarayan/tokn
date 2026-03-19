import { createHash } from "node:crypto";
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

function stableHash(parts: Array<string | number | undefined>): string {
  const raw = parts.map((part) => String(part ?? "")).join("|");
  return createHash("sha1").update(raw).digest("hex").slice(0, 12);
}

function normalizeSegmentText(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function buildStableSegmentId(
  type: SegmentType,
  source: string,
  role: string | undefined,
  text: string | undefined,
  _metadata: Record<string, unknown> | undefined,
  fallbackId: string
): string {
  const normalizedText = normalizeSegmentText(text);
  const fingerprint = stableHash([source, type, role, normalizedText]);

  return `${type}-${fingerprint || fallbackId}`;
}

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
  const stableId = buildStableSegmentId(type, source, role, text, metadata, id);

  return {
    id: stableId,
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

function partTypeToSegmentType(partType: string, fallbackType: SegmentType): SegmentType {
  switch (partType) {
    case "text":
    case "input_text":
    case "output_text":
      return fallbackType;
    case "image":
    case "input_image":
    case "image_url":
    case "file":
    case "input_file":
    case "document":
      return "attachment";
    case "tool_result":
    case "tool_output":
    case "computer_call_output":
      return "tool_result";
    case "search_result":
    case "retrieval":
    case "retrieval_result":
    case "document_chunk":
      return "retrieval_context";
    default:
      return fallbackType;
  }
}

function appendContentSegments(
  segments: ContextSegment[],
  options: {
    baseId: string;
    source: string;
    labelPrefix: string;
    role: string;
    content: unknown;
    confidence: CountConfidence;
    defaultVisibility: ContextSegment["visibility"];
    defaultMetadata?: Record<string, unknown>;
  }
): void {
  const fallbackType = roleToSegment(options.role);
  const baseMetadata = options.defaultMetadata;

  if (typeof options.content === "string" || !Array.isArray(options.content)) {
    const text = summarizeContent(options.content);
    segments.push(
      createSegment(
        options.baseId,
        fallbackType,
        options.labelPrefix,
        options.source,
        text,
        options.confidence,
        options.defaultVisibility,
        reclaimabilityForType(fallbackType),
        options.role,
        baseMetadata
      )
    );
    return;
  }

  options.content.forEach((part, partIndex) => {
    const partId = `${options.baseId}-part-${partIndex + 1}`;
    if (typeof part === "string") {
      segments.push(
        createSegment(
          partId,
          fallbackType,
          `${options.labelPrefix} part ${partIndex + 1}`,
          options.source,
          part,
          options.confidence,
          options.defaultVisibility,
          reclaimabilityForType(fallbackType),
          options.role,
          { ...(baseMetadata ?? {}), partIndex, partType: "text" }
        )
      );
      return;
    }

    if (!isObject(part)) {
      segments.push(
        createSegment(
          partId,
          fallbackType,
          `${options.labelPrefix} part ${partIndex + 1}`,
          options.source,
          JSON.stringify(part),
          "heuristic",
          "derived",
          reclaimabilityForType(fallbackType),
          options.role,
          { ...(baseMetadata ?? {}), partIndex, partType: "unknown" }
        )
      );
      return;
    }

    const rawPartType = typeof part.type === "string" ? part.type : "text";
    const segmentType = partTypeToSegmentType(rawPartType, fallbackType);
    const partText =
      typeof part.text === "string"
        ? part.text
        : typeof part.output_text === "string"
          ? part.output_text
          : typeof part.input_text === "string"
            ? part.input_text
            : JSON.stringify(part);

    const visibility =
      segmentType === fallbackType ? options.defaultVisibility : "derived";

    segments.push(
      createSegment(
        partId,
        segmentType,
        `${options.labelPrefix} part ${partIndex + 1}`,
        options.source,
        partText,
        options.confidence,
        visibility,
        reclaimabilityForType(segmentType),
        options.role,
        { ...(baseMetadata ?? {}), partIndex, partType: rawPartType }
      )
    );
  });
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
    appendContentSegments(segments, {
      baseId: `message-${index + 1}`,
      labelPrefix: `${role} message ${index + 1}`,
      source: sourceType,
      role,
      content: message.content,
      confidence: exactTotal !== undefined ? "provider-reported" : "tokenizer-based",
      defaultVisibility: "explicit",
      defaultMetadata: { index }
    });

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
      appendContentSegments(segments, {
        baseId: `input-${index + 1}`,
        labelPrefix: `input ${index + 1}`,
        source: "openai-input",
        role: "user",
        content: entry,
        confidence: exactTotal !== undefined ? "provider-reported" : "tokenizer-based",
        defaultVisibility: "explicit"
      });
      return;
    }

    if (!isObject(entry)) {
      warnings.push(`Ignored unsupported input entry at index ${index}.`);
      return;
    }

    const role = typeof entry.role === "string" ? entry.role : "user";
    appendContentSegments(segments, {
      baseId: `input-${index + 1}`,
      labelPrefix: `${role} input ${index + 1}`,
      source: "openai-input",
      role,
      content: entry.content,
      confidence: exactTotal !== undefined ? "provider-reported" : "tokenizer-based",
      defaultVisibility: "explicit",
      defaultMetadata: { index }
    });
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
    const label = typeof entry.label === "string" ? entry.label : `${role} turn ${index + 1}`;
    appendContentSegments(segments, {
      baseId: `turn-${index + 1}`,
      labelPrefix: label,
      source: "transcript",
      role,
      content: entry.content ?? entry.text,
      confidence: "tokenizer-based",
      defaultVisibility: "explicit",
      defaultMetadata: { index }
    });

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

function analyzeAgentPayload(payload: AnyObject): ContextReport {
  const summary = analyzeAgentSnapshot(payload);
  const segments = summary.agents.map((agent, index) =>
    createSegment(
      `agent-${index + 1}`,
      "agent_metadata",
      `Agent ${agent.id}`,
      "agent-snapshot",
      undefined,
      "heuristic",
      "derived",
      "keep",
      "agent",
      {
        agentId: agent.id,
        parentAgentId: agent.parentAgentId,
        model: agent.model,
        provider: agent.provider,
        turnNumber: agent.turnNumber,
        timestamp: agent.timestamp
      },
      agent.report?.totalInputTokens ?? 0
    )
  );

  const inferredModel =
    summary.agents.length === 1 ? summary.agents[0]?.model : undefined;
  const warnings = [
    ...summary.warnings,
    "Agent snapshot aggregated into a single context report. Use agent-report for per-agent detail."
  ];

  return finalizeReport(
    "agent-snapshot",
    inferredModel,
    undefined,
    segments,
    warnings,
    { agentCount: summary.agents.length }
  );
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

  if (Array.isArray(payload.agents)) {
    return analyzeAgentPayload(payload);
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
