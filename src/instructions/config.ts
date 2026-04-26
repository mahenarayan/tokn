import fs from "node:fs";
import path from "node:path";

import { isObject, readText, safeJsonParse } from "../helpers.js";
import { isInstructionRuleId } from "./rules.js";
import type {
  InstructionLintConfigSection,
  InstructionLintPresetSelector,
  InstructionLintProfile,
  InstructionLintSeverity,
  InstructionLintSurface,
  InstructionRuleId,
  InstructionRuleOverride,
  InstructionRuleSelector
} from "../types.js";

export const INSTRUCTION_LINT_CONFIG_FILENAMES = ["tokn.config.json", ".toknrc.json"] as const;

const PROFILES = new Set<InstructionLintProfile>(["lite", "standard", "strict"]);
const SEVERITIES = new Set<InstructionLintSeverity>(["warning", "error"]);
const SURFACES = new Set<InstructionLintSurface>(["code-review", "chat", "coding-agent"]);
const PRESETS = new Set<InstructionLintPresetSelector>(["auto", "copilot", "agents-md"]);
const MAX_CONFIG_FILE_BYTES = 1024 * 1024;

export interface NormalizedInstructionSuppression {
  paths: string[];
  rules: InstructionRuleSelector[];
  reason?: string;
}

export interface ResolvedInstructionLintConfig {
  sourcePath: string;
  profile?: InstructionLintProfile;
  failOnSeverity?: InstructionLintSeverity;
  surface?: InstructionLintSurface;
  model?: string;
  preset?: InstructionLintPresetSelector;
  baselinePath?: string;
  ignore: string[];
  ruleOverrides: Partial<Record<InstructionRuleId, InstructionRuleOverride>>;
  suppressions: NormalizedInstructionSuppression[];
}

function asStringArray(value: unknown, fieldName: string): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return value;
  }
  throw new Error(`${fieldName} must be a string or an array of strings.`);
}

function resolveSection(raw: unknown): InstructionLintConfigSection {
  if (!isObject(raw)) {
    throw new Error("Tokn config must be a JSON object.");
  }

  if ("instructionsLint" in raw) {
    const scoped = raw.instructionsLint;
    if (scoped === undefined) {
      return {};
    }
    if (!isObject(scoped)) {
      throw new Error("instructionsLint must be a JSON object.");
    }
    return scoped as InstructionLintConfigSection;
  }

  return raw as InstructionLintConfigSection;
}

export function discoverInstructionLintConfigPath(baseDirectory: string): string | undefined {
  for (const fileName of INSTRUCTION_LINT_CONFIG_FILENAMES) {
    const candidate = path.join(baseDirectory, fileName);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return undefined;
}

export function loadInstructionLintConfig(configPath: string): ResolvedInstructionLintConfig {
  const absolutePath = path.resolve(configPath);
  const rawText = readText(absolutePath, { maxBytes: MAX_CONFIG_FILE_BYTES });
  const raw = safeJsonParse(rawText);
  const section = resolveSection(raw);
  const configDirectory = path.dirname(absolutePath);

  const result: ResolvedInstructionLintConfig = {
    sourcePath: absolutePath,
    ignore: [],
    ruleOverrides: {},
    suppressions: []
  };

  if (section.profile !== undefined) {
    if (!PROFILES.has(section.profile)) {
      throw new Error(`instructionsLint.profile must be one of: lite, standard, strict.`);
    }
    result.profile = section.profile;
  }

  if (section.failOnSeverity !== undefined) {
    if (!SEVERITIES.has(section.failOnSeverity)) {
      throw new Error(`instructionsLint.failOnSeverity must be one of: warning, error.`);
    }
    result.failOnSeverity = section.failOnSeverity;
  }

  if (section.surface !== undefined) {
    if (!SURFACES.has(section.surface)) {
      throw new Error(`instructionsLint.surface must be one of: code-review, chat, coding-agent.`);
    }
    result.surface = section.surface;
  }

  if (section.preset !== undefined) {
    if (!PRESETS.has(section.preset)) {
      throw new Error(`instructionsLint.preset must be one of: auto, copilot, agents-md.`);
    }
    result.preset = section.preset;
  }

  if (section.model !== undefined) {
    if (typeof section.model !== "string" || !section.model.trim()) {
      throw new Error("instructionsLint.model must be a non-empty string.");
    }
    result.model = section.model.trim();
  }

  if (section.baseline !== undefined) {
    if (typeof section.baseline !== "string" || !section.baseline.trim()) {
      throw new Error("instructionsLint.baseline must be a non-empty string.");
    }
    result.baselinePath = path.resolve(configDirectory, section.baseline);
  }

  if (section.ignore !== undefined) {
    result.ignore = asStringArray(section.ignore, "instructionsLint.ignore").map((entry) => entry.trim()).filter(Boolean);
  }

  if (section.rules !== undefined) {
    if (!isObject(section.rules)) {
      throw new Error("instructionsLint.rules must be a JSON object.");
    }

    for (const [ruleId, override] of Object.entries(section.rules)) {
      if (!isInstructionRuleId(ruleId)) {
        throw new Error(`instructionsLint.rules contains unknown rule id: ${ruleId}.`);
      }
      if (!isObject(override)) {
        throw new Error(`instructionsLint.rules.${ruleId} must be a JSON object.`);
      }

      const normalizedOverride: InstructionRuleOverride = {};
      if ("enabled" in override) {
        if (typeof override.enabled !== "boolean") {
          throw new Error(`instructionsLint.rules.${ruleId}.enabled must be a boolean.`);
        }
        normalizedOverride.enabled = override.enabled;
      }
      if ("severity" in override) {
        if (typeof override.severity !== "string" || !SEVERITIES.has(override.severity as InstructionLintSeverity)) {
          throw new Error(`instructionsLint.rules.${ruleId}.severity must be warning or error.`);
        }
        normalizedOverride.severity = override.severity as InstructionLintSeverity;
      }

      result.ruleOverrides[ruleId] = normalizedOverride;
    }
  }

  if (section.suppressions !== undefined) {
    if (!Array.isArray(section.suppressions)) {
      throw new Error("instructionsLint.suppressions must be an array.");
    }

    result.suppressions = section.suppressions.map((suppression, index) => {
      if (!isObject(suppression)) {
        throw new Error(`instructionsLint.suppressions[${index}] must be a JSON object.`);
      }

      const paths = asStringArray(suppression.path, `instructionsLint.suppressions[${index}].path`)
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (paths.length === 0) {
        throw new Error(`instructionsLint.suppressions[${index}].path must contain at least one glob.`);
      }

      let rules: InstructionRuleSelector[] = ["*"];
      if ("rules" in suppression && suppression.rules !== undefined) {
        rules = asStringArray(
          suppression.rules,
          `instructionsLint.suppressions[${index}].rules`
        ).map((entry) => entry.trim()) as InstructionRuleSelector[];
        if (rules.length === 0) {
          throw new Error(`instructionsLint.suppressions[${index}].rules must contain at least one rule id or "*".`);
        }
        for (const rule of rules) {
          if (rule !== "*" && !isInstructionRuleId(rule)) {
            throw new Error(`instructionsLint.suppressions[${index}] contains unknown rule id: ${rule}.`);
          }
        }
      }

      if ("reason" in suppression && suppression.reason !== undefined && typeof suppression.reason !== "string") {
        throw new Error(`instructionsLint.suppressions[${index}].reason must be a string.`);
      }

      return {
        paths,
        rules,
        ...(typeof suppression.reason === "string" && suppression.reason.trim()
          ? { reason: suppression.reason.trim() }
          : {})
      };
    });
  }

  return result;
}
