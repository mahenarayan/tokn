import fs from "node:fs";
import path from "node:path";

import { readText } from "../helpers.js";
import type {
  InstructionDriftSummary,
  InstructionFinding,
  InstructionFindingConfidence,
  InstructionRuleId
} from "../types.js";
import { addFinding } from "./findings.js";
import {
  type InternalFileReport,
  appliesToSurface
} from "./internal.js";
import { normalizePath } from "./discovery.js";

interface ReferenceCandidate {
  value: string;
  line: number;
}

interface RepositoryIndex {
  files: Set<string>;
  directories: Set<string>;
  scripts: Set<string>;
  symbolFiles: Map<string, string[]>;
}

const BACKTICK_RE = /`([^`\n]{2,180})`/g;
const PACKAGE_COMMAND_RE = /\b(?:npm|pnpm|bun|yarn)\s+(run\s+)?([A-Za-z0-9:_-]{2,80})\b/g;
const SYMBOL_RE = /\b([A-Za-z_$][A-Za-z0-9_$]{2,80})\s*\(\)/g;
const PATH_EXTENSION_RE =
  /\.(?:[cm]?[tj]sx?|json|ya?ml|toml|md|mdx|rs|go|py|rb|java|kt|cs|php|sh|bash|zsh|fish|proto|graphql|sql|css|scss|html|xml)$/i;
const SOURCE_FILE_RE =
  /\.(?:[cm]?[tj]sx?|rs|go|py|rb|java|kt|cs|php|proto|graphql)$/i;
const COMMON_COMMANDS = new Set([
  "add",
  "audit",
  "build",
  "ci",
  "clean",
  "create",
  "dev",
  "exec",
  "install",
  "link",
  "pack",
  "publish",
  "start",
  "test",
  "version"
]);
const COMMON_SYMBOLS = new Set([
  "after",
  "before",
  "catch",
  "describe",
  "expect",
  "get",
  "it",
  "main",
  "render",
  "run",
  "set",
  "test"
]);

const DRIFT_RULE_IDS = new Set<InstructionRuleId>([
  "missing-file-reference",
  "missing-command-reference",
  "missing-symbol-reference"
]);

const CONFIDENCE_ORDER: InstructionFindingConfidence[] = ["high", "medium", "low"];

function incrementMap(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortCountEntries(left: { count: number; key: string }, right: { count: number; key: string }): number {
  return right.count - left.count || left.key.localeCompare(right.key);
}

function topCountEntries(map: Map<string, number>, limit: number): Array<{ key: string; count: number }> {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort(sortCountEntries)
    .slice(0, limit);
}

function findingReferenceValue(finding: InstructionFinding): string | undefined {
  const value = finding.evidence?.actual;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function collectBacktickReferences(report: InternalFileReport): ReferenceCandidate[] {
  const references: ReferenceCandidate[] = [];
  for (const statement of report.statements) {
    for (const match of statement.text.matchAll(BACKTICK_RE)) {
      const value = match[1]?.trim();
      if (!value) {
        continue;
      }
      references.push({
        value,
        line: statement.line
      });
    }
  }
  return references;
}

function collectCommandReferences(report: InternalFileReport): ReferenceCandidate[] {
  const references: ReferenceCandidate[] = [];
  for (const statement of report.statements) {
    for (const match of statement.text.matchAll(PACKAGE_COMMAND_RE)) {
      const hasRun = Boolean(match[1]);
      const script = match[2]?.trim();
      if (!script || (!hasRun && COMMON_COMMANDS.has(script))) {
        continue;
      }
      references.push({
        value: script,
        line: statement.line
      });
    }
  }
  return references;
}

function collectSymbolReferences(reference: ReferenceCandidate): ReferenceCandidate[] {
  if (reference.value.includes("/") || reference.value.includes(" ")) {
    return [];
  }

  const references: ReferenceCandidate[] = [];
  for (const match of reference.value.matchAll(SYMBOL_RE)) {
    const symbol = match[1]?.trim();
    if (!symbol || COMMON_SYMBOLS.has(symbol)) {
      continue;
    }
    references.push({
      value: symbol,
      line: reference.line
    });
  }
  return references;
}

function normalizeReferencePath(value: string): string | undefined {
  let candidate = value.trim();
  if (!candidate || candidate.includes("://") || candidate.startsWith("#")) {
    return undefined;
  }
  if (candidate.includes("*") || candidate.includes("{") || candidate.includes("}")) {
    return undefined;
  }
  if (candidate.includes(" ") || candidate.includes("\t")) {
    return undefined;
  }
  candidate = candidate.replace(/^[./\\]+/, "");
  candidate = candidate.replace(/[:#].*$/, "");
  candidate = candidate.replace(/[),.;]+$/, "");
  candidate = normalizePath(candidate);
  candidate = candidate.replace(/\/+$/, "");

  if (!candidate || candidate === "." || candidate === "..") {
    return undefined;
  }
  if (!candidate.includes("/") && !PATH_EXTENSION_RE.test(candidate)) {
    return undefined;
  }
  return candidate;
}

function isPathReference(value: string): boolean {
  return normalizeReferencePath(value) !== undefined;
}

function buildDirectories(files: string[]): Set<string> {
  const directories = new Set<string>();
  for (const file of files) {
    let current = path.posix.dirname(file);
    while (current && current !== ".") {
      directories.add(current);
      current = path.posix.dirname(current);
    }
  }
  return directories;
}

function loadScripts(repoRoot: string): Set<string> {
  const packageJsonPath = path.join(repoRoot, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return new Set();
  }
  try {
    const parsed = JSON.parse(readText(packageJsonPath));
    if (!parsed || typeof parsed !== "object" || !("scripts" in parsed)) {
      return new Set();
    }
    const scripts = (parsed as { scripts?: unknown }).scripts;
    if (!scripts || typeof scripts !== "object") {
      return new Set();
    }
    return new Set(Object.keys(scripts));
  } catch {
    return new Set();
  }
}

function buildSymbolIndex(repoRoot: string, files: string[]): Map<string, string[]> {
  const symbols = new Map<string, string[]>();
  for (const file of files.filter((candidate) => SOURCE_FILE_RE.test(candidate))) {
    const absolutePath = path.join(repoRoot, file);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    const text = readText(absolutePath, { maxBytes: 256 * 1024 });
    const names = new Set<string>();
    for (const match of text.matchAll(/\b(?:function|class|interface|type|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]{2,80})\b/g)) {
      if (match[1]) {
        names.add(match[1]);
      }
    }
    for (const match of text.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]{2,80})\s*\(/g)) {
      if (match[1]) {
        names.add(match[1]);
      }
    }
    for (const name of names) {
      const existing = symbols.get(name) ?? [];
      if (existing.length < 5) {
        existing.push(file);
      }
      symbols.set(name, existing);
    }
  }
  return symbols;
}

function buildRepositoryIndex(repoRoot: string, repoFiles: string[]): RepositoryIndex {
  return {
    files: new Set(repoFiles),
    directories: buildDirectories(repoFiles),
    scripts: loadScripts(repoRoot),
    symbolFiles: buildSymbolIndex(repoRoot, repoFiles)
  };
}

function pathExists(reference: string, index: RepositoryIndex): boolean {
  return index.files.has(reference) || index.directories.has(reference);
}

export function lintInstructionDrift(
  reports: InternalFileReport[],
  repoFilesByRoot: Map<string, string[]>
): void {
  const indexes = new Map<string, RepositoryIndex>();

  for (const report of reports) {
    if (!report.repoRoot || report.kind === "unsupported" || !appliesToSurface(report, "all")) {
      continue;
    }

    const repoFiles = repoFilesByRoot.get(report.repoRoot);
    if (!repoFiles) {
      continue;
    }

    let index = indexes.get(report.repoRoot);
    if (!index) {
      index = buildRepositoryIndex(report.repoRoot, repoFiles);
      indexes.set(report.repoRoot, index);
    }

    const seen = new Set<string>();
    const backtickReferences = collectBacktickReferences(report);
    for (const reference of backtickReferences) {
      const normalizedPath = normalizeReferencePath(reference.value);
      if (normalizedPath && !pathExists(normalizedPath, index)) {
        addFinding(
          report,
          seen,
          "warning",
          "missing-file-reference",
          `Instruction references ${reference.value}, but no matching repository file or directory was found.`,
          reference.line,
          "Update the instruction to the current path or suppress this finding if the reference is intentional.",
          {
            actual: reference.value,
            expected: "existing repository file or directory"
          },
          {
            confidence: "high"
          }
        );
      }

      if (!isPathReference(reference.value)) {
        for (const symbolReference of collectSymbolReferences(reference)) {
          if (!index.symbolFiles.has(symbolReference.value)) {
            addFinding(
              report,
              seen,
              "warning",
              "missing-symbol-reference",
              `Instruction references ${symbolReference.value}(), but no matching repository symbol was found.`,
              symbolReference.line,
              "Update the instruction to the current symbol or suppress this finding if the reference is intentional.",
              {
                actual: `${symbolReference.value}()`,
                expected: "symbol present in repository source files"
              },
              {
                confidence: "medium"
              }
            );
          }
        }
      }
    }

    for (const command of collectCommandReferences(report)) {
      if (!index.scripts.has(command.value)) {
        addFinding(
          report,
          seen,
          "warning",
          "missing-command-reference",
          `Instruction references package script ${command.value}, but package.json does not define that script.`,
          command.line,
          "Update the command to a defined package script or suppress this finding if another tool provides it.",
          {
            actual: command.value,
            expected: "defined package.json script"
          },
          {
            confidence: "high"
          }
        );
      }
    }
  }
}

export function buildInstructionDriftSummary(
  findings: InstructionFinding[]
): InstructionDriftSummary | undefined {
  const driftFindings = findings.filter((finding) => DRIFT_RULE_IDS.has(finding.ruleId));
  if (driftFindings.length === 0) {
    return undefined;
  }

  const byRule = new Map<string, number>();
  const byConfidence = new Map<string, number>();
  const byFile = new Map<string, number>();
  const referenceCounts = new Map<string, number>();
  const referenceRuleIds = new Map<string, Set<InstructionRuleId>>();
  const referenceFiles = new Map<string, Set<string>>();

  for (const finding of driftFindings) {
    incrementMap(byRule, finding.ruleId);
    incrementMap(byConfidence, finding.confidence ?? "medium");
    incrementMap(byFile, finding.file);

    const reference = findingReferenceValue(finding);
    if (reference) {
      incrementMap(referenceCounts, reference);
      const ruleIds = referenceRuleIds.get(reference) ?? new Set<InstructionRuleId>();
      ruleIds.add(finding.ruleId);
      referenceRuleIds.set(reference, ruleIds);

      const files = referenceFiles.get(reference) ?? new Set<string>();
      files.add(finding.file);
      referenceFiles.set(reference, files);
    }
  }

  return {
    totalFindings: driftFindings.length,
    byRule: topCountEntries(byRule, 10).map((entry) => ({
      ruleId: entry.key as InstructionRuleId,
      count: entry.count
    })),
    byConfidence: CONFIDENCE_ORDER
      .filter((confidence) => byConfidence.has(confidence))
      .map((confidence) => ({
        confidence,
        count: byConfidence.get(confidence) ?? 0
      })),
    files: topCountEntries(byFile, 10).map((entry) => ({
      file: entry.key,
      count: entry.count
    })),
    references: topCountEntries(referenceCounts, 10).map((entry) => ({
      value: entry.key,
      count: entry.count,
      ruleIds: [...(referenceRuleIds.get(entry.key) ?? [])].sort(),
      files: [...(referenceFiles.get(entry.key) ?? [])].sort().slice(0, 10)
    }))
  };
}
