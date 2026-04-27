#!/usr/bin/env node
import { analyzeAgentSnapshot, analyzePayload, diffReports } from "./analyzer.js";
import { KNOWN_SEGMENT_TYPES, evaluateCheck } from "./check.js";
import {
  formatAgentSummary,
  formatAgentSummaryMarkdown,
  formatBudgetReport,
  formatBudgetReportMarkdown,
  formatCheckReport,
  formatCheckReportMarkdown,
  formatDiffReport,
  formatDiffReportMarkdown,
  formatInspectReport,
  formatInspectReportMarkdown,
  formatInstructionLintReportAzure,
  formatInstructionLintReportGithub,
  formatInstructionLintReport,
  formatInstructionLintReportMarkdown
} from "./format.js";
import { isObject, readText, safeJsonParse } from "./helpers.js";
import { lintInstructions } from "./instructions/lint.js";
import type {
  CheckRiskThreshold,
  CheckThresholds,
  ContextReport,
  InstructionLintFailOnSeverity,
  InstructionLintPresetSelector,
  InstructionLintProfile,
  InstructionLintSurface,
  SegmentType
} from "./types.js";

interface ParsedArgs {
  flags: Set<string>;
  values: Map<string, string[]>;
  positionals: string[];
}

interface CommandHelp {
  summary: string;
  usage: string;
  options: string[];
  examples: string[];
  notes?: string[];
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
  "--surface",
  "--preset",
  "--config",
  "--ignore"
]);
const RISK_THRESHOLDS = new Set<CheckRiskThreshold>(["low", "medium", "high"]);
const INSTRUCTION_PROFILES = new Set<InstructionLintProfile>(["lite", "standard", "strict"]);
const INSTRUCTION_FAIL_ON_SEVERITIES = new Set<InstructionLintFailOnSeverity>(["off", "warning", "error"]);
const INSTRUCTION_SURFACES = new Set<InstructionLintSurface>(["code-review", "chat", "coding-agent"]);
const INSTRUCTION_PRESETS = new Set<InstructionLintPresetSelector>(["auto", "copilot", "agents-md"]);
const SEGMENT_TYPES = new Set<SegmentType>(KNOWN_SEGMENT_TYPES);
const OUTPUT_FORMATS = new Set(["text", "json", "markdown", "github", "azure"]);
type OutputMode = "text" | "json" | "markdown" | "github" | "azure";

const OUTPUT_FLAGS = new Set(["--format", "--json"]);
const HELP_FLAGS = new Set(["--help", "-h"]);
const INSPECT_FLAGS = OUTPUT_FLAGS;
const DIFF_FLAGS = OUTPUT_FLAGS;
const BUDGET_FLAGS = new Set([...OUTPUT_FLAGS, "--model"]);
const AGENT_REPORT_FLAGS = OUTPUT_FLAGS;
const CHECK_FLAGS = new Set([
  ...OUTPUT_FLAGS,
  "--model",
  "--max-usage-percent",
  "--max-total-tokens",
  "--max-segment-tokens",
  "--fail-on-risk",
  "--baseline"
]);
const INSTRUCTIONS_LINT_FLAGS = new Set([
  ...OUTPUT_FLAGS,
  "--config",
  "--baseline",
  "--ignore",
  "--preset",
  "--profile",
  "--surface",
  "--model",
  "--fail-on-severity"
]);

const COMMAND_HELP: Record<string, CommandHelp> = {
  "instructions-lint": {
    summary: "Lint repository instruction files for duplicated, conflicting, vague, stale, or oversized guidance.",
    usage:
      "tokn instructions-lint <path> [--config <file>] [--baseline <file>] [--ignore <glob>] [--preset <auto|copilot|agents-md>] [--profile <lite|standard|strict>] [--surface <code-review|chat|coding-agent>] [--model <id>] [--fail-on-severity <off|warning|error>] [--format <text|json|markdown|github|azure>]",
    options: [
      "--config <file>                 Read instructions-lint config from a JSON file.",
      "--baseline <file>               Suppress findings already present in a previous JSON report.",
      "--ignore <glob>                 Ignore instruction or target files; repeat for multiple globs.",
      "--preset <auto|copilot|agents-md>",
      "--profile <lite|standard|strict>",
      "--surface <code-review|chat|coding-agent>",
      "--model <id>                    Include model-aware context budget fields when available.",
      "--fail-on-severity <off|warning|error>",
      "--format <text|json|markdown|github|azure>",
      "--json                          Alias for --format json."
    ],
    examples: [
      "tokn instructions-lint .",
      "tokn instructions-lint . --config ./tokn.config.json",
      "tokn instructions-lint . --baseline ./.tokn/instructions-baseline.json",
      "tokn instructions-lint . --surface coding-agent --preset agents-md",
      "tokn instructions-lint . --format github --fail-on-severity warning"
    ],
    notes: [
      "This is the stable public Tokn command in public alpha.",
      "The command is read-only and does not modify instruction files."
    ]
  },
  inspect: {
    summary: "Inspect a saved LLM request, transcript, or supported trace payload and rank prompt/context segments.",
    usage: "tokn inspect <file> [--format <text|json|markdown>]",
    options: [
      "--format <text|json|markdown>",
      "--json                          Alias for --format json."
    ],
    examples: [
      "tokn inspect ./fixtures/openai-request.json",
      "tokn inspect ./fixtures/anthropic-request.json --format markdown",
      "tokn inspect ./fixtures/openai-compatible-chat-log.json --json"
    ],
    notes: ["Experimental diagnostic command."]
  },
  diff: {
    summary: "Compare two supported payloads and show which context segments grew or shrank.",
    usage: "tokn diff <before> <after> [--format <text|json|markdown>]",
    options: [
      "--format <text|json|markdown>",
      "--json                          Alias for --format json."
    ],
    examples: [
      "tokn diff ./fixtures/turn-1.json ./fixtures/turn-2.json",
      "tokn diff ./before.json ./after.json --format markdown",
      "tokn diff ./before.json ./after.json --json"
    ],
    notes: ["Experimental diagnostic command."]
  },
  budget: {
    summary: "Calculate model context headroom for a supported payload or stored Tokn ContextReport.",
    usage: "tokn budget <file> [--model <id>] [--format <text|json|markdown>]",
    options: [
      "--model <id>                    Override the model when the input is a raw payload.",
      "--format <text|json|markdown>",
      "--json                          Alias for --format json."
    ],
    examples: [
      "tokn budget ./fixtures/anthropic-request.json --model claude-3-5-sonnet-latest",
      "tokn budget ./fixtures/openai-request.json --model gpt-4o --format markdown",
      "tokn budget ./context-report.json --json"
    ],
    notes: ["Experimental diagnostic command."]
  },
  "agent-report": {
    summary: "Summarize context pressure across imported multi-agent snapshots or trace exports.",
    usage: "tokn agent-report <file> [--format <text|json|markdown>]",
    options: [
      "--format <text|json|markdown>",
      "--json                          Alias for --format json."
    ],
    examples: [
      "tokn agent-report ./fixtures/agent-snapshot.json",
      "tokn agent-report ./fixtures/langfuse-trace.json --format markdown",
      "tokn agent-report ./fixtures/openinference-trace.json --json"
    ],
    notes: ["Experimental diagnostic command."]
  },
  check: {
    summary: "Evaluate a context report against explicit token, usage, segment, or risk thresholds.",
    usage:
      "tokn check <file> [--model <id>] [--max-usage-percent <n>] [--max-total-tokens <n>] [--max-segment-tokens <type=n>] [--fail-on-risk <low|medium|high>] [--baseline <file>] [--format <text|json|markdown>]",
    options: [
      "--model <id>                    Override the model when the input is a raw payload.",
      "--max-usage-percent <n>         Fail when usage percent exceeds the threshold.",
      "--max-total-tokens <n>          Fail when total input tokens exceed the threshold.",
      "--max-segment-tokens <type=n>   Fail when a segment type exceeds the threshold; repeat as needed.",
      "--fail-on-risk <low|medium|high>",
      "--baseline <file>               Include a delta against another supported payload or ContextReport.",
      "--format <text|json|markdown>",
      "--json                          Alias for --format json."
    ],
    examples: [
      "tokn check ./fixtures/anthropic-request.json --model claude-3-5-sonnet-latest --max-total-tokens 100",
      "tokn check ./fixtures/suggestions-high-pressure.json --max-segment-tokens tool_schema=300 --fail-on-risk medium",
      "tokn check ./after.json --baseline ./before.json --max-usage-percent 80 --format markdown"
    ],
    notes: ["Experimental diagnostic command."]
  }
};

function loadJson(filePath: string): unknown {
  return safeJsonParse(readText(filePath));
}

function printUsage(): void {
  console.log(`Tokn

Usage:
  tokn <command> [options]
  tokn <command> --help
  tokn help <command>

Stable public command:
  instructions-lint  Lint repository instruction files for AI-assisted development.

Experimental diagnostics:
  inspect            Inspect prompt/context composition from a saved payload.
  diff               Compare context growth between two payloads.
  budget             Report model context headroom.
  agent-report       Summarize context pressure across agent snapshots or traces.
  check              Evaluate token/risk thresholds for CI.

Examples:
  tokn instructions-lint .
  tokn instructions-lint . --format github --fail-on-severity warning
  tokn inspect ./fixtures/openai-request.json --format markdown
  tokn diff ./fixtures/turn-1.json ./fixtures/turn-2.json
  tokn budget ./fixtures/anthropic-request.json --model claude-3-5-sonnet-latest
  tokn agent-report ./fixtures/agent-snapshot.json
  tokn check ./fixtures/anthropic-request.json --max-total-tokens 100

Notes:
  instructions-lint is the primary supported enterprise surface in public alpha.
  inspect, diff, budget, agent-report, and check remain available as experimental diagnostics.
  Run "tokn <command> --help" for command-specific options and examples.`);
}

function printCommandUsage(command: string): boolean {
  const help = COMMAND_HELP[command];
  if (!help) {
    return false;
  }

  console.log(`Tokn ${command}

${help.summary}

Usage:
  ${help.usage}

Options:
${help.options.map((option) => `  ${option}`).join("\n")}

Examples:
${help.examples.map((example) => `  ${example}`).join("\n")}${
    help.notes && help.notes.length > 0
      ? `\n\nNotes:\n${help.notes.map((note) => `  ${note}`).join("\n")}`
      : ""
  }`);
  return true;
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
      const separatorIndex = token.indexOf("=");
      const flag = separatorIndex > 0 ? token.slice(0, separatorIndex) : token;
      const inlineValue = separatorIndex > 0 ? token.slice(separatorIndex + 1) : undefined;

      if (VALUE_FLAGS.has(flag)) {
        const nextToken = args[index + 1];
        const value = inlineValue ?? (nextToken && !nextToken.startsWith("--") ? nextToken : undefined);
        if (value === undefined || value === "") {
          throw new Error(`${flag} requires a value.`);
        }

        const existing = values.get(flag) ?? [];
        existing.push(value);
        values.set(flag, existing);
        if (inlineValue === undefined) {
          index += 1;
        }
      } else {
        if (inlineValue !== undefined) {
          throw new Error(`${flag} does not accept a value.`);
        }
        flags.add(flag);
      }
      continue;
    }

    if (token === "-h") {
      flags.add(token);
      continue;
    }

    positionals.push(token);
  }

  return { flags, values, positionals };
}

function hasHelpFlag(parsed: ParsedArgs): boolean {
  return [...HELP_FLAGS].some((flag) => parsed.flags.has(flag));
}

function getLastValue(parsed: ParsedArgs, flag: string): string | undefined {
  const values = parsed.values.get(flag);
  return values?.[values.length - 1];
}

function getAllValues(parsed: ParsedArgs, flag: string): string[] {
  return parsed.values.get(flag) ?? [];
}

function validateAllowedOptions(parsed: ParsedArgs, command: string, allowedFlags: Set<string>): void {
  const usedFlags = new Set([
    ...parsed.flags,
    ...parsed.values.keys()
  ]);

  for (const flag of [...usedFlags].sort((left, right) => left.localeCompare(right))) {
    if (!allowedFlags.has(flag)) {
      throw new Error(`Option ${flag} is not supported for ${command}.`);
    }
  }
}

function requirePositionals(parsed: ParsedArgs, command: string, expectedCount: number): void {
  if (parsed.positionals.length < expectedCount) {
    throw new Error(
      expectedCount === 1
        ? `${command} requires one path argument.`
        : `${command} requires ${expectedCount} path arguments.`
    );
  }
  if (parsed.positionals.length > expectedCount) {
    throw new Error(`${command} received unexpected extra argument: ${parsed.positionals[expectedCount]}.`);
  }
}

function requireOnePath(parsed: ParsedArgs, command: string): string {
  requirePositionals(parsed, command, 1);
  return parsed.positionals[0] as string;
}

function requireTwoPaths(parsed: ParsedArgs, command: string): [string, string] {
  requirePositionals(parsed, command, 2);
  return [parsed.positionals[0] as string, parsed.positionals[1] as string];
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
      throw new Error("--format must be one of: text, json, markdown, github, azure.");
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

function parseInstructionFailSeverity(parsed: ParsedArgs): InstructionLintFailOnSeverity | undefined {
  const severity = getLastValue(parsed, "--fail-on-severity");
  if (severity === undefined) {
    return undefined;
  }
  if (!INSTRUCTION_FAIL_ON_SEVERITIES.has(severity as InstructionLintFailOnSeverity)) {
    throw new Error("--fail-on-severity must be one of: off, warning, error.");
  }
  return severity as InstructionLintFailOnSeverity;
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

function parseInstructionPreset(parsed: ParsedArgs): InstructionLintPresetSelector | undefined {
  const preset = getLastValue(parsed, "--preset");
  if (preset === undefined) {
    return undefined;
  }
  if (!INSTRUCTION_PRESETS.has(preset as InstructionLintPresetSelector)) {
    throw new Error("--preset must be one of: auto, copilot, agents-md.");
  }
  return preset as InstructionLintPresetSelector;
}

function printOutput(
  value: unknown,
  formatter: Partial<Record<Exclude<OutputMode, "json">, () => string>>,
  outputMode: OutputMode
): void {
  if (outputMode === "json") {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  const render = formatter[outputMode];
  if (!render) {
    throw new Error(`--format ${outputMode} is not supported for this command.`);
  }
  console.log(render());
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  if (!command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (command === "--help" || command === "-h") {
    printUsage();
    process.exitCode = 0;
    return;
  }

  try {
    if (command === "help") {
      const [requestedCommand, ...extraArgs] = args;
      if (!requestedCommand) {
        printUsage();
        process.exitCode = 0;
        return;
      }
      if (extraArgs.length > 0) {
        throw new Error(`help received unexpected extra argument: ${extraArgs[0]}.`);
      }
      if (!printCommandUsage(requestedCommand)) {
        throw new Error(`Unknown command: ${requestedCommand}.`);
      }
      process.exitCode = 0;
      return;
    }

    const parsed = parseArgs(args);
    if (hasHelpFlag(parsed)) {
      if (!printCommandUsage(command)) {
        throw new Error(`Unknown command: ${command}.`);
      }
      process.exitCode = 0;
      return;
    }

    const outputMode = resolveOutputMode(parsed);

    switch (command) {
      case "inspect": {
        validateAllowedOptions(parsed, command, INSPECT_FLAGS);
        const file = requireOnePath(parsed, command);
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
        validateAllowedOptions(parsed, command, DIFF_FLAGS);
        const [beforeFile, afterFile] = requireTwoPaths(parsed, command);
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
        validateAllowedOptions(parsed, command, BUDGET_FLAGS);
        const file = requireOnePath(parsed, command);
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
        validateAllowedOptions(parsed, command, AGENT_REPORT_FLAGS);
        const file = requireOnePath(parsed, command);
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
        validateAllowedOptions(parsed, command, CHECK_FLAGS);
        const file = requireOnePath(parsed, command);
        const thresholds = parseCheckThresholds(parsed);
        const report = loadContextReport(file, getLastValue(parsed, "--model"));
        const baselineFile = getLastValue(parsed, "--baseline");
        const baseline = baselineFile ? loadContextReport(baselineFile) : undefined;
        const result = evaluateCheck(report, thresholds, baseline);
        printOutput(
          result,
          {
            text: () => formatCheckReport(result),
            markdown: () => formatCheckReportMarkdown(result)
          },
          outputMode
        );
        process.exitCode = result.exitCode;
        return;
      }
      case "instructions-lint": {
        validateAllowedOptions(parsed, command, INSTRUCTIONS_LINT_FLAGS);
        const inputPath = requireOnePath(parsed, command);

        const profile = parseInstructionProfile(parsed);
        const failOnSeverity = parseInstructionFailSeverity(parsed);
        const surface = parseInstructionSurface(parsed);
        const preset = parseInstructionPreset(parsed);
        const model = getLastValue(parsed, "--model");
        const configPath = getLastValue(parsed, "--config");
        const baseline = getLastValue(parsed, "--baseline");
        const ignore = getAllValues(parsed, "--ignore");
        const report = lintInstructions(inputPath, {
          ...(preset ? { preset } : {}),
          ...(profile ? { profile } : {}),
          ...(failOnSeverity ? { failOnSeverity } : {}),
          ...(surface ? { surface } : {}),
          ...(model ? { model } : {}),
          ...(configPath ? { configPath } : {}),
          ...(baseline ? { baseline } : {}),
          ...(ignore.length > 0 ? { ignore } : {})
        });
        printOutput(
          report,
          {
            text: () => formatInstructionLintReport(report),
            markdown: () => formatInstructionLintReportMarkdown(report),
            github: () => formatInstructionLintReportGithub(report),
            azure: () => formatInstructionLintReportAzure(report)
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
