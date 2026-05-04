import type {
  InstructionLintPreset,
  InstructionLintSeverity,
  InstructionLintSurface,
  InstructionRuleId
} from "../types.js";

export type InstructionRuleCategory = "compatibility" | "clarity" | "economy";

export interface InstructionRuleDefinition {
  id: InstructionRuleId;
  category: InstructionRuleCategory;
  defaultSeverity: InstructionLintSeverity;
  summary: string;
  presets: "all" | InstructionLintPreset[];
  surfaces: "all" | InstructionLintSurface[];
}

export const INSTRUCTION_LINT_REPORT_SCHEMA_VERSION = "instructions-lint-report/v1";
export const INSTRUCTION_LINT_REPORT_SCHEMA_PATH = "schemas/instructions-lint-report.schema.json";

export const INSTRUCTION_RULES: Record<InstructionRuleId, InstructionRuleDefinition> = {
  "invalid-file-path": {
    id: "invalid-file-path",
    category: "compatibility",
    defaultSeverity: "error",
    summary: "Instruction file path does not match a supported preset location.",
    presets: "all",
    surfaces: "all"
  },
  "unsupported-agent-surface": {
    id: "unsupported-agent-surface",
    category: "compatibility",
    defaultSeverity: "warning",
    summary: "A known agent instruction file is present but is not linted by a supported Tokn preset.",
    presets: "all",
    surfaces: "all"
  },
  "malformed-frontmatter": {
    id: "malformed-frontmatter",
    category: "compatibility",
    defaultSeverity: "error",
    summary: "Path-specific Copilot instructions use malformed or unsupported frontmatter.",
    presets: ["copilot"],
    surfaces: "all"
  },
  "missing-frontmatter": {
    id: "missing-frontmatter",
    category: "compatibility",
    defaultSeverity: "error",
    summary: "Path-specific Copilot instructions are missing required frontmatter.",
    presets: ["copilot"],
    surfaces: "all"
  },
  "missing-applyto": {
    id: "missing-applyto",
    category: "compatibility",
    defaultSeverity: "error",
    summary: "Path-specific Copilot instructions are missing a usable applyTo or description value.",
    presets: ["copilot"],
    surfaces: "all"
  },
  "invalid-exclude-agent": {
    id: "invalid-exclude-agent",
    category: "compatibility",
    defaultSeverity: "error",
    summary: "excludeAgent contains unsupported values.",
    presets: ["copilot"],
    surfaces: "all"
  },
  "global-applyto-overlap": {
    id: "global-applyto-overlap",
    category: "compatibility",
    defaultSeverity: "error",
    summary: "A path-specific Copilot file uses applyTo: \"**\" alongside repository-wide instructions.",
    presets: ["copilot"],
    surfaces: "all"
  },
  "stale-applyto": {
    id: "stale-applyto",
    category: "compatibility",
    defaultSeverity: "warning",
    summary: "applyTo patterns no longer match repository files.",
    presets: ["copilot"],
    surfaces: "all"
  },
  "file-char-limit": {
    id: "file-char-limit",
    category: "compatibility",
    defaultSeverity: "error",
    summary: "A Copilot instruction file exceeds the code-review 4000-character cap.",
    presets: ["copilot"],
    surfaces: ["code-review"]
  },
  "repository-char-budget": {
    id: "repository-char-budget",
    category: "economy",
    defaultSeverity: "warning",
    summary: "Repository-scoped instructions exceed the configured character budget.",
    presets: "all",
    surfaces: "all"
  },
  "repository-token-budget": {
    id: "repository-token-budget",
    category: "economy",
    defaultSeverity: "warning",
    summary: "Repository-scoped instructions exceed the configured token budget.",
    presets: "all",
    surfaces: "all"
  },
  "path-specific-char-budget": {
    id: "path-specific-char-budget",
    category: "economy",
    defaultSeverity: "warning",
    summary: "Path-specific instructions exceed the configured character budget.",
    presets: "all",
    surfaces: "all"
  },
  "path-specific-token-budget": {
    id: "path-specific-token-budget",
    category: "economy",
    defaultSeverity: "warning",
    summary: "Path-specific instructions exceed the configured token budget.",
    presets: "all",
    surfaces: "all"
  },
  "statement-count-budget": {
    id: "statement-count-budget",
    category: "economy",
    defaultSeverity: "warning",
    summary: "An instruction file contains more statements than the configured budget.",
    presets: "all",
    surfaces: "all"
  },
  "order-dependent-wording": {
    id: "order-dependent-wording",
    category: "compatibility",
    defaultSeverity: "error",
    summary: "A statement depends on file order that runtimes do not guarantee.",
    presets: "all",
    surfaces: "all"
  },
  "statement-too-long": {
    id: "statement-too-long",
    category: "clarity",
    defaultSeverity: "warning",
    summary: "A statement exceeds the configured word budget.",
    presets: "all",
    surfaces: "all"
  },
  "weak-modal-phrasing": {
    id: "weak-modal-phrasing",
    category: "clarity",
    defaultSeverity: "warning",
    summary: "A statement uses weak or optional phrasing.",
    presets: "all",
    surfaces: "all"
  },
  "vague-instruction": {
    id: "vague-instruction",
    category: "clarity",
    defaultSeverity: "warning",
    summary: "A statement is too generic to add repository-specific guidance.",
    presets: "all",
    surfaces: "all"
  },
  "paragraph-narrative": {
    id: "paragraph-narrative",
    category: "clarity",
    defaultSeverity: "warning",
    summary: "A paragraph-style statement should be split into atomic directives.",
    presets: "all",
    surfaces: "all"
  },
  "oversized-code-example": {
    id: "oversized-code-example",
    category: "economy",
    defaultSeverity: "warning",
    summary: "A code example is large enough to crowd out higher-signal instructions.",
    presets: "all",
    surfaces: "all"
  },
  "repo-wide-scoped-topics": {
    id: "repo-wide-scoped-topics",
    category: "economy",
    defaultSeverity: "warning",
    summary: "Repository-scoped instructions mix in narrower scoped topics.",
    presets: "all",
    surfaces: "all"
  },
  "exact-duplicate-statement": {
    id: "exact-duplicate-statement",
    category: "economy",
    defaultSeverity: "warning",
    summary: "Overlapping instruction files repeat the same rule verbatim.",
    presets: "all",
    surfaces: "all"
  },
  "possible-conflict": {
    id: "possible-conflict",
    category: "economy",
    defaultSeverity: "warning",
    summary: "Overlapping instruction files express opposite polarity for the same subject.",
    presets: "all",
    surfaces: "all"
  },
  "high-similarity-statement": {
    id: "high-similarity-statement",
    category: "economy",
    defaultSeverity: "warning",
    summary: "Overlapping instruction files contain highly similar rules.",
    presets: "all",
    surfaces: "all"
  },
  "applicable-token-budget": {
    id: "applicable-token-budget",
    category: "economy",
    defaultSeverity: "warning",
    summary: "The instruction bundle for one target file exceeds the configured token budget.",
    presets: "all",
    surfaces: "all"
  }
};

export const INSTRUCTION_RULE_IDS = Object.keys(INSTRUCTION_RULES) as InstructionRuleId[];

export function isInstructionRuleId(value: string): value is InstructionRuleId {
  return value in INSTRUCTION_RULES;
}

export function getInstructionRuleDefaultSeverity(ruleId: InstructionRuleId): InstructionLintSeverity {
  return INSTRUCTION_RULES[ruleId].defaultSeverity;
}

export function getInstructionRuleCategory(ruleId: InstructionRuleId): InstructionRuleCategory {
  return INSTRUCTION_RULES[ruleId].category;
}
