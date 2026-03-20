#!/usr/bin/env node
import { analyzeAgentSnapshot, analyzePayload, diffReports } from "./analyzer.js";
import { formatAgentSummary, formatBudgetReport, formatDiffReport, formatInspectReport } from "./format.js";
import { readText, safeJsonParse } from "./helpers.js";

interface ParsedArgs {
  flags: Set<string>;
  values: Map<string, string>;
  positionals: string[];
}

const VALUE_FLAGS = new Set(["--model"]);

function loadJson(filePath: string): unknown {
  return safeJsonParse(readText(filePath));
}

function printUsage(): void {
  console.log(`Orqis

Usage:
  orqis inspect <file> [--json]
  orqis diff <before> <after> [--json]
  orqis budget <file> [--model <id>] [--json]
  orqis agent-report <file> [--json]`);
}

function parseArgs(args: string[]): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token) {
      continue;
    }

    if (token.startsWith("--")) {
      const nextToken = args[index + 1];
      if (VALUE_FLAGS.has(token) && nextToken && !nextToken.startsWith("--")) {
        values.set(token, nextToken);
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

function printOutput(value: unknown, textFormatter: () => string, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  console.log(textFormatter());
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
    const asJson = parsed.flags.has("--json");

    switch (command) {
      case "inspect": {
        const file = parsed.positionals[0];
        if (!file) {
          throw new Error("inspect requires a JSON file path.");
        }
        const report = analyzePayload(loadJson(file));
        printOutput(report, () => formatInspectReport(report), asJson);
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
        printOutput(report, () => formatDiffReport(report), asJson);
        return;
      }
      case "budget": {
        const file = parsed.positionals[0];
        if (!file) {
          throw new Error("budget requires a JSON file path.");
        }
        const payload = loadJson(file) as Record<string, unknown>;
        const overrideModel = parsed.values.get("--model");
        if (overrideModel && typeof payload === "object" && payload !== null) {
          payload.model = overrideModel;
        }
        const report = analyzePayload(payload);
        printOutput(report.budget, () => formatBudgetReport(report), asJson);
        return;
      }
      case "agent-report": {
        const file = parsed.positionals[0];
        if (!file) {
          throw new Error("agent-report requires a JSON file path.");
        }
        const summary = analyzeAgentSnapshot(loadJson(file));
        printOutput(summary, () => formatAgentSummary(summary), asJson);
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
