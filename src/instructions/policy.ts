import fs from "node:fs";
import path from "node:path";

import { readText } from "../helpers.js";
import {
  discoverInstructionLintConfigPath,
  loadInstructionLintConfig,
  type NormalizedInstructionSuppression,
  type ResolvedInstructionLintConfig
} from "./config.js";
import {
  displayPath,
  inferRepoRootFromDirectory,
  inferRepoRootFromFile
} from "./discovery.js";
import {
  type InstructionBudgets,
  resolveInstructionBudgets
} from "./limits.js";
import {
  getInstructionRuleDefaultSeverity,
  isInstructionRuleId
} from "./rules.js";
import {
  compareSeverity,
  findingSort
} from "./findings.js";
import type {
  InternalFileReport,
  PostProcessSummary
} from "./internal.js";
import type {
  InstructionFinding,
  InstructionLintAppliedConfig,
  InstructionLintBudgetOverrides,
  InstructionLintFailOnSeverity,
  InstructionLintOptions,
  InstructionLintPresetSelector,
  InstructionLintProfile,
  InstructionLintSeverity,
  InstructionLintSurface,
  InstructionRuleId,
  InstructionRuleOverride,
  InstructionRuleSelector,
  InstructionSuppression
} from "../types.js";

export interface ResolvedLintPolicy {
  config?: ResolvedInstructionLintConfig;
  appliedConfig?: InstructionLintAppliedConfig;
  preset: InstructionLintPresetSelector;
  profile: InstructionLintProfile;
  failOnSeverity: InstructionLintFailOnSeverity;
  surface: InstructionLintSurface;
  budgets: InstructionBudgets;
  budgetOverrides: InstructionLintBudgetOverrides;
  model?: string;
  baselinePath?: string;
  ignore: string[];
  suppressions: NormalizedInstructionSuppression[];
  ruleOverrides: Partial<Record<InstructionRuleId, InstructionRuleOverride>>;
}

const DEFAULT_PROFILE: InstructionLintProfile = "standard";
const DEFAULT_FAIL_ON_SEVERITY: InstructionLintFailOnSeverity = "error";
const DEFAULT_SURFACE: InstructionLintSurface = "all";
const DEFAULT_PRESET: InstructionLintPresetSelector = "auto";
const MAX_BASELINE_FILE_BYTES = 10 * 1024 * 1024;

export function isSeverityFailing(
  finding: InstructionFinding,
  failOnSeverity: InstructionLintFailOnSeverity
): boolean {
  if (failOnSeverity === "off") {
    return false;
  }
  return compareSeverity(finding.severity, failOnSeverity) >= 0;
}

function splitCliList(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }
  return values
    .flatMap((value) => value.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeOptionSuppressions(
  suppressions: InstructionSuppression[] | undefined
): NormalizedInstructionSuppression[] {
  if (!suppressions) {
    return [];
  }

  return suppressions.map((suppression) => {
    const paths = (Array.isArray(suppression.path) ? suppression.path : [suppression.path])
      .map((entry) => entry.trim())
      .filter(Boolean);
    const rules = (suppression.rules ?? ["*"])
      .map((entry) => entry.trim())
      .filter((entry): entry is InstructionRuleSelector => entry === "*" || isInstructionRuleId(entry));

    return {
      paths,
      rules: rules.length > 0 ? rules : ["*"],
      ...(suppression.reason ? { reason: suppression.reason } : {})
    };
  });
}

function inferConfigBaseDirectory(inputs: string[]): string | undefined {
  const firstInput = inputs[0];
  if (!firstInput) {
    return undefined;
  }

  const absoluteInput = path.resolve(firstInput);
  if (!fs.existsSync(absoluteInput)) {
    return undefined;
  }

  const stat = fs.statSync(absoluteInput);
  if (stat.isDirectory()) {
    return inferRepoRootFromDirectory(absoluteInput) ?? absoluteInput;
  }
  if (stat.isFile()) {
    return inferRepoRootFromFile(absoluteInput) ?? path.dirname(absoluteInput);
  }
  return undefined;
}

export function resolveLintPolicy(
  inputs: string[],
  options: InstructionLintOptions
): ResolvedLintPolicy {
  const explicitConfigPath = options.configPath ? path.resolve(options.configPath) : undefined;
  const discoveredConfigPath =
    explicitConfigPath ?? (() => {
      const baseDirectory = inferConfigBaseDirectory(inputs);
      return baseDirectory ? discoverInstructionLintConfigPath(baseDirectory) : undefined;
    })();
  const loadedConfig = discoveredConfigPath
    ? loadInstructionLintConfig(discoveredConfigPath)
    : undefined;

  const ignore = [...new Set([
    ...splitCliList(loadedConfig?.ignore),
    ...splitCliList(options.ignore)
  ])];

  const ruleOverrides = {
    ...(loadedConfig?.ruleOverrides ?? {}),
    ...(options.ruleOverrides ?? {})
  };
  const budgetOverrides = {
    ...(loadedConfig?.budgets ?? {}),
    ...(options.budgets ?? {})
  };

  const suppressions = [
    ...(loadedConfig?.suppressions ?? []),
    ...normalizeOptionSuppressions(options.suppressions)
  ];

  const baselinePath = options.baseline
    ? path.resolve(options.baseline)
    : loadedConfig?.baselinePath;
  const model = options.model ?? loadedConfig?.model;

  const appliedConfig =
    loadedConfig ||
      baselinePath ||
      ignore.length > 0 ||
      suppressions.length > 0 ||
      Object.keys(ruleOverrides).length > 0 ||
      Object.keys(budgetOverrides).length > 0
      ? {
          ...(loadedConfig ? { source: displayPath(loadedConfig.sourcePath) } : {}),
          ...(baselinePath ? { baselinePath: displayPath(baselinePath) } : {}),
          ignore,
          suppressionCount: suppressions.length,
          overriddenRules: Object.keys(ruleOverrides)
            .filter((ruleId): ruleId is InstructionRuleId => isInstructionRuleId(ruleId))
            .sort((left, right) => left.localeCompare(right)),
          ...(Object.keys(budgetOverrides).length > 0 ? { budgetOverrides } : {}),
          ...(loadedConfig?.rollout ? { rollout: loadedConfig.rollout } : {})
        }
      : undefined;
  const profile = options.profile ?? loadedConfig?.profile ?? DEFAULT_PROFILE;

  return {
    ...(loadedConfig ? { config: loadedConfig } : {}),
    ...(appliedConfig ? { appliedConfig } : {}),
    preset: options.preset ?? loadedConfig?.preset ?? DEFAULT_PRESET,
    profile,
    failOnSeverity:
      options.failOnSeverity ?? loadedConfig?.failOnSeverity ?? DEFAULT_FAIL_ON_SEVERITY,
    surface: options.surface ?? loadedConfig?.surface ?? DEFAULT_SURFACE,
    budgets: resolveInstructionBudgets(profile, budgetOverrides),
    budgetOverrides,
    ...(model !== undefined ? { model } : {}),
    ...(baselinePath ? { baselinePath } : {}),
    ignore,
    suppressions,
    ruleOverrides
  };
}

function resolveRuleSeverity(
  finding: InstructionFinding,
  ruleOverrides: Partial<Record<InstructionRuleId, InstructionRuleOverride>>
): InstructionLintSeverity | undefined {
  const override = ruleOverrides[finding.ruleId];
  if (override?.enabled === false) {
    return undefined;
  }
  return override?.severity ?? finding.severity ?? getInstructionRuleDefaultSeverity(finding.ruleId);
}

function shouldSuppressFinding(
  finding: InstructionFinding,
  suppressions: NormalizedInstructionSuppression[]
): boolean {
  return suppressions.some((suppression) => {
    if (!suppression.paths.some((pattern) => path.matchesGlob(finding.file, pattern))) {
      return false;
    }
    return suppression.rules.includes("*") || suppression.rules.includes(finding.ruleId);
  });
}

function findingSignature(finding: InstructionFinding): string {
  return [finding.ruleId, finding.file, String(finding.line), finding.message].join("|");
}

function loadBaselineFindingSignatures(baselinePath: string): Set<string> {
  const absolutePath = path.resolve(baselinePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`Baseline path does not exist: ${baselinePath}`);
  }

  const raw = JSON.parse(readText(absolutePath, { maxBytes: MAX_BASELINE_FILE_BYTES })) as unknown;
  if (!raw || typeof raw !== "object" || !("findings" in raw) || !Array.isArray(raw.findings)) {
    throw new Error("Instruction lint baseline must be a JSON report with a findings array.");
  }

  const signatures = new Set<string>();
  for (const entry of raw.findings) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const finding = entry as Partial<InstructionFinding>;
    if (
      typeof finding.ruleId === "string" &&
      isInstructionRuleId(finding.ruleId) &&
      typeof finding.file === "string" &&
      typeof finding.line === "number" &&
      typeof finding.message === "string"
    ) {
      signatures.add(findingSignature(finding as InstructionFinding));
    }
  }

  return signatures;
}

export function postProcessFindings(
  reports: InternalFileReport[],
  policy: ResolvedLintPolicy
): PostProcessSummary {
  const baselineSignatures = policy.baselinePath
    ? loadBaselineFindingSignatures(policy.baselinePath)
    : new Set<string>();
  let suppressedFindingCount = 0;
  let baselineMatchedFindingCount = 0;

  for (const report of reports) {
    const finalized: InstructionFinding[] = [];
    for (const finding of report.findings) {
      const severity = resolveRuleSeverity(finding, policy.ruleOverrides);
      if (!severity) {
        suppressedFindingCount += 1;
        continue;
      }

      const withSeverity =
        severity === finding.severity ? finding : { ...finding, severity };
      if (shouldSuppressFinding(withSeverity, policy.suppressions)) {
        suppressedFindingCount += 1;
        continue;
      }

      if (baselineSignatures.has(findingSignature(withSeverity))) {
        baselineMatchedFindingCount += 1;
        continue;
      }

      finalized.push(withSeverity);
    }
    report.findings = finalized.sort(findingSort);
  }

  return {
    suppressedFindingCount,
    baselineMatchedFindingCount
  };
}
