export type SegmentType =
  | "system"
  | "developer"
  | "user"
  | "assistant_history"
  | "tool_schema"
  | "tool_result"
  | "retrieval_context"
  | "attachment"
  | "provider_overhead"
  | "agent_metadata";

export type CountConfidence =
  | "exact"
  | "provider-reported"
  | "tokenizer-based"
  | "heuristic";

export type SegmentVisibility = "explicit" | "derived" | "hidden/estimated";

export type Reclaimability = "keep" | "drop" | "summarize" | "cache";

export interface ContextSegment {
  id: string;
  type: SegmentType;
  label: string;
  source: string;
  role?: string;
  text?: string;
  tokenCount: number;
  confidence: CountConfidence;
  visibility: SegmentVisibility;
  reclaimability: Reclaimability;
  metadata?: Record<string, unknown>;
}

export interface ModelLimit {
  id: string;
  contextWindow: number;
  defaultReservedOutput: number;
  provider: string;
  aliases?: string[];
}

export interface BudgetSummary {
  model?: string;
  contextWindow?: number;
  reservedOutput: number;
  usedInputTokens: number;
  remainingInputHeadroom?: number;
  usagePercent?: number;
  risk: "unknown" | "low" | "medium" | "high";
}

export interface Suggestion {
  code: string;
  severity: "info" | "warning";
  message: string;
  segmentType?: SegmentType;
  tokenCount?: number;
  sharePercent?: number;
  metadata?: Record<string, unknown>;
}

export interface ContextReport {
  sourceType: string;
  model?: string;
  provider?: string;
  segments: ContextSegment[];
  suggestions: Suggestion[];
  totalInputTokens: number;
  totalConfidence: CountConfidence;
  budget: BudgetSummary;
  warnings: string[];
  metadata?: Record<string, unknown>;
}

export interface DiffEntry {
  key: string;
  label: string;
  before: number;
  after: number;
  delta: number;
}

export interface DiffReport {
  beforeSource: string;
  afterSource: string;
  totalBefore: number;
  totalAfter: number;
  totalDelta: number;
  entries: DiffEntry[];
}

export interface AgentSnapshot {
  id: string;
  parentAgentId?: string;
  model?: string;
  provider?: string;
  turnNumber?: number;
  timestamp?: string;
  payload?: unknown;
  report?: ContextReport;
  metadata?: Record<string, unknown>;
}

export interface AgentSummary {
  agents: AgentSnapshot[];
  warnings: string[];
}
