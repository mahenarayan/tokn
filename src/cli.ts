#!/usr/bin/env node
import { analyzeAgentSnapshot, analyzePayload, diffReports } from "./analyzer.js";
import { formatAgentSummary, formatBudgetReport, formatDiffReport, formatInspectReport } from "./format.js";
import { readText, safeJsonParse } from "./helpers.js";

function loadJson(filePath: string): unknown {
  return safeJsonParse(readText(filePath));
}

function printUsage(): void {
  console.log(`Orqis

Usage:
  orqis inspect <file>
  orqis diff <before> <after>
  orqis budget <file> [--model <id>]
  orqis agent-report <file>`);
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  if (!command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  try {
    switch (command) {
      case "inspect": {
        const file = args[0];
        if (!file) {
          throw new Error("inspect requires a JSON file path.");
        }
        const report = analyzePayload(loadJson(file));
        console.log(formatInspectReport(report));
        return;
      }
      case "diff": {
        const beforeFile = args[0];
        const afterFile = args[1];
        if (!beforeFile || !afterFile) {
          throw new Error("diff requires two JSON file paths.");
        }
        const before = analyzePayload(loadJson(beforeFile));
        const after = analyzePayload(loadJson(afterFile));
        console.log(formatDiffReport(diffReports(before, after)));
        return;
      }
      case "budget": {
        const file = args[0];
        if (!file) {
          throw new Error("budget requires a JSON file path.");
        }
        const payload = loadJson(file) as Record<string, unknown>;
        const overrideModel = getFlagValue(args, "--model");
        if (overrideModel && typeof payload === "object" && payload !== null) {
          payload.model = overrideModel;
        }
        const report = analyzePayload(payload);
        console.log(formatBudgetReport(report));
        return;
      }
      case "agent-report": {
        const file = args[0];
        if (!file) {
          throw new Error("agent-report requires a JSON file path.");
        }
        const summary = analyzeAgentSnapshot(loadJson(file));
        console.log(formatAgentSummary(summary));
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
