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

interface NormalizedTraceSpan {
  spanId: string;
  parentSpanId?: string;
  name: string;
  attributes: Record<string, unknown>;
}

function stableHash(parts: Array<string | number | undefined>): string {
  const raw = parts.map((part) => String(part ?? "")).join("|");
  return createHash("sha1").update(raw).digest("hex").slice(0, 12);
}

function decodeOtelValue(value: unknown): unknown {
  if (!isObject(value)) {
    return value;
  }

  const scalarKeys = [
    "stringValue",
    "boolValue",
    "intValue",
    "doubleValue"
  ] as const;

  for (const key of scalarKeys) {
    if (!(key in value)) {
      continue;
    }

    const candidate = value[key];
    if (key === "intValue" && typeof candidate === "string") {
      const parsed = Number(candidate);
      return Number.isNaN(parsed) ? candidate : parsed;
    }
    return candidate;
  }

  if (isObject(value.arrayValue) && Array.isArray(value.arrayValue.values)) {
    return value.arrayValue.values.map((item) => decodeOtelValue(item));
  }

  if (isObject(value.kvlistValue) && Array.isArray(value.kvlistValue.values)) {
    const record: Record<string, unknown> = {};
    for (const entry of value.kvlistValue.values) {
      if (!isObject(entry) || typeof entry.key !== "string") {
        continue;
      }
      record[entry.key] = decodeOtelValue(entry.value);
    }
    return record;
  }

  if ("bytesValue" in value) {
    return value.bytesValue;
  }

  return value;
}

function normalizeTraceAttributes(attributes: unknown): Record<string, unknown> {
  if (Array.isArray(attributes)) {
    const record: Record<string, unknown> = {};
    for (const entry of attributes) {
      if (!isObject(entry) || typeof entry.key !== "string") {
        continue;
      }
      record[entry.key] = decodeOtelValue(entry.value);
    }
    return record;
  }

  if (isObject(attributes)) {
    return attributes;
  }

  return {};
}

function normalizeSegmentText(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function buildStableSegmentId(
  type: SegmentType,
  source: string,
  role: string | undefined,
  text: string | undefined,
  metadata: Record<string, unknown> | undefined,
  fallbackId: string
): string {
  const normalizedText = normalizeSegmentText(text);
  const metadataSignature =
    text === undefined && metadata !== undefined ? JSON.stringify(metadata) : "";
  const fingerprint = stableHash([source, type, role, normalizedText, metadataSignature]);

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
    tokenCount:
      tokenOverride ?? (text !== undefined ? estimateTextTokens(text) : estimateJsonTokens(metadata ?? {})),
    confidence,
    visibility,
    reclaimability,
    ...(role ? { role } : {}),
    ...(text !== undefined ? { text } : {}),
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

function isTracePayload(payload: AnyObject): boolean {
  return (
    Array.isArray(payload.resourceSpans) ||
    Array.isArray(payload.scopeSpans) ||
    Array.isArray(payload.spans)
  );
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
    case "audio":
    case "input_audio":
      return "attachment";
    case "tool_use":
    case "function_call":
    case "file_search_call":
    case "web_search_call":
    case "computer_call":
    case "code_interpreter_call":
    case "custom_tool_call":
      return "tool_schema";
    case "tool_result":
    case "tool_output":
    case "computer_call_output":
    case "function_call_output":
    case "custom_tool_call_output":
      return "tool_result";
    case "search_result":
    case "retrieval":
    case "retrieval_result":
    case "document_chunk":
    case "file_search_result":
      return "retrieval_context";
    default:
      return fallbackType;
  }
}

function extractPartText(part: AnyObject): string {
  const directTextCandidates = [
    part.text,
    part.output_text,
    part.input_text,
    part.arguments,
    part.output
  ];

  for (const candidate of directTextCandidates) {
    if (typeof candidate === "string") {
      return candidate;
    }
  }

  if (part.content !== undefined) {
    return summarizeContent(part.content);
  }

  if (Array.isArray(part.summary)) {
    return summarizeContent(part.summary);
  }

  if (part.input !== undefined) {
    return JSON.stringify(part.input);
  }

  if (Array.isArray(part.results)) {
    return JSON.stringify(part.results);
  }

  if (isObject(part.source)) {
    return JSON.stringify(part.source);
  }

  return JSON.stringify(part);
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

  if (typeof options.content === "string") {
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

  const contentParts = Array.isArray(options.content)
    ? options.content
    : isObject(options.content)
      ? [options.content]
      : undefined;

  if (!contentParts) {
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

  contentParts.forEach((part, partIndex) => {
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
    const partText = extractPartText(part);

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

function appendOpenAIResponseItems(
  segments: ContextSegment[],
  warnings: string[],
  items: unknown,
  source: string,
  confidence: CountConfidence,
  defaultRole: string
): void {
  const normalizedItems = asArray(items);

  normalizedItems.forEach((item, index) => {
    const baseId = `${source}-${index + 1}`;

    if (typeof item === "string") {
      appendContentSegments(segments, {
        baseId,
        labelPrefix: `${defaultRole} item ${index + 1}`,
        source,
        role: defaultRole,
        content: item,
        confidence,
        defaultVisibility: "explicit",
        defaultMetadata: { index, itemType: "string" }
      });
      return;
    }

    if (!isObject(item)) {
      warnings.push(`Ignored unsupported OpenAI response item at index ${index}.`);
      return;
    }

    const itemType = typeof item.type === "string" ? item.type : "message";

    if (itemType === "message" || typeof item.role === "string") {
      const role = typeof item.role === "string" ? item.role : defaultRole;
      appendContentSegments(segments, {
        baseId,
        labelPrefix: `${role} item ${index + 1}`,
        source,
        role,
        content: item.content ?? item.output ?? item.text,
        confidence,
        defaultVisibility: "explicit",
        defaultMetadata: { index, itemType }
      });
      return;
    }

    if (itemType === "reasoning") {
      segments.push(
        createSegment(
          baseId,
          "assistant_history",
          `reasoning item ${index + 1}`,
          source,
          extractPartText(item),
          "heuristic",
          "hidden/estimated",
          "summarize",
          "assistant",
          { index, itemType }
        )
      );
      return;
    }

    if (itemType === "item_reference") {
      segments.push(
        createSegment(
          baseId,
          "assistant_history",
          `item reference ${index + 1}`,
          source,
          extractPartText(item),
          "heuristic",
          "hidden/estimated",
          "summarize",
          "assistant",
          { index, itemType }
        )
      );
      warnings.push(`Item reference at index ${index} does not include underlying content; counts are approximate.`);
      return;
    }

    if (itemType.endsWith("_call") || itemType === "function_call" || itemType === "tool_use") {
      segments.push(
        createSegment(
          baseId,
          "tool_schema",
          `${itemType} ${index + 1}`,
          source,
          extractPartText(item),
          confidence,
          "derived",
          "cache",
          "tool",
          {
            index,
            itemType,
            ...(typeof item.call_id === "string" ? { callId: item.call_id } : {}),
            ...(typeof item.name === "string" ? { name: item.name } : {})
          }
        )
      );

      if (Array.isArray(item.results) && item.results.length > 0) {
        segments.push(
          createSegment(
            `${baseId}-results`,
            "retrieval_context",
            `${itemType} results ${index + 1}`,
            source,
            JSON.stringify(item.results),
            "heuristic",
            "derived",
            "cache",
            "tool",
            { index, itemType, resultCount: item.results.length }
          )
        );
      }
      return;
    }

    if (
      itemType === "function_call_output" ||
      itemType === "custom_tool_call_output" ||
      itemType === "tool_result"
    ) {
      segments.push(
        createSegment(
          baseId,
          "tool_result",
          `tool result ${index + 1}`,
          source,
          extractPartText(item),
          confidence,
          "derived",
          "cache",
          "tool",
          {
            index,
            itemType,
            ...(typeof item.call_id === "string" ? { callId: item.call_id } : {})
          }
        )
      );
      return;
    }

    appendContentSegments(segments, {
      baseId,
      labelPrefix: `${defaultRole} item ${index + 1}`,
      source,
      role: defaultRole,
      content: [item],
      confidence,
      defaultVisibility: "explicit",
      defaultMetadata: { index, itemType }
    });
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

function getTraceString(attributes: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = attributes[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function getTraceNumber(attributes: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = attributes[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.length > 0) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
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
    case "tool_schema":
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

  if (provider === "anthropic" && payload.system !== undefined) {
    appendContentSegments(segments, {
      baseId: "anthropic-system",
      labelPrefix: "system prompt",
      source: sourceType,
      role: "system",
      content: payload.system,
      confidence: exactTotal !== undefined ? "provider-reported" : "tokenizer-based",
      defaultVisibility: "explicit"
    });
  }

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

function analyzeOpenAIResponsesPayload(payload: AnyObject): ContextReport {
  const inputs = asArray(payload.input);
  const model = detectModel(payload);
  const provider = "openai";
  const hasInput = "input" in payload;
  const exactTotal = hasInput ? usageInputTokens(payload) : undefined;
  const warnings: string[] = [];
  const segments: ContextSegment[] = [];

  if (payload.instructions !== undefined) {
    appendContentSegments(segments, {
      baseId: "openai-instructions",
      labelPrefix: "instructions",
      source: "openai-responses",
      role: "developer",
      content: payload.instructions,
      confidence: exactTotal !== undefined ? "provider-reported" : "tokenizer-based",
      defaultVisibility: "explicit"
    });
  }

  if (hasInput) {
    appendOpenAIResponseItems(
      segments,
      warnings,
      inputs,
      "openai-responses-input",
      exactTotal !== undefined ? "provider-reported" : "tokenizer-based",
      "user"
    );
  }

  const hasOutput = Array.isArray(payload.output) && payload.output.length > 0;
  if (!hasInput && hasOutput) {
    appendOpenAIResponseItems(
      segments,
      warnings,
      payload.output,
      "openai-responses-output",
      "tokenizer-based",
      "assistant"
    );
  } else if (hasInput && hasOutput) {
    warnings.push("Response output items were excluded from current input occupancy analysis.");
  }

  if (Array.isArray(payload.tools)) {
    segments.push(
      createSegment(
        "request-tools",
        "tool_schema",
        "Declared tools",
        "openai-responses",
        JSON.stringify(payload.tools),
        exactTotal !== undefined ? "provider-reported" : "heuristic",
        "derived",
        "cache"
      )
    );
  }

  return finalizeReport(
    hasInput ? "openai-responses" : "openai-responses-output",
    model,
    provider,
    segments,
    warnings,
    undefined,
    exactTotal
  );
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

function collectTraceSpans(container: AnyObject, spans: NormalizedTraceSpan[]): void {
  if (Array.isArray(container.spans)) {
    for (const span of container.spans) {
      if (!isObject(span)) {
        continue;
      }

      spans.push({
        spanId:
          typeof span.spanId === "string" && span.spanId.length > 0
            ? span.spanId
            : stableHash([span.name as string | undefined, spans.length + 1]),
        ...(typeof span.parentSpanId === "string" && span.parentSpanId.length > 0
          ? { parentSpanId: span.parentSpanId }
          : {}),
        name: typeof span.name === "string" ? span.name : `span-${spans.length + 1}`,
        attributes: normalizeTraceAttributes(span.attributes)
      });
    }
  }

  if (Array.isArray(container.scopeSpans)) {
    for (const scopeSpan of container.scopeSpans) {
      if (isObject(scopeSpan)) {
        collectTraceSpans(scopeSpan, spans);
      }
    }
  }

  if (Array.isArray(container.resourceSpans)) {
    for (const resourceSpan of container.resourceSpans) {
      if (isObject(resourceSpan)) {
        collectTraceSpans(resourceSpan, spans);
      }
    }
  }
}

function flattenTraceSpans(payload: AnyObject): NormalizedTraceSpan[] {
  const spans: NormalizedTraceSpan[] = [];
  collectTraceSpans(payload, spans);
  return spans;
}

function parseTraceMessages(
  attributes: Record<string, unknown>,
  prefix: string
): Array<{ role: string; content: unknown }> {
  const messages = new Map<number, { role?: string; content?: string; contents: Map<number, Record<string, unknown>> }>();

  for (const [key, rawValue] of Object.entries(attributes)) {
    if (!key.startsWith(`${prefix}.`)) {
      continue;
    }

    const remainder = key.slice(prefix.length + 1);
    const [messageIndexRaw, ...tailParts] = remainder.split(".");
    const messageIndex = Number(messageIndexRaw);
    if (Number.isNaN(messageIndex)) {
      continue;
    }

    const message = messages.get(messageIndex) ?? { contents: new Map<number, Record<string, unknown>>() };
    const tail = tailParts.join(".");

    if (tail === "message.role" && typeof rawValue === "string") {
      message.role = rawValue;
    } else if (tail === "message.content" && typeof rawValue === "string") {
      message.content = rawValue;
    } else if (tail.startsWith("message.contents.")) {
      const contentRemainder = tail.slice("message.contents.".length);
      const [contentIndexRaw, ...contentTailParts] = contentRemainder.split(".");
      const contentIndex = Number(contentIndexRaw);
      if (!Number.isNaN(contentIndex)) {
        const contentTail = contentTailParts.join(".");
        const contentPart = message.contents.get(contentIndex) ?? {};
        if (contentTail === "message_content.type" && typeof rawValue === "string") {
          contentPart.type = rawValue;
        } else if (contentTail === "message_content.text" && typeof rawValue === "string") {
          contentPart.text = rawValue;
        } else if (contentTail === "message_content.image.image.url" && typeof rawValue === "string") {
          contentPart.image = { url: rawValue };
          if (contentPart.type === undefined) {
            contentPart.type = "image";
          }
        } else if (contentTail === "message_content.audio.audio.url" && typeof rawValue === "string") {
          contentPart.audio = { url: rawValue };
          if (contentPart.type === undefined) {
            contentPart.type = "audio";
          }
        }
        message.contents.set(contentIndex, contentPart);
      }
    }

    messages.set(messageIndex, message);
  }

  return [...messages.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, message]) => {
      const content =
        message.content !== undefined
          ? message.content
          : [...message.contents.entries()]
              .sort((left, right) => left[0] - right[0])
              .map(([, item]) => item);

      return {
        role: message.role ?? "user",
        content
      };
    });
}

function parseTraceTools(attributes: Record<string, unknown>): string[] {
  const tools = new Map<number, string>();

  for (const [key, value] of Object.entries(attributes)) {
    const match = /^llm\.tools\.(\d+)\.tool\.json_schema$/.exec(key);
    if (!match || typeof value !== "string") {
      continue;
    }
    tools.set(Number(match[1]), value);
  }

  return [...tools.entries()].sort((left, right) => left[0] - right[0]).map(([, value]) => value);
}

function parseTraceRetrievalDocuments(attributes: Record<string, unknown>): string[] {
  const documents = new Map<number, string>();

  for (const [key, value] of Object.entries(attributes)) {
    const match = /^retrieval\.documents\.(\d+)\.document\.content$/.exec(key);
    if (!match || typeof value !== "string") {
      continue;
    }
    documents.set(Number(match[1]), value);
  }

  return [...documents.entries()].sort((left, right) => left[0] - right[0]).map(([, value]) => value);
}

function collectAgentSubtreeSpans(
  rootSpanId: string,
  spanById: Map<string, NormalizedTraceSpan>,
  childrenByParentId: Map<string, NormalizedTraceSpan[]>,
  stopAtAgentSpanIds: Set<string>
): NormalizedTraceSpan[] {
  const collected: NormalizedTraceSpan[] = [];
  const stack = [...(childrenByParentId.get(rootSpanId) ?? [])];

  while (stack.length > 0) {
    const span = stack.pop();
    if (!span) {
      continue;
    }

    collected.push(span);

    if (stopAtAgentSpanIds.has(span.spanId)) {
      continue;
    }

    const children = childrenByParentId.get(span.spanId) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child) {
        stack.push(child);
      }
    }
  }

  return collected;
}

function appendTraceSpanSegments(
  segments: ContextSegment[],
  span: NormalizedTraceSpan,
  warnings: string[],
  exactPromptTokens: { value: number; exact: boolean },
  modelInfo: { models: Set<string>; providers: Set<string> },
  externalContext: { value: boolean }
): void {
  const source = "openinference-trace";
  const attributes = span.attributes;
  const spanKind = getTraceString(attributes, "openinference.span.kind");

  if (spanKind === "LLM") {
    const messages = parseTraceMessages(attributes, "llm.input_messages");
    messages.forEach((message, index) => {
      appendContentSegments(segments, {
        baseId: `${span.spanId}-message-${index + 1}`,
        labelPrefix: `${message.role} message ${index + 1}`,
        source,
        role: message.role,
        content: message.content,
        confidence: "tokenizer-based",
        defaultVisibility: "explicit",
        defaultMetadata: { spanId: span.spanId, spanName: span.name, spanKind, index }
      });
    });

    const tools = parseTraceTools(attributes);
    tools.forEach((toolSchema, index) => {
      segments.push(
        createSegment(
          `${span.spanId}-tool-${index + 1}`,
          "tool_schema",
          `Declared tools ${index + 1}`,
          source,
          toolSchema,
          "heuristic",
          "derived",
          "cache",
          "tool",
          { spanId: span.spanId, spanName: span.name, spanKind, index }
        )
      );
    });

    const promptTokens = getTraceNumber(
      attributes,
      "llm.token_count.prompt",
      "gen_ai.usage.input_tokens"
    );
    if (promptTokens !== undefined) {
      exactPromptTokens.value += promptTokens;
      exactPromptTokens.exact = true;
    }

    const model = getTraceString(attributes, "llm.model_name", "gen_ai.request.model");
    if (model) {
      modelInfo.models.add(model);
    }

    const provider = getTraceString(attributes, "llm.system", "llm.provider", "gen_ai.system");
    if (provider) {
      modelInfo.providers.add(provider);
    }

    if (messages.length === 0 && tools.length === 0) {
      const inputValue = getTraceString(attributes, "input.value");
      if (inputValue) {
        appendContentSegments(segments, {
          baseId: `${span.spanId}-input`,
          labelPrefix: `llm input ${span.name}`,
          source,
          role: "user",
          content: inputValue,
          confidence: "tokenizer-based",
          defaultVisibility: "explicit",
          defaultMetadata: { spanId: span.spanId, spanName: span.name, spanKind }
        });
      } else {
        warnings.push(`LLM span ${span.name} did not include input messages or input.value.`);
      }
    }

    return;
  }

  if (spanKind === "RETRIEVER") {
    const documents = parseTraceRetrievalDocuments(attributes);
    documents.forEach((document, index) => {
      segments.push(
        createSegment(
          `${span.spanId}-retrieval-${index + 1}`,
          "retrieval_context",
          `retrieval document ${index + 1}`,
          source,
          document,
          "tokenizer-based",
          "derived",
          "cache",
          undefined,
          { spanId: span.spanId, spanName: span.name, spanKind, index }
        )
      );
    });
    if (documents.length > 0) {
      externalContext.value = true;
    }
    return;
  }

  if (spanKind === "TOOL") {
    const toolSchema =
      getTraceString(attributes, "tool.json_schema") ??
      getTraceString(attributes, "tool.parameters") ??
      getTraceString(attributes, "input.value");
    if (toolSchema) {
      segments.push(
        createSegment(
          `${span.spanId}-tool-schema`,
          "tool_schema",
          getTraceString(attributes, "tool.name") ?? `tool ${span.name}`,
          source,
          toolSchema,
          "heuristic",
          "derived",
          "cache",
          "tool",
          { spanId: span.spanId, spanName: span.name, spanKind }
        )
      );
    }

    const toolOutput = getTraceString(attributes, "output.value");
    if (toolOutput) {
      segments.push(
        createSegment(
          `${span.spanId}-tool-result`,
          "tool_result",
          `tool result ${span.name}`,
          source,
          toolOutput,
          "tokenizer-based",
          "derived",
          "cache",
          "tool",
          { spanId: span.spanId, spanName: span.name, spanKind }
        )
      );
    }

    if (toolSchema || toolOutput) {
      externalContext.value = true;
    }
  }
}

function analyzeTraceSummary(payload: AnyObject): AgentSummary {
  const spans = flattenTraceSpans(payload);
  if (spans.length === 0) {
    throw new Error("Trace export did not contain any spans.");
  }

  const spanById = new Map(spans.map((span) => [span.spanId, span]));
  const childrenByParentId = new Map<string, NormalizedTraceSpan[]>();
  for (const span of spans) {
    if (!span.parentSpanId) {
      continue;
    }
    const siblings = childrenByParentId.get(span.parentSpanId) ?? [];
    siblings.push(span);
    childrenByParentId.set(span.parentSpanId, siblings);
  }

  const agentSpans = spans.filter(
    (span) => getTraceString(span.attributes, "openinference.span.kind") === "AGENT"
  );
  const warnings: string[] = [];

  const rootAgentSpans =
    agentSpans.length > 0
      ? agentSpans
      : spans.filter((span) => !span.parentSpanId);

  if (agentSpans.length === 0) {
    warnings.push("Trace did not contain AGENT spans; root spans were treated as agents.");
  }

  const agentGraphIdToId = new Map<string, string>();
  for (const span of rootAgentSpans) {
    const graphNodeId = getTraceString(span.attributes, "graph.node.id");
    const agentId = getTraceString(span.attributes, "agent.name", "graph.node.name") ?? span.name;
    if (graphNodeId) {
      agentGraphIdToId.set(graphNodeId, agentId);
    }
  }

  const stopAtAgentSpanIds = new Set(agentSpans.map((span) => span.spanId));

  const agents = rootAgentSpans.map((agentSpan, index) => {
    const agentId = getTraceString(agentSpan.attributes, "agent.name", "graph.node.name") ?? agentSpan.name;
    const graphNodeParentId = getTraceString(agentSpan.attributes, "graph.node.parent_id");

    let parentAgentId: string | undefined =
      graphNodeParentId !== undefined ? agentGraphIdToId.get(graphNodeParentId) : undefined;

    if (!parentAgentId && agentSpan.parentSpanId) {
      let currentParentId = agentSpan.parentSpanId;
      while (currentParentId) {
        const parentSpan = spanById.get(currentParentId);
        if (!parentSpan) {
          break;
        }
        if (getTraceString(parentSpan.attributes, "openinference.span.kind") === "AGENT") {
          parentAgentId =
            getTraceString(parentSpan.attributes, "agent.name", "graph.node.name") ?? parentSpan.name;
          break;
        }
        currentParentId = parentSpan.parentSpanId ?? "";
      }
    }

    const spansForAgent = collectAgentSubtreeSpans(
      agentSpan.spanId,
      spanById,
      childrenByParentId,
      stopAtAgentSpanIds
    );

    const reportWarnings: string[] = [];
    const segments: ContextSegment[] = [];
    const exactPromptTokens = { value: 0, exact: false };
    const modelInfo = { models: new Set<string>(), providers: new Set<string>() };
    const externalContext = { value: false };

    for (const span of spansForAgent) {
      appendTraceSpanSegments(segments, span, reportWarnings, exactPromptTokens, modelInfo, externalContext);
    }

    if (segments.length === 0) {
      reportWarnings.push(`No prompt-bearing spans were found under trace agent ${agentId}.`);
    }

    const model = modelInfo.models.size === 1 ? [...modelInfo.models][0] : undefined;
    const provider = modelInfo.providers.size === 1 ? [...modelInfo.providers][0] : undefined;
    const exactTotal =
      exactPromptTokens.exact && !externalContext.value ? exactPromptTokens.value : undefined;

    if (exactPromptTokens.exact && externalContext.value) {
      reportWarnings.push(
        "Prompt token totals were present, but external retriever/tool spans were also included; total input tokens are estimated conservatively."
      );
    }

    const report = finalizeReport(
      "openinference-trace",
      model,
      provider,
      segments,
      reportWarnings,
      { spanId: agentSpan.spanId, spanName: agentSpan.name },
      exactTotal
    );

    return {
      id: agentId,
      ...(parentAgentId ? { parentAgentId } : {}),
      ...(model ? { model } : {}),
      ...(provider ? { provider } : {}),
      report,
      metadata: {
        traceSpanId: agentSpan.spanId,
        traceSpanName: agentSpan.name,
        traceAgentIndex: index
      }
    };
  });

  return { agents, warnings };
}

function analyzeAgentPayload(payload: AnyObject): ContextReport {
  const summary = analyzeAgentSnapshot(payload);
  const sourceType = isTracePayload(payload) ? "openinference-trace" : "agent-snapshot";
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
    `${sourceType === "openinference-trace" ? "Trace export" : "Agent snapshot"} aggregated into a single context report. Use agent-report for per-agent detail.`
  ];

  return finalizeReport(
    sourceType,
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
  if (!isObject(payload)) {
    throw new Error("Agent input must be a JSON object.");
  }

  if (isTracePayload(payload)) {
    return analyzeTraceSummary(payload);
  }

  if (!Array.isArray(payload.agents)) {
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

  if (isTracePayload(payload)) {
    return analyzeAgentPayload(payload);
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

  if ("input" in payload || Array.isArray(payload.output) || ("instructions" in payload && !Array.isArray(payload.messages))) {
    return analyzeOpenAIResponsesPayload(payload);
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
