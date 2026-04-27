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

export type CheckRiskThreshold = "low" | "medium" | "high";
export type InstructionLintProfile = "lite" | "standard" | "strict";
export type InstructionLintSeverity = "warning" | "error";
export type InstructionLintFailOnSeverity = "off" | InstructionLintSeverity;
export type InstructionLintSurface = "code-review" | "chat" | "coding-agent";
export type InstructionLintPreset = "copilot" | "agents-md";
export type InstructionLintPresetSelector = "auto" | InstructionLintPreset;
export type InstructionLintRolloutStage = "advisory" | "baseline" | "enforced";
export type InstructionExcludeAgent = "code-review" | "coding-agent";
export type InstructionRuleId =
  | "invalid-file-path"
  | "malformed-frontmatter"
  | "missing-frontmatter"
  | "missing-applyto"
  | "invalid-exclude-agent"
  | "global-applyto-overlap"
  | "stale-applyto"
  | "file-char-limit"
  | "repository-char-budget"
  | "repository-token-budget"
  | "path-specific-char-budget"
  | "path-specific-token-budget"
  | "statement-count-budget"
  | "order-dependent-wording"
  | "statement-too-long"
  | "weak-modal-phrasing"
  | "vague-instruction"
  | "paragraph-narrative"
  | "oversized-code-example"
  | "repo-wide-scoped-topics"
  | "exact-duplicate-statement"
  | "possible-conflict"
  | "high-similarity-statement"
  | "applicable-token-budget";
export type InstructionRuleSelector = InstructionRuleId | "*";
export type InstructionFileKind =
  | "repository"
  | "path-specific"
  | "unsupported";

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

export interface CheckThresholds {
  maxUsagePercent?: number;
  maxTotalTokens?: number;
  maxSegmentTokens?: Partial<Record<SegmentType, number>>;
  failOnRisk?: CheckRiskThreshold;
}

export interface CheckViolation {
  code: string;
  message: string;
  actual: number | string;
  expected: number | string;
  segmentType?: SegmentType;
}

export interface CheckResult {
  passed: boolean;
  exitCode: 0 | 2;
  thresholds: CheckThresholds;
  violations: CheckViolation[];
  warnings: string[];
  report: ContextReport;
  baseline?: {
    report: ContextReport;
    diff: DiffReport;
  };
}

export interface InstructionLintOptions {
  profile?: InstructionLintProfile;
  failOnSeverity?: InstructionLintFailOnSeverity;
  surface?: InstructionLintSurface;
  model?: string;
  preset?: InstructionLintPresetSelector;
  configPath?: string;
  baseline?: string;
  ignore?: string[];
  ruleOverrides?: Partial<Record<InstructionRuleId, InstructionRuleOverride>>;
  suppressions?: InstructionSuppression[];
}

export interface InstructionRuleOverride {
  enabled?: boolean;
  severity?: InstructionLintSeverity;
}

export interface InstructionSuppression {
  path: string | string[];
  rules?: InstructionRuleSelector[];
  reason?: string;
}

export interface InstructionLintRollout {
  stage?: InstructionLintRolloutStage;
  owner?: string;
  policyVersion?: string;
  ticket?: string;
  expiresOn?: string;
}

export interface InstructionLintConfigSection {
  profile?: InstructionLintProfile;
  failOnSeverity?: InstructionLintFailOnSeverity;
  surface?: InstructionLintSurface;
  model?: string;
  preset?: InstructionLintPresetSelector;
  baseline?: string;
  ignore?: string[];
  rules?: Partial<Record<InstructionRuleId, InstructionRuleOverride>>;
  suppressions?: InstructionSuppression[];
  rollout?: InstructionLintRollout;
}

export interface InstructionLintConfigFile {
  $schema?: string;
  instructionsLint?: InstructionLintConfigSection;
}

export interface InstructionLintAppliedConfig {
  source?: string;
  baselinePath?: string;
  ignore: string[];
  suppressionCount: number;
  overriddenRules: InstructionRuleId[];
  rollout?: InstructionLintRollout;
}

export interface InstructionFindingLocation {
  file: string;
  line: number;
}

export interface InstructionFindingEvidence {
  actual?: number | string;
  expected?: number | string;
  surface?: InstructionLintSurface;
  relatedLocation?: InstructionFindingLocation;
  overlapFileCount?: number;
  overlapFilesSample?: string[];
  matchedFileCount?: number;
  matchedFilesSample?: string[];
  similarityScore?: number;
  patterns?: string[];
  targetFile?: string;
  contributorFiles?: string[];
}

export interface InstructionFinding {
  ruleId: InstructionRuleId;
  severity: InstructionLintSeverity;
  message: string;
  file: string;
  line: number;
  suggestion?: string;
  evidence?: InstructionFindingEvidence;
}

export interface InstructionFileReport {
  file: string;
  kind: InstructionFileKind;
  preset?: InstructionLintPreset;
  applyTo?: string[];
  scopePath?: string;
  excludeAgents?: InstructionExcludeAgent[];
  appliesToSurface: boolean;
  chars: number;
  words: number;
  estimatedTokens: number;
  statementCount: number;
  matchedFileCount?: number;
  findings: InstructionFinding[];
}

export interface InstructionLintStats {
  totalFiles: number;
  repositoryFiles: number;
  pathSpecificFiles: number;
  unsupportedFiles: number;
  totalStatements: number;
  applicableStatements: number;
  totalChars: number;
  totalEstimatedTokens: number;
  applicableFiles: number;
  applicableEstimatedTokens: number;
  totalMatchedFiles: number;
  maxApplicableTokens: number;
  maxApplicableTargetFile?: string;
  ignoredInstructionFileCount: number;
  ignoredTargetFileCount: number;
  suppressedFindingCount: number;
  baselineMatchedFindingCount: number;
  warningCount: number;
  errorCount: number;
}

export interface InstructionLintReport {
  kind: "instructions-lint-report";
  schemaVersion: "instructions-lint-report/v1";
  schemaPath: string;
  preset: InstructionLintPresetSelector;
  detectedPresets: InstructionLintPreset[];
  profile: InstructionLintProfile;
  surface: InstructionLintSurface;
  model?: string;
  contextWindow?: number;
  maxApplicableContextPercent?: number;
  passed: boolean;
  exitCode: 0 | 2;
  failOnSeverity: InstructionLintFailOnSeverity;
  config?: InstructionLintAppliedConfig;
  stats: InstructionLintStats;
  files: InstructionFileReport[];
  findings: InstructionFinding[];
  warnings: string[];
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
