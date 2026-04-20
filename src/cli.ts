#!/usr/bin/env node
import { analyzeAgentSnapshot, analyzePayload, diffReports } from "./analyzer.js";
import { KNOWN_SEGMENT_TYPES, evaluateCheck } from "./check.js";
import {
  formatAgentSummary,
  formatAgentSummaryMarkdown,
  formatBudgetReport,
  formatBudgetReportMarkdown,
  formatCheckReport,
  formatDiffReport,
  formatDiffReportMarkdown,
  formatInspectReport,
  formatInspectReportMarkdown,
  formatInstructionLintReport,
  formatInstructionLintReportMarkdown
} from "./format.js";
import { isObject, readText, safeJsonParse } from "./helpers.js";
import { lintInstructions } from "./instructions/lint.js";
import type {
  CheckRiskThreshold,
  CheckThresholds,
  ContextReport,
  InstructionLintProfile,
  InstructionLintSeverity,
  InstructionLintSurface,
  SegmentType
} from "./types.js";

interface ParsedArgs {
  flags: Set<string>;
  values: Map<string, string[]>;
  positionals: string[];
}

const VALUE_FLAGS = new Set([
  "--model",
  "--max-usage-percent",
  "--max-total-tokens",
  "--max-segment-tokens",
  "--fail-on-risk",
  "--baseline",
  "--format",
  "--profile",
  "--fail-on-severity",
  "--surface"
]);
const RISK_THRESHOLDS = new Set<CheckRiskThreshold>(["low", "medium", "high"]);
const INSTRUCTION_PROFILES = new Set<InstructionLintProfile>(["lite", "standard", "strict"]);
const INSTRUCTION_SEVERITIES = new Set<InstructionLintSeverity>(["warning", "error"]);
const INSTRUCTION_SURFACES = new Set<InstructionLintSurface>(["code-review", "chat", "coding-agent"]);
const SEGMENT_TYPES = new Set<SegmentType>(KNOWN_SEGMENT_TYPES);
const OUTPUT_FORMATS = new Set(["text", "json", "markdown"]);
type OutputMode = "text" | "json" | "markdown";

function loadJson(filePath: string): unknown {
  return safeJsonParse(readText(filePath));
}

function printUsage(): void {
  console.log(`Orqis

Usage:
  orqis inspect <file> [--json]
  orqis inspect <file> [--format <text|json|markdown>]
  orqis diff <before> <after> [--json]
  orqis diff <before> <after> [--format <text|json|markdown>]
  orqis budget <file> [--model <id>] [--json]
  orqis budget <file> [--model <id>] [--format <text|json|markdown>]
  orqis agent-report <file> [--json]
  orqis agent-report <file> [--format <text|json|markdown>]
  orqis check <file> [--model <id>] [--max-usage-percent <n>] [--max-total-tokens <n>] [--max-segment-tokens <type=n>] [--fail-on-risk <low|medium|high>] [--baseline <file>] [--json]
  orqis instructions-lint <path> [--profile <lite|standard|strict>] [--surface <code-review|chat|coding-agent>] [--model <id>] [--fail-on-severity <warning|error>] [--format <text|json|markdown>]`);
}

function parseArgs(args: string[]): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string[]>();
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token) {
      continue;
    }

    if (token.startsWith("--")) {
      const nextToken = args[index + 1];
      if (VALUE_FLAGS.has(token) && nextToken && !nextToken.startsWith("--")) {
        const existing = values.get(token) ?? [];
        existing.push(nextToken);
        values.set(token, existing);
        index += 1;
      } else {
        flags.add(token);
      }
      continue;
    }

    positionals.push(token);
  }

  return { flags, values, positionals };
}

function getLastValue(parsed: ParsedArgs, flag: string): string | undefined {
  const values = parsed.values.get(flag);
  return values?.[values.length - 1];
}

function getAllValues(parsed: ParsedArgs, flag: string): string[] {
  return parsed.values.get(flag) ?? [];
}

function parseFiniteNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative number.`);
  }
  return parsed;
}

function isContextReportLike(value: unknown): value is ContextReport {
  return (
    isObject(value) &&
    typeof value.sourceType === "string" &&
    Array.isArray(value.segments) &&
    typeof value.totalInputTokens === "number" &&
    typeof value.totalConfidence === "string" &&
    isObject(value.budget) &&
    Array.isArray(value.warnings)
  );
}

function normalizeStoredReport(value: ContextReport): ContextReport {
  return {
    ...value,
    suggestions: Array.isArray(value.suggestions) ? value.suggestions : []
  };
}

function loadContextReport(filePath: string, overrideModel?: string): ContextReport {
  const raw = loadJson(filePath);
  if (isContextReportLike(raw)) {
    if (overrideModel) {
      throw new Error("--model cannot be used with a stored ContextReport file.");
    }
    return normalizeStoredReport(raw);
  }

  if (!isObject(raw)) {
    throw new Error("Input must be a JSON object.");
  }

  const payload = { ...raw };
  if (overrideModel) {
    payload.model = overrideModel;
  }
  return analyzePayload(payload);
}

function parseSegmentThresholds(values: string[]): Partial<Record<SegmentType, number>> | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const thresholds: Partial<Record<SegmentType, number>> = {};
  for (const value of values) {
    const separatorIndex = value.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      throw new Error("--max-segment-tokens must use the form <type>=<n>.");
    }

    const segmentType = value.slice(0, separatorIndex) as SegmentType;
    const rawLimit = value.slice(separatorIndex + 1);
    if (!SEGMENT_TYPES.has(segmentType)) {
      throw new Error(`Unknown segment type for --max-segment-tokens: ${segmentType}.`);
    }
    if (segmentType in thresholds) {
      throw new Error(`Duplicate --max-segment-tokens threshold for ${segmentType}.`);
    }

    thresholds[segmentType] = parseFiniteNumber(rawLimit, "--max-segment-tokens");
  }

  return thresholds;
}

function parseCheckThresholds(parsed: ParsedArgs): CheckThresholds {
  const thresholds: CheckThresholds = {};

  const maxUsagePercent = getLastValue(parsed, "--max-usage-percent");
  if (maxUsagePercent !== undefined) {
    thresholds.maxUsagePercent = parseFiniteNumber(maxUsagePercent, "--max-usage-percent");
  }

  const maxTotalTokens = getLastValue(parsed, "--max-total-tokens");
  if (maxTotalTokens !== undefined) {
    thresholds.maxTotalTokens = parseFiniteNumber(maxTotalTokens, "--max-total-tokens");
  }

  const maxSegmentTokens = parseSegmentThresholds(getAllValues(parsed, "--max-segment-tokens"));
  if (maxSegmentTokens !== undefined) {
    thresholds.maxSegmentTokens = maxSegmentTokens;
  }

  const failOnRisk = getLastValue(parsed, "--fail-on-risk");
  if (failOnRisk !== undefined) {
    if (!RISK_THRESHOLDS.has(failOnRisk as CheckRiskThreshold)) {
      throw new Error("--fail-on-risk must be one of: low, medium, high.");
    }
    thresholds.failOnRisk = failOnRisk as CheckRiskThreshold;
  }

  if (
    thresholds.maxUsagePercent === undefined &&
    thresholds.maxTotalTokens === undefined &&
    thresholds.maxSegmentTokens === undefined &&
    thresholds.failOnRisk === undefined
  ) {
    throw new Error("check requires at least one threshold flag.");
  }

  return thresholds;
}

function resolveOutputMode(parsed: ParsedArgs): OutputMode {
  const format = getLastValue(parsed, "--format");
  const jsonFlag = parsed.flags.has("--json");

  if (format !== undefined) {
    if (!OUTPUT_FORMATS.has(format)) {
      throw new Error("--format must be one of: text, json, markdown.");
    }
    if (jsonFlag && format !== "json") {
      throw new Error("--json cannot be combined with a non-json --format.");
    }
    return format as OutputMode;
  }

  return jsonFlag ? "json" : "text";
}

function parseInstructionProfile(parsed: ParsedArgs): InstructionLintProfile | undefined {
  const profile = getLastValue(parsed, "--profile");
  if (profile === undefined) {
    return undefined;
  }
  if (!INSTRUCTION_PROFILES.has(profile as InstructionLintProfile)) {
    throw new Error("--profile must be one of: lite, standard, strict.");
  }
  return profile as InstructionLintProfile;
}

function parseInstructionFailSeverity(parsed: ParsedArgs): InstructionLintSeverity | undefined {
  const severity = getLastValue(parsed, "--fail-on-severity");
  if (severity === undefined) {
    return undefined;
  }
  if (!INSTRUCTION_SEVERITIES.has(severity as InstructionLintSeverity)) {
    throw new Error("--fail-on-severity must be one of: warning, error.");
  }
  return severity as InstructionLintSeverity;
}

function parseInstructionSurface(parsed: ParsedArgs): InstructionLintSurface | undefined {
  const surface = getLastValue(parsed, "--surface");
  if (surface === undefined) {
    return undefined;
  }
  if (!INSTRUCTION_SURFACES.has(surface as InstructionLintSurface)) {
    throw new Error("--surface must be one of: code-review, chat, coding-agent.");
  }
  return surface as InstructionLintSurface;
}

function printOutput(value: unknown, formatter: Record<Exclude<OutputMode, "json">, () => string>, outputMode: OutputMode): void {
  if (outputMode === "json") {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  console.log(formatter[outputMode]());
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  if (!command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  try {
    const parsed = parseArgs(args);
    const outputMode = resolveOutputMode(parsed);

    switch (command) {
      case "inspect": {
        const file = parsed.positionals[0];
        if (!file) {
          throw new Error("inspect requires a JSON file path.");
        }
        const report = analyzePayload(loadJson(file));
        printOutput(
          report,
          {
            text: () => formatInspectReport(report),
            markdown: () => formatInspectReportMarkdown(report)
          },
          outputMode
        );
        return;
      }
      case "diff": {
        const beforeFile = parsed.positionals[0];
        const afterFile = parsed.positionals[1];
        if (!beforeFile || !afterFile) {
          throw new Error("diff requires two JSON file paths.");
        }
        const before = analyzePayload(loadJson(beforeFile));
        const after = analyzePayload(loadJson(afterFile));
        const report = diffReports(before, after);
        printOutput(
          report,
          {
            text: () => formatDiffReport(report),
            markdown: () => formatDiffReportMarkdown(report)
          },
          outputMode
        );
        return;
      }
      case "budget": {
        const file = parsed.positionals[0];
        if (!file) {
          throw new Error("budget requires a JSON file path.");
        }
        const report = loadContextReport(file, getLastValue(parsed, "--model"));
        printOutput(
          report.budget,
          {
            text: () => formatBudgetReport(report),
            markdown: () => formatBudgetReportMarkdown(report)
          },
          outputMode
        );
        return;
      }
      case "agent-report": {
        const file = parsed.positionals[0];
        if (!file) {
          throw new Error("agent-report requires a JSON file path.");
        }
        const summary = analyzeAgentSnapshot(loadJson(file));
        printOutput(
          summary,
          {
            text: () => formatAgentSummary(summary),
            markdown: () => formatAgentSummaryMarkdown(summary)
          },
          outputMode
        );
        return;
      }
      case "check": {
        const file = parsed.positionals[0];
        if (!file) {
          throw new Error("check requires a JSON file path.");
        }
        const thresholds = parseCheckThresholds(parsed);
        const report = loadContextReport(file, getLastValue(parsed, "--model"));
        const baselineFile = getLastValue(parsed, "--baseline");
        const baseline = baselineFile ? loadContextReport(baselineFile) : undefined;
        const result = evaluateCheck(report, thresholds, baseline);
        printOutput(
          result,
          {
            text: () => formatCheckReport(result),
            markdown: () => formatCheckReport(result)
          },
          outputMode
        );
        process.exitCode = result.exitCode;
        return;
      }
      case "instructions-lint": {
        const inputPath = parsed.positionals[0];
        if (!inputPath) {
          throw new Error("instructions-lint requires a file or directory path.");
        }

        const profile = parseInstructionProfile(parsed);
        const failOnSeverity = parseInstructionFailSeverity(parsed);
        const surface = parseInstructionSurface(parsed);
        const model = getLastValue(parsed, "--model");
        const report = lintInstructions(inputPath, {
          ...(profile ? { profile } : {}),
          ...(failOnSeverity ? { failOnSeverity } : {}),
          ...(surface ? { surface } : {}),
          ...(model ? { model } : {})
        });
        printOutput(
          report,
          {
            text: () => formatInstructionLintReport(report),
            markdown: () => formatInstructionLintReportMarkdown(report)
          },
          outputMode
        );
        process.exitCode = report.exitCode;
        return;
      }
      default:
        printUsage();
        process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
}

void main();
