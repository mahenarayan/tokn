import fs from "node:fs";
import path from "node:path";

import { readText } from "../helpers.js";
import { getModelLimit } from "../models.js";
import { estimateTextTokens } from "../tokenizer.js";
import {
  discoverInstructionLintConfigPath,
  loadInstructionLintConfig,
  type NormalizedInstructionSuppression,
  type ResolvedInstructionLintConfig
} from "./config.js";
import {
  COPILOT_CODE_REVIEW_CHAR_LIMIT,
  INSTRUCTION_PROFILE_BUDGETS
} from "./limits.js";
import {
  getInstructionRuleDefaultSeverity,
  INSTRUCTION_LINT_REPORT_SCHEMA_PATH,
  INSTRUCTION_LINT_REPORT_SCHEMA_VERSION,
  isInstructionRuleId
} from "./rules.js";
import type {
  InstructionExcludeAgent,
  InstructionFileKind,
  InstructionFileReport,
  InstructionFinding,
  InstructionFindingEvidence,
  InstructionLintFailOnSeverity,
  InstructionLintAppliedConfig,
  InstructionLintOptions,
  InstructionLintPreset,
  InstructionLintPresetSelector,
  InstructionLintProfile,
  InstructionLintReport,
  InstructionRuleId,
  InstructionRuleOverride,
  InstructionRuleSelector,
  InstructionLintSeverity,
  InstructionLintSurface,
  InstructionSuppression,
  InstructionLintStats
} from "../types.js";

interface CandidateFile {
  absolutePath: string;
  file: string;
  kind: InstructionFileKind;
  preset?: InstructionLintPreset;
  repoRoot?: string;
  scopePath?: string;
}

type MarkdownBlockType = "heading" | "bullet" | "numbered" | "paragraph" | "code";

interface MarkdownBlock {
  type: MarkdownBlockType;
  line: number;
  text: string;
  lines: number;
}

interface ParsedFrontmatter {
  data: Record<string, string>;
  lines: Record<string, number>;
  body: string;
  endLine: number;
  hasFrontmatter: boolean;
  error?: string;
  errorLine?: number;
}

interface Statement {
  text: string;
  line: number;
  sourceType: "bullet" | "numbered" | "paragraph";
  normalized: string;
  tokens: string[];
  tokensSansNegation: string[];
  wordCount: number;
  sentenceCount: number;
  isNegative: boolean;
}

interface InternalFileReport {
  absolutePath: string;
  file: string;
  kind: InstructionFileKind;
  preset?: InstructionLintPreset;
  repoRoot?: string;
  scopePath?: string;
  excludeAgents: InstructionExcludeAgent[];
  excludeAgentsLine?: number;
  appliesToSurface: boolean;
  chars: number;
  words: number;
  estimatedTokens: number;
  applyTo: string[];
  applyToLine?: number;
  blocks: MarkdownBlock[];
  statements: Statement[];
  matchedFiles: string[];
  matchedFileSet: Set<string>;
  findings: InstructionFinding[];
}

interface PostProcessSummary {
  suppressedFindingCount: number;
  baselineMatchedFindingCount: number;
}

interface IgnoreSummary {
  ignoredInstructionFileCount: number;
  ignoredTargetFileCount: number;
}

interface ResolvedLintPolicy {
  config?: ResolvedInstructionLintConfig;
  appliedConfig?: InstructionLintAppliedConfig;
  preset: InstructionLintPresetSelector;
  profile: InstructionLintProfile;
  failOnSeverity: InstructionLintFailOnSeverity;
  surface: InstructionLintSurface;
  model?: string;
  baselinePath?: string;
  ignore: string[];
  suppressions: NormalizedInstructionSuppression[];
  ruleOverrides: Partial<Record<InstructionRuleId, InstructionRuleOverride>>;
}

const DEFAULT_PROFILE: InstructionLintProfile = "standard";
const DEFAULT_FAIL_ON_SEVERITY: InstructionLintFailOnSeverity = "error";
const DEFAULT_SURFACE: InstructionLintSurface = "code-review";
const DEFAULT_PRESET: InstructionLintPresetSelector = "auto";
const MAX_INSTRUCTION_FILE_BYTES = 1024 * 1024;
const MAX_BASELINE_FILE_BYTES = 10 * 1024 * 1024;
const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", ".npm-cache"]);
const FRONTMATTER_DELIMITER = "---";
const NEGATION_WORDS = new Set(["do", "no", "not", "never", "avoid", "dont", "don't", "without"]);
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "if",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "then",
  "this",
  "to",
  "use",
  "when",
  "with",
  "you",
  "your"
]);

const ORDER_DEPENDENT_RE =
  /\b(above|below|earlier rule|later rule|next rule|previous rule|following rule|as described above|mentioned above|see above|see below)\b/i;
const WEAK_MODAL_RE =
  /\b(try to|should consider|best effort|ideally|if possible|where possible|as appropriate)\b/i;
const VAGUE_RE =
  /\b(follow best practices|write clean code|use clean code|write readable code|ensure high quality|do the right thing|be thoughtful)\b/i;
const SCOPED_TOPIC_RE =
  /(\*\*\/|\.[a-z0-9]{1,5}\b|\/[A-Za-z0-9._-]+\/|typescript|javascript|python|ruby|react|frontend|backend|docs\/|tests?\/|tsx|jsx|sql|api|schema)/i;

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function countWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function countSentences(text: string): number {
  const matches = text.match(/[.!?](?:\s|$)/g);
  return matches?.length ?? 1;
}

function compareSeverity(left: InstructionLintSeverity, right: InstructionLintSeverity): number {
  const rank = { warning: 1, error: 2 } as const;
  return rank[left] - rank[right];
}

function findingSort(left: InstructionFinding, right: InstructionFinding): number {
  const severityDiff = compareSeverity(right.severity, left.severity);
  if (severityDiff !== 0) {
    return severityDiff;
  }

  const fileDiff = left.file.localeCompare(right.file);
  if (fileDiff !== 0) {
    return fileDiff;
  }

  const lineDiff = left.line - right.line;
  if (lineDiff !== 0) {
    return lineDiff;
  }

  return left.ruleId.localeCompare(right.ruleId);
}

function normalizeStatementText(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9./_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text: string, { removeNegation = false }: { removeNegation?: boolean } = {}): string[] {
  const tokens = normalizeStatementText(text)
    .split(" ")
    .filter((token) => token.length > 1)
    .filter((token) => !STOP_WORDS.has(token))
    .filter((token) => !(removeNegation && NEGATION_WORDS.has(token)));

  return [...new Set(tokens)];
}

function isNegative(text: string): boolean {
  return /\b(do not|don't|never|avoid|without|no)\b/i.test(text);
}

function jaccardSimilarity(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : intersection / union;
}

function isBlockBoundary(line: string): boolean {
  return (
    line.trim() === "" ||
    /^(```|~~~)/.test(line.trim()) ||
    /^#{1,6}\s+/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line)
  );
}

function walkFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      files.push(...walkFiles(absolutePath));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolutePath);
      continue;
    }
    if (entry.isSymbolicLink()) {
      try {
        if (fs.statSync(absolutePath).isFile()) {
          files.push(absolutePath);
        }
      } catch {
        continue;
      }
    }
  }

  return files;
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function directoryExists(directoryPath: string): boolean {
  return fs.existsSync(directoryPath) && fs.statSync(directoryPath).isDirectory();
}

function inferRepoRootFromDirectory(directoryPath: string): string | undefined {
  let current = path.resolve(directoryPath);
  let fallback: string | undefined;
  while (true) {
    if (
      directoryExists(path.join(current, ".github")) ||
      directoryExists(path.join(current, ".claude")) ||
      directoryExists(path.join(current, ".cursor")) ||
      fileExists(path.join(current, "AGENTS.md")) ||
      fileExists(path.join(current, "CLAUDE.md")) ||
      fileExists(path.join(current, "GEMINI.md")) ||
      fileExists(path.join(current, ".cursorrules"))
    ) {
      return current;
    }
    if (!fallback && fileExists(path.join(current, "package.json"))) {
      fallback = current;
    }
    if (directoryExists(path.join(current, ".git"))) {
      return fallback ?? current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return fallback;
    }
    current = parent;
  }
}

function inferRepoRootFromFile(filePath: string): string | undefined {
  const normalized = path.resolve(filePath);
  let current = path.dirname(normalized);
  let fallback: string | undefined;
  while (true) {
    if (
      directoryExists(path.join(current, ".github")) ||
      directoryExists(path.join(current, ".claude")) ||
      directoryExists(path.join(current, ".cursor")) ||
      fileExists(path.join(current, "AGENTS.md")) ||
      fileExists(path.join(current, "CLAUDE.md")) ||
      fileExists(path.join(current, "GEMINI.md")) ||
      fileExists(path.join(current, ".cursorrules"))
    ) {
      return current;
    }
    if (!fallback && fileExists(path.join(current, "package.json"))) {
      fallback = current;
    }
    if (directoryExists(path.join(current, ".git"))) {
      return fallback ?? current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return fallback;
    }
    current = parent;
  }
}

function displayPath(absolutePath: string, repoRoot?: string): string {
  if (repoRoot) {
    return normalizePath(path.relative(repoRoot, absolutePath));
  }

  const relativeToCwd = path.relative(process.cwd(), absolutePath);
  return relativeToCwd.startsWith("..") ? normalizePath(absolutePath) : normalizePath(relativeToCwd);
}

function matchesAnyGlob(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => path.matchesGlob(filePath, pattern));
}

function pathHasDirectoryPair(filePath: string, parent: string, child: string): boolean {
  const parts = normalizePath(filePath).split("/");
  return parts.some((part, index) => part === parent && parts[index + 1] === child);
}

function knownUnsupportedAgentSurface(filePath: string): string | undefined {
  const normalized = normalizePath(filePath);
  const baseName = normalized.split("/").at(-1) ?? normalized;

  if (
    baseName === "CLAUDE.md" ||
    baseName === "CLAUDE.local.md" ||
    (pathHasDirectoryPair(normalized, ".claude", "rules") && normalized.endsWith(".md"))
  ) {
    return "Claude Code";
  }
  if (baseName === "GEMINI.md") {
    return "Gemini CLI";
  }
  if (
    baseName === ".cursorrules" ||
    (pathHasDirectoryPair(normalized, ".cursor", "rules") && normalized.endsWith(".mdc"))
  ) {
    return "Cursor";
  }

  return undefined;
}

function classifyCandidate(absolutePath: string, repoRoot?: string): CandidateFile {
  const kindRelativePath = repoRoot
    ? normalizePath(path.relative(repoRoot, absolutePath))
    : normalizePath(absolutePath);

  let kind: InstructionFileKind = "unsupported";
  let preset: InstructionLintPreset | undefined;
  let scopePath: string | undefined;
  if (kindRelativePath === ".github/copilot-instructions.md") {
    kind = "repository";
    preset = "copilot";
  } else if (
    kindRelativePath.startsWith(".github/instructions/") &&
    kindRelativePath.endsWith(".instructions.md")
  ) {
    kind = "path-specific";
    preset = "copilot";
  } else if (path.basename(absolutePath) === "AGENTS.md") {
    preset = "agents-md";
    if (!repoRoot) {
      kind = "repository";
    } else {
      const relativeDirectory = normalizePath(path.dirname(kindRelativePath));
      kind = relativeDirectory === "." ? "repository" : "path-specific";
      if (relativeDirectory !== ".") {
        scopePath = relativeDirectory;
      }
    }
  }

  return {
    absolutePath,
    file: displayPath(absolutePath, repoRoot),
    kind,
    ...(preset ? { preset } : {}),
    ...(repoRoot ? { repoRoot } : {}),
    ...(scopePath ? { scopePath } : {})
  };
}

function discoverAgentsCandidates(root: string): CandidateFile[] {
  return walkFiles(root)
    .filter((filePath) => path.basename(filePath) === "AGENTS.md")
    .map((filePath) => classifyCandidate(filePath, root))
    .sort((left, right) => left.file.localeCompare(right.file));
}

function discoverKnownUnsupportedAgentCandidates(root: string): CandidateFile[] {
  return walkFiles(root)
    .filter((filePath) => knownUnsupportedAgentSurface(path.relative(root, filePath)) !== undefined)
    .map((filePath) => classifyCandidate(filePath, root))
    .sort((left, right) => left.file.localeCompare(right.file));
}

function discoverDirectoryCandidates(
  root: string,
  preset: InstructionLintPresetSelector
): CandidateFile[] {
  const candidates: CandidateFile[] = [];
  if (preset === "auto" || preset === "copilot") {
    const repoWidePath = path.join(root, ".github", "copilot-instructions.md");
    if (fileExists(repoWidePath)) {
      candidates.push(classifyCandidate(repoWidePath, root));
    }

    const instructionDirectory = path.join(root, ".github", "instructions");
    if (directoryExists(instructionDirectory)) {
      for (const filePath of walkFiles(instructionDirectory)) {
        candidates.push(classifyCandidate(filePath, root));
      }
    }
  }

  if (preset === "auto" || preset === "agents-md") {
    candidates.push(...discoverAgentsCandidates(root));
  }

  if (preset === "auto") {
    candidates.push(...discoverKnownUnsupportedAgentCandidates(root));
  }

  return candidates.sort((left, right) => left.file.localeCompare(right.file));
}

function parseFrontmatter(rawText: string): ParsedFrontmatter {
  const lines = rawText.split(/\r?\n/);
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    return {
      data: {},
      lines: {},
      body: rawText,
      endLine: 0,
      hasFrontmatter: false
    };
  }

  let closingIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === FRONTMATTER_DELIMITER) {
      closingIndex = index;
      break;
    }
  }

  if (closingIndex === -1) {
    return {
      data: {},
      lines: {},
      body: rawText,
      endLine: 0,
      hasFrontmatter: true,
      error: "Frontmatter is missing a closing --- delimiter.",
      errorLine: 1
    };
  }

  const data: Record<string, string> = {};
  const lineNumbers: Record<string, number> = {};
  for (let index = 1; index < closingIndex; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (!line) {
      continue;
    }
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.+)$/);
    if (!match) {
      return {
        data: {},
        lines: {},
        body: rawText,
        endLine: closingIndex + 1,
        hasFrontmatter: true,
        error: "Frontmatter uses unsupported YAML syntax. Use simple key: value entries.",
        errorLine: index + 1
      };
    }

    const key = match[1];
    const rawValue = match[2];
    if (!key || rawValue === undefined) {
      return {
        data: {},
        lines: {},
        body: rawText,
        endLine: closingIndex + 1,
        hasFrontmatter: true,
        error: "Frontmatter uses unsupported YAML syntax. Use simple key: value entries.",
        errorLine: index + 1
      };
    }

    const value = rawValue.trim().replace(/^["']|["']$/g, "");
    data[key] = value;
    lineNumbers[key] = index + 1;
  }

  return {
    data,
    lines: lineNumbers,
    body: lines.slice(closingIndex + 1).join("\n"),
    endLine: closingIndex + 1,
    hasFrontmatter: true
  };
}

function parseMarkdownBlocks(content: string, lineOffset: number): MarkdownBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const lineNumber = lineOffset + index + 1;

    if (/^(```|~~~)/.test(trimmed)) {
      const fence = trimmed.slice(0, 3);
      let endIndex = index + 1;
      while (endIndex < lines.length && !(lines[endIndex] ?? "").trim().startsWith(fence)) {
        endIndex += 1;
      }
      if (endIndex < lines.length) {
        endIndex += 1;
      }

      const blockLines = lines.slice(index, Math.min(endIndex, lines.length));
      blocks.push({
        type: "code",
        line: lineNumber,
        text: blockLines.join("\n"),
        lines: blockLines.length
      });
      index = Math.max(endIndex, index + 1);
      continue;
    }

    const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        line: lineNumber,
        text: headingMatch[1]?.trim() ?? "",
        lines: 1
      });
      index += 1;
      continue;
    }

    const bulletMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bulletMatch) {
      const parts = [bulletMatch[1]?.trim() ?? ""];
      let endIndex = index + 1;
      while (
        endIndex < lines.length &&
        (lines[endIndex] ?? "").trim() !== "" &&
        !/^(```|~~~)/.test((lines[endIndex] ?? "").trim()) &&
        !/^#{1,6}\s+/.test(lines[endIndex] ?? "") &&
        !/^\s*[-*+]\s+/.test(lines[endIndex] ?? "") &&
        !/^\s*\d+\.\s+/.test(lines[endIndex] ?? "")
      ) {
        parts.push((lines[endIndex] ?? "").trim());
        endIndex += 1;
      }

      blocks.push({
        type: "bullet",
        line: lineNumber,
        text: parts.join(" ").trim(),
        lines: endIndex - index
      });
      index = endIndex;
      continue;
    }

    const numberedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numberedMatch) {
      const parts = [numberedMatch[1]?.trim() ?? ""];
      let endIndex = index + 1;
      while (
        endIndex < lines.length &&
        (lines[endIndex] ?? "").trim() !== "" &&
        !/^(```|~~~)/.test((lines[endIndex] ?? "").trim()) &&
        !/^#{1,6}\s+/.test(lines[endIndex] ?? "") &&
        !/^\s*[-*+]\s+/.test(lines[endIndex] ?? "") &&
        !/^\s*\d+\.\s+/.test(lines[endIndex] ?? "")
      ) {
        parts.push((lines[endIndex] ?? "").trim());
        endIndex += 1;
      }

      blocks.push({
        type: "numbered",
        line: lineNumber,
        text: parts.join(" ").trim(),
        lines: endIndex - index
      });
      index = endIndex;
      continue;
    }

    const paragraphLines = [trimmed];
    let endIndex = index + 1;
    while (endIndex < lines.length && !isBlockBoundary(lines[endIndex] ?? "")) {
      paragraphLines.push((lines[endIndex] ?? "").trim());
      endIndex += 1;
    }

    blocks.push({
      type: "paragraph",
      line: lineNumber,
      text: paragraphLines.join(" ").trim(),
      lines: endIndex - index
    });
    index = endIndex;
  }

  return blocks;
}

function statementFromBlock(block: MarkdownBlock): Statement | undefined {
  if (block.type !== "bullet" && block.type !== "numbered" && block.type !== "paragraph") {
    return undefined;
  }

  return {
    text: block.text,
    line: block.line,
    sourceType: block.type,
    normalized: normalizeStatementText(block.text),
    tokens: tokenSet(block.text),
    tokensSansNegation: tokenSet(block.text, { removeNegation: true }),
    wordCount: countWords(block.text),
    sentenceCount: countSentences(block.text),
    isNegative: isNegative(block.text)
  };
}

function createFinding(
  file: string,
  severity: InstructionLintSeverity,
  ruleId: InstructionRuleId,
  message: string,
  line: number,
  suggestion?: string,
  evidence?: InstructionFindingEvidence
): InstructionFinding {
  return {
    file,
    severity,
    ruleId,
    message,
    line,
    ...(suggestion ? { suggestion } : {}),
    ...(evidence ? { evidence } : {})
  };
}

function addFinding(
  report: InternalFileReport,
  seen: Set<string>,
  severity: InstructionLintSeverity,
  ruleId: InstructionRuleId,
  message: string,
  line: number,
  suggestion?: string,
  evidence?: InstructionFindingEvidence
): void {
  const key = `${severity}|${ruleId}|${report.file}|${line}|${message}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  report.findings.push(createFinding(report.file, severity, ruleId, message, line, suggestion, evidence));
}

function parseApplyTo(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseExcludeAgents(value: string | undefined): {
  excludeAgents: InstructionExcludeAgent[];
  invalidEntries: string[];
} {
  if (!value) {
    return { excludeAgents: [], invalidEntries: [] };
  }

  const excludeAgents: InstructionExcludeAgent[] = [];
  const invalidEntries: string[] = [];
  for (const entry of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    if (entry === "cloud-agent") {
      excludeAgents.push("coding-agent");
      continue;
    }
    if (entry === "code-review" || entry === "coding-agent") {
      excludeAgents.push(entry);
      continue;
    }
    invalidEntries.push(entry);
  }

  return {
    excludeAgents: [...new Set(excludeAgents)],
    invalidEntries
  };
}

function isRepositoryInstruction(report: Pick<InternalFileReport, "kind">): boolean {
  return report.kind === "repository";
}

function isPathSpecificInstruction(report: Pick<InternalFileReport, "kind">): boolean {
  return report.kind === "path-specific";
}

function isCopilotInstruction(report: Pick<InternalFileReport, "preset">): boolean {
  return report.preset === "copilot";
}

function appliesToSurface(
  report: Pick<InternalFileReport, "kind" | "excludeAgents">,
  surface: InstructionLintSurface
): boolean {
  if (report.kind === "unsupported") {
    return false;
  }
  if (surface === "chat") {
    return true;
  }
  return !report.excludeAgents.includes(surface);
}

function lintLocalRules(
  report: InternalFileReport,
  profile: InstructionLintProfile,
  surface: InstructionLintSurface
): void {
  const budgets = INSTRUCTION_PROFILE_BUDGETS[profile];
  const seen = new Set<string>();

  if (report.kind === "unsupported") {
    const knownSurface = knownUnsupportedAgentSurface(report.file);
    if (knownSurface) {
      addFinding(
        report,
        seen,
        "warning",
        "unsupported-agent-surface",
        `${knownSurface} instruction file is present, but Tokn does not lint this agent surface yet.`,
        1,
        "Keep this file visible in rollout reports and lint supported AGENTS.md or Copilot instructions until a dedicated preset exists."
      );
    } else {
      addFinding(
        report,
        seen,
        "error",
        "invalid-file-path",
        "Instruction file path does not match a supported instruction preset location.",
        1,
        "Use .github/copilot-instructions.md, .github/instructions/*.instructions.md, or AGENTS.md."
      );
    }
  }

  if (!report.appliesToSurface) {
    return;
  }

  if (
    isCopilotInstruction(report) &&
    surface === "code-review" &&
    report.chars > COPILOT_CODE_REVIEW_CHAR_LIMIT
  ) {
    addFinding(
      report,
      seen,
      "error",
      "file-char-limit",
      `File is ${report.chars} characters long and exceeds GitHub Copilot code review's ${COPILOT_CODE_REVIEW_CHAR_LIMIT}-character limit.`,
      1,
      `Split the file or reduce repeated wording so the first ${COPILOT_CODE_REVIEW_CHAR_LIMIT} characters contain the full rule set.`,
      {
        actual: report.chars,
        expected: COPILOT_CODE_REVIEW_CHAR_LIMIT,
        surface
      }
    );
  }

  if (isRepositoryInstruction(report) && report.chars > budgets.repositoryChars) {
    addFinding(
      report,
      seen,
      "warning",
      "repository-char-budget",
      `Repository-scoped instructions use ${report.chars} characters and exceed the ${profile} profile budget of ${budgets.repositoryChars}.`,
      1,
      "Keep always-on instructions short and move scoped guidance into narrower instruction files.",
      {
        actual: report.chars,
        expected: budgets.repositoryChars
      }
    );
  }

  if (isRepositoryInstruction(report) && report.estimatedTokens > budgets.repositoryTokens) {
    addFinding(
      report,
      seen,
      "warning",
      "repository-token-budget",
      `Repository-scoped instructions use ${report.estimatedTokens} estimated tokens and exceed the ${profile} profile budget of ${budgets.repositoryTokens}.`,
      1,
      "Keep global guidance dense and move path- or subsystem-specific rules into narrower instruction files.",
      {
        actual: report.estimatedTokens,
        expected: budgets.repositoryTokens
      }
    );
  }

  if (isPathSpecificInstruction(report) && report.chars > budgets.pathSpecificChars) {
    addFinding(
      report,
      seen,
      "warning",
      "path-specific-char-budget",
      `Scoped instructions use ${report.chars} characters and exceed the ${profile} profile budget of ${budgets.pathSpecificChars}.`,
      1,
      "Tighten the file to the rules that truly need to stay always-on for this scope.",
      {
        actual: report.chars,
        expected: budgets.pathSpecificChars
      }
    );
  }

  if (isPathSpecificInstruction(report) && report.estimatedTokens > budgets.pathSpecificTokens) {
    addFinding(
      report,
      seen,
      "warning",
      "path-specific-token-budget",
      `Scoped instructions use ${report.estimatedTokens} estimated tokens and exceed the ${profile} profile budget of ${budgets.pathSpecificTokens}.`,
      1,
      "Trim this file to the rules that are unique to the matched paths.",
      {
        actual: report.estimatedTokens,
        expected: budgets.pathSpecificTokens
      }
    );
  }

  if (report.statements.length > budgets.statements) {
    addFinding(
      report,
      seen,
      "warning",
      "statement-count-budget",
      `File contains ${report.statements.length} instruction statements and exceeds the ${profile} profile budget of ${budgets.statements}.`,
      1,
      "Trim low-signal rules or split scoped topics into separate instruction files.",
      {
        actual: report.statements.length,
        expected: budgets.statements
      }
    );
  }

  for (const statement of report.statements) {
    if (ORDER_DEPENDENT_RE.test(statement.text)) {
      addFinding(
        report,
        seen,
        "error",
        "order-dependent-wording",
        "Instruction relies on relative ordering, but instruction runtimes do not guarantee file order across surfaces and presets.",
        statement.line,
        "Rewrite the instruction so it stands alone without referring to rules above or below."
      );
    }

    if (statement.wordCount > budgets.wordsPerStatement) {
      addFinding(
        report,
        seen,
        "warning",
        "statement-too-long",
        `Instruction statement uses ${statement.wordCount} words and exceeds the ${profile} profile budget of ${budgets.wordsPerStatement}.`,
        statement.line,
        "Rewrite as one short directive with only the necessary why.",
        {
          actual: statement.wordCount,
          expected: budgets.wordsPerStatement
        }
      );
    }

    if (WEAK_MODAL_RE.test(statement.text)) {
      addFinding(
        report,
        seen,
        "warning",
        "weak-modal-phrasing",
        "Instruction uses weak modal phrasing that is easy for assistants to ignore or interpret loosely.",
        statement.line,
        "Use direct imperative wording instead of try to, should consider, or best effort language."
      );
    }

    if (VAGUE_RE.test(statement.text)) {
      addFinding(
        report,
        seen,
        "warning",
        "vague-instruction",
        "Instruction is too generic to add repository-specific value.",
        statement.line,
        "Replace generic quality advice with concrete repository rules, preferred tools, or explicit examples."
      );
    }

    if (statement.sourceType === "paragraph" && (statement.sentenceCount >= 2 || statement.wordCount >= 24)) {
      addFinding(
        report,
        seen,
        "warning",
        "paragraph-narrative",
        "Paragraph-style narrative is harder for instruction runtimes to scan than short atomic directives.",
        statement.line,
        "Break this paragraph into short bullet rules."
      );
    }
  }

  for (const block of report.blocks.filter((candidate) => candidate.type === "code")) {
    const codeWords = countWords(block.text);
    if (block.lines > 12 || block.text.length > 500 || codeWords > 120) {
      addFinding(
        report,
        seen,
        "warning",
        "oversized-code-example",
        "Code example is large enough to crowd out higher-signal instruction text.",
        block.line,
        "Keep examples minimal and only show the pattern that Copilot must prefer or avoid."
      );
    }
  }

  if (isRepositoryInstruction(report)) {
    const scopedStatements = report.statements.filter((statement) => SCOPED_TOPIC_RE.test(statement.text));
    if (scopedStatements.length >= 3 && report.statements.length >= 6) {
      addFinding(
        report,
        seen,
        "warning",
        "repo-wide-scoped-topics",
        "Repository-scoped instructions mix in multiple scoped topics that likely belong in narrower instruction files.",
        scopedStatements[0]?.line ?? 1,
        "Move language-, path-, or subsystem-specific rules into narrower scoped instruction files."
      );
    }
  }
}

function resolveMatchedFiles(report: InternalFileReport, repoFiles: string[]): string[] {
  if (isRepositoryInstruction(report)) {
    return [...repoFiles];
  }

  if (!isPathSpecificInstruction(report)) {
    return [];
  }

  if (isCopilotInstruction(report)) {
    if (report.applyTo.length === 0) {
      return [];
    }
    return repoFiles.filter((filePath) =>
      report.applyTo.some((pattern) => path.matchesGlob(filePath, pattern))
    );
  }

  if (report.preset === "agents-md") {
    if (!report.scopePath) {
      return [...repoFiles];
    }
    const scopePrefix = `${report.scopePath}/`;
    return repoFiles.filter((filePath) => filePath.startsWith(scopePrefix));
  }

  return [];
}

function overlapExists(left: InternalFileReport, right: InternalFileReport): boolean {
  if (left.matchedFileSet.size === 0 || right.matchedFileSet.size === 0) {
    return false;
  }

  const smaller = left.matchedFileSet.size <= right.matchedFileSet.size ? left.matchedFileSet : right.matchedFileSet;
  const larger = smaller === left.matchedFileSet ? right.matchedFileSet : left.matchedFileSet;

  for (const filePath of smaller) {
    if (larger.has(filePath)) {
      return true;
    }
  }

  return false;
}

function sampleItems(items: string[], limit = 3): string[] {
  return items.slice(0, limit);
}

function overlapDetails(
  left: InternalFileReport,
  right: InternalFileReport,
  limit = 3
): { count: number; sample: string[] } {
  if (left.matchedFileSet.size === 0 || right.matchedFileSet.size === 0) {
    return { count: 0, sample: [] };
  }

  const smaller = left.matchedFileSet.size <= right.matchedFileSet.size ? left.matchedFileSet : right.matchedFileSet;
  const larger = smaller === left.matchedFileSet ? right.matchedFileSet : left.matchedFileSet;
  const sample: string[] = [];
  let count = 0;

  for (const filePath of smaller) {
    if (!larger.has(filePath)) {
      continue;
    }
    count += 1;
    if (sample.length < limit) {
      sample.push(filePath);
    }
  }

  return { count, sample };
}

function addCrossFileFinding(
  reportsByPath: Map<string, InternalFileReport>,
  seen: Set<string>,
  hostFile: string,
  severity: InstructionLintSeverity,
  ruleId: InstructionRuleId,
  line: number,
  message: string,
  suggestion?: string,
  evidence?: InstructionFindingEvidence
): void {
  const report = reportsByPath.get(hostFile);
  if (!report) {
    return;
  }

  const key = `${ruleId}|${hostFile}|${line}|${message}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  report.findings.push(createFinding(report.file, severity, ruleId, message, line, suggestion, evidence));
}

function lintCrossFileRules(reports: InternalFileReport[]): void {
  const grouped = new Map<string, InternalFileReport[]>();
  for (const report of reports) {
    if (!report.repoRoot) {
      continue;
    }
    const existing = grouped.get(report.repoRoot) ?? [];
    existing.push(report);
    grouped.set(report.repoRoot, existing);
  }

  for (const group of grouped.values()) {
    const eligible = group
      .filter(
        (report) =>
          report.kind !== "unsupported" &&
          report.appliesToSurface &&
          report.statements.length > 0
      )
      .sort((left, right) => left.file.localeCompare(right.file));
    const reportsByPath = new Map(eligible.map((report) => [report.absolutePath, report]));
    const seen = new Set<string>();

    for (let leftIndex = 0; leftIndex < eligible.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < eligible.length; rightIndex += 1) {
        const left = eligible[leftIndex];
        const right = eligible[rightIndex];
        if (!left || !right || !overlapExists(left, right)) {
          continue;
        }
        const overlap = overlapDetails(left, right);

        for (const leftStatement of left.statements) {
          for (const rightStatement of right.statements) {
            if (!leftStatement.normalized || !rightStatement.normalized) {
              continue;
            }

            if (leftStatement.normalized === rightStatement.normalized) {
              addCrossFileFinding(
                reportsByPath,
                seen,
                left.absolutePath,
                "warning",
                "exact-duplicate-statement",
                leftStatement.line,
                `Instruction duplicates ${right.file}:${rightStatement.line} across overlapping scope.`,
                "Keep the rule in one file or narrow applyTo so the same instruction is not sent twice.",
                {
                  relatedLocation: {
                    file: right.file,
                    line: rightStatement.line
                  },
                  overlapFileCount: overlap.count,
                  ...(overlap.sample.length > 0 ? { overlapFilesSample: overlap.sample } : {}),
                  similarityScore: 1
                }
              );
              continue;
            }

            const conflictSimilarity = jaccardSimilarity(
              leftStatement.tokensSansNegation,
              rightStatement.tokensSansNegation
            );
            if (
              leftStatement.isNegative !== rightStatement.isNegative &&
              leftStatement.tokensSansNegation.length >= 3 &&
              rightStatement.tokensSansNegation.length >= 3 &&
              conflictSimilarity >= 0.78
            ) {
              addCrossFileFinding(
                reportsByPath,
                seen,
                left.absolutePath,
                "warning",
                "possible-conflict",
                leftStatement.line,
                `Instruction may conflict with ${right.file}:${rightStatement.line} because overlapping files express opposite polarity for the same subject.`,
                "Consolidate the rule or make the scope separation explicit.",
                {
                  relatedLocation: {
                    file: right.file,
                    line: rightStatement.line
                  },
                  overlapFileCount: overlap.count,
                  ...(overlap.sample.length > 0 ? { overlapFilesSample: overlap.sample } : {}),
                  similarityScore: conflictSimilarity
                }
              );
              continue;
            }

            const similarity = jaccardSimilarity(leftStatement.tokens, rightStatement.tokens);
            if (
              leftStatement.tokens.length >= 3 &&
              rightStatement.tokens.length >= 3 &&
              similarity >= 0.82
            ) {
              addCrossFileFinding(
                reportsByPath,
                seen,
                left.absolutePath,
                "warning",
                "high-similarity-statement",
                leftStatement.line,
                `Instruction is highly similar to ${right.file}:${rightStatement.line} across overlapping scope.`,
                "Merge the rules or remove the lower-signal variant.",
                {
                  relatedLocation: {
                    file: right.file,
                    line: rightStatement.line
                  },
                  overlapFileCount: overlap.count,
                  ...(overlap.sample.length > 0 ? { overlapFilesSample: overlap.sample } : {}),
                  similarityScore: similarity
                }
              );
            }
          }
        }
      }
    }
  }
}

function addApplicableTokenBudgetFindings(
  reports: InternalFileReport[],
  repoFilesByRoot: Map<string, string[]>,
  profile: InstructionLintProfile,
  surface: InstructionLintSurface
): { maxApplicableTokens: number; maxApplicableTargetFile?: string } {
  const budgets = INSTRUCTION_PROFILE_BUDGETS[profile];
  const grouped = new Map<string, InternalFileReport[]>();

  for (const report of reports) {
    if (!report.repoRoot) {
      continue;
    }
    const existing = grouped.get(report.repoRoot) ?? [];
    existing.push(report);
    grouped.set(report.repoRoot, existing);
  }

  let overallMaxTokens = 0;
  let overallTargetFile: string | undefined;

  for (const [repoRoot, group] of grouped.entries()) {
    const repoFiles = repoFilesByRoot.get(repoRoot) ?? [];
    if (repoFiles.length === 0) {
      continue;
    }

    const eligible = group.filter(
      (report) => report.kind !== "unsupported" && report.appliesToSurface
    );
    if (eligible.length === 0) {
      continue;
    }

    let maxTokens = 0;
    let targetFile: string | undefined;
    let contributors: InternalFileReport[] = [];

    for (const repoFile of repoFiles) {
      const matched = eligible.filter((report) => report.matchedFileSet.has(repoFile));
      if (matched.length === 0) {
        continue;
      }

      const totalTokens = matched.reduce((sum, report) => sum + report.estimatedTokens, 0);
      if (totalTokens > maxTokens) {
        maxTokens = totalTokens;
        targetFile = repoFile;
        contributors = matched;
      }
    }

    if (maxTokens > overallMaxTokens) {
      overallMaxTokens = maxTokens;
      overallTargetFile = targetFile;
    }

    if (maxTokens <= budgets.maxApplicableTokens || !targetFile || contributors.length === 0) {
      continue;
    }

    const hostReport = contributors
      .slice()
      .sort((left, right) => {
        if (left.kind !== right.kind) {
          return left.kind === "repository" ? -1 : 1;
        }
        if (left.estimatedTokens !== right.estimatedTokens) {
          return right.estimatedTokens - left.estimatedTokens;
        }
        return left.file.localeCompare(right.file);
      })[0];

    if (!hostReport) {
      continue;
    }

    hostReport.findings.push(
      createFinding(
        hostReport.file,
        "warning",
        "applicable-token-budget",
        `Instructions applicable to ${targetFile} total ${maxTokens} estimated tokens for ${surface} and exceed the ${profile} profile budget of ${budgets.maxApplicableTokens}.`,
        1,
        "Reduce overlap, shorten always-on guidance, or narrow the scoped files so no single target pulls in a large instruction bundle.",
        {
          actual: maxTokens,
          expected: budgets.maxApplicableTokens,
          surface,
          targetFile,
          contributorFiles: sampleItems(
            contributors
              .map((report) => report.file)
              .sort((left, right) => left.localeCompare(right))
          )
        }
      )
    );
  }

  return {
    maxApplicableTokens: overallMaxTokens,
    ...(overallTargetFile ? { maxApplicableTargetFile: overallTargetFile } : {})
  };
}

function buildStats(
  files: InstructionFileReport[],
  findings: InstructionFinding[],
  summary: { maxApplicableTokens: number; maxApplicableTargetFile?: string },
  ignoreSummary: IgnoreSummary,
  postProcessSummary: PostProcessSummary
): InstructionLintStats {
  return {
    totalFiles: files.length,
    repositoryFiles: files.filter((file) => file.kind === "repository").length,
    pathSpecificFiles: files.filter((file) => file.kind === "path-specific").length,
    unsupportedFiles: files.filter((file) => file.kind === "unsupported").length,
    totalStatements: files.reduce((sum, file) => sum + file.statementCount, 0),
    applicableStatements: files
      .filter((file) => file.appliesToSurface)
      .reduce((sum, file) => sum + file.statementCount, 0),
    totalChars: files.reduce((sum, file) => sum + file.chars, 0),
    totalEstimatedTokens: files.reduce((sum, file) => sum + file.estimatedTokens, 0),
    applicableFiles: files.filter((file) => file.appliesToSurface).length,
    applicableEstimatedTokens: files
      .filter((file) => file.appliesToSurface)
      .reduce((sum, file) => sum + file.estimatedTokens, 0),
    totalMatchedFiles: files.reduce((sum, file) => sum + (file.matchedFileCount ?? 0), 0),
    maxApplicableTokens: summary.maxApplicableTokens,
    ...(summary.maxApplicableTargetFile
      ? { maxApplicableTargetFile: summary.maxApplicableTargetFile }
      : {}),
    ignoredInstructionFileCount: ignoreSummary.ignoredInstructionFileCount,
    ignoredTargetFileCount: ignoreSummary.ignoredTargetFileCount,
    suppressedFindingCount: postProcessSummary.suppressedFindingCount,
    baselineMatchedFindingCount: postProcessSummary.baselineMatchedFindingCount,
    warningCount: findings.filter((finding) => finding.severity === "warning").length,
    errorCount: findings.filter((finding) => finding.severity === "error").length
  };
}

function isSeverityFailing(
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

function resolveLintPolicy(
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

  const suppressions = [
    ...(loadedConfig?.suppressions ?? []),
    ...normalizeOptionSuppressions(options.suppressions)
  ];

  const baselinePath = options.baseline
    ? path.resolve(options.baseline)
    : loadedConfig?.baselinePath;
  const model = options.model ?? loadedConfig?.model;

  const appliedConfig =
    loadedConfig || baselinePath || ignore.length > 0 || suppressions.length > 0 || Object.keys(ruleOverrides).length > 0
      ? {
          ...(loadedConfig ? { source: displayPath(loadedConfig.sourcePath) } : {}),
          ...(baselinePath ? { baselinePath: displayPath(baselinePath) } : {}),
          ignore,
          suppressionCount: suppressions.length,
          overriddenRules: Object.keys(ruleOverrides)
            .filter((ruleId): ruleId is InstructionRuleId => isInstructionRuleId(ruleId))
            .sort((left, right) => left.localeCompare(right)),
          ...(loadedConfig?.rollout ? { rollout: loadedConfig.rollout } : {})
        }
      : undefined;

  return {
    ...(loadedConfig ? { config: loadedConfig } : {}),
    ...(appliedConfig ? { appliedConfig } : {}),
    preset: options.preset ?? loadedConfig?.preset ?? DEFAULT_PRESET,
    profile: options.profile ?? loadedConfig?.profile ?? DEFAULT_PROFILE,
    failOnSeverity:
      options.failOnSeverity ?? loadedConfig?.failOnSeverity ?? DEFAULT_FAIL_ON_SEVERITY,
    surface: options.surface ?? loadedConfig?.surface ?? DEFAULT_SURFACE,
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

function postProcessFindings(
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

export function lintInstructions(
  pathOrFiles: string | string[],
  options: InstructionLintOptions = {}
): InstructionLintReport {
  const inputs = Array.isArray(pathOrFiles) ? pathOrFiles : [pathOrFiles];
  const policy = resolveLintPolicy(inputs, options);
  const preset = policy.preset;
  const profile = policy.profile;
  const failOnSeverity = policy.failOnSeverity;
  const surface = policy.surface;
  const model = policy.model;
  const modelLimit = getModelLimit(model);
  const candidates: CandidateFile[] = [];
  const warnings = new Set<string>();
  const repoFilesByRoot = new Map<string, string[]>();
  const ignoreSummary: IgnoreSummary = {
    ignoredInstructionFileCount: 0,
    ignoredTargetFileCount: 0
  };

  if (model && !modelLimit) {
    warnings.add(`Model limits are unknown for ${model}; context-window share metrics are unavailable.`);
  }

  for (const input of inputs) {
    const absoluteInput = path.resolve(input);
    if (!fs.existsSync(absoluteInput)) {
      throw new Error(`Input path does not exist: ${input}`);
    }

    const stat = fs.statSync(absoluteInput);
    if (stat.isDirectory()) {
      const discovered = discoverDirectoryCandidates(absoluteInput, preset);
      const visibleCandidates = discovered.filter((candidate) => !matchesAnyGlob(candidate.file, policy.ignore));
      ignoreSummary.ignoredInstructionFileCount += discovered.length - visibleCandidates.length;
      if (visibleCandidates.length === 0) {
        const message =
          preset === "auto"
            ? `No supported instruction files were found under ${normalizePath(input)}.`
            : `No ${preset} instruction files were found under ${normalizePath(input)}.`;
        warnings.add(message);
      }
      candidates.push(...visibleCandidates);
      if (!repoFilesByRoot.has(absoluteInput)) {
        const repoFiles = walkFiles(absoluteInput).map((filePath) =>
          normalizePath(path.relative(absoluteInput, filePath))
        );
        const visibleRepoFiles = repoFiles.filter((filePath) => !matchesAnyGlob(filePath, policy.ignore));
        ignoreSummary.ignoredTargetFileCount += repoFiles.length - visibleRepoFiles.length;
        repoFilesByRoot.set(absoluteInput, visibleRepoFiles);
      }
      continue;
    }

    if (!stat.isFile()) {
      throw new Error(`Input path is not a file or directory: ${input}`);
    }

    const repoRoot = inferRepoRootFromFile(absoluteInput);
    const candidate = classifyCandidate(absoluteInput, repoRoot);
    if (preset === "auto" || candidate.preset === preset) {
      if (matchesAnyGlob(candidate.file, policy.ignore)) {
        ignoreSummary.ignoredInstructionFileCount += 1;
      } else {
        candidates.push(candidate);
      }
    } else {
      const unsupportedCandidate = {
        ...candidate,
        kind: "unsupported" as const
      };
      if (matchesAnyGlob(unsupportedCandidate.file, policy.ignore)) {
        ignoreSummary.ignoredInstructionFileCount += 1;
      } else {
        candidates.push(unsupportedCandidate);
      }
    }
    if (repoRoot && !repoFilesByRoot.has(repoRoot)) {
      const repoFiles = walkFiles(repoRoot).map((filePath) =>
        normalizePath(path.relative(repoRoot, filePath))
      );
      const visibleRepoFiles = repoFiles.filter((filePath) => !matchesAnyGlob(filePath, policy.ignore));
      ignoreSummary.ignoredTargetFileCount += repoFiles.length - visibleRepoFiles.length;
      repoFilesByRoot.set(repoRoot, visibleRepoFiles);
    }
    if (!repoRoot) {
      warnings.add(`Repository root could not be inferred for ${normalizePath(input)}; overlap resolution is limited.`);
    }
  }

  const internalReports: InternalFileReport[] = [];
  for (const candidate of candidates.sort((left, right) => left.file.localeCompare(right.file))) {
    const rawText = readText(candidate.absolutePath, { maxBytes: MAX_INSTRUCTION_FILE_BYTES });
    const frontmatter =
      candidate.preset === "copilot" && candidate.kind === "path-specific"
      ? parseFrontmatter(rawText)
      : {
          data: {},
          lines: {},
          body: rawText,
          endLine: 0,
          hasFrontmatter: false
        };

    const blocks = parseMarkdownBlocks(frontmatter.body, frontmatter.endLine);
    const statements = blocks
      .map((block) => statementFromBlock(block))
      .filter((statement): statement is Statement => statement !== undefined);

    const report: InternalFileReport = {
      absolutePath: candidate.absolutePath,
      file: candidate.file,
      kind: candidate.kind,
      ...(candidate.preset ? { preset: candidate.preset } : {}),
      ...(candidate.repoRoot ? { repoRoot: candidate.repoRoot } : {}),
      ...(candidate.scopePath ? { scopePath: candidate.scopePath } : {}),
      excludeAgents: [],
      appliesToSurface: candidate.kind !== "unsupported",
      chars: rawText.length,
      words: countWords(rawText),
      estimatedTokens: estimateTextTokens(rawText),
      applyTo: [],
      blocks,
      statements,
      matchedFiles: [],
      matchedFileSet: new Set<string>(),
      findings: []
    };

    if (candidate.preset === "copilot" && candidate.kind === "path-specific") {
      if (frontmatter.error) {
        report.findings.push(
          createFinding(
            report.file,
            "error",
            "malformed-frontmatter",
            frontmatter.error,
            frontmatter.errorLine ?? 1,
            "Use simple YAML frontmatter with applyTo: \"glob\"."
          )
        );
      } else if (!frontmatter.hasFrontmatter) {
        report.findings.push(
          createFinding(
            report.file,
            "error",
            "missing-frontmatter",
            "Path-specific instruction files must start with YAML frontmatter containing applyTo.",
            1,
            "Add frontmatter like --- applyTo: \"**/*.ts\" --- at the top of the file."
          )
        );
      } else {
        report.applyTo = parseApplyTo(frontmatter.data.applyTo);
        report.applyToLine = frontmatter.lines.applyTo ?? 2;
        if (report.applyTo.length === 0) {
          report.findings.push(
            createFinding(
              report.file,
              "error",
              "missing-applyto",
              "Path-specific instruction file is missing a valid applyTo value.",
              report.applyToLine,
              "Set applyTo to one or more comma-separated glob patterns."
            )
          );
        }

        const excludeAgent = parseExcludeAgents(frontmatter.data.excludeAgent);
        report.excludeAgents = excludeAgent.excludeAgents;
        if (frontmatter.lines.excludeAgent !== undefined) {
          report.excludeAgentsLine = frontmatter.lines.excludeAgent;
        }
        if (excludeAgent.invalidEntries.length > 0) {
          report.findings.push(
            createFinding(
              report.file,
              "error",
              "invalid-exclude-agent",
              `excludeAgent contains unsupported value(s): ${excludeAgent.invalidEntries.join(", ")}.`,
              report.excludeAgentsLine ?? 1,
              'Use "code-review" or "cloud-agent".'
            )
          );
        }
      }
    }

    report.appliesToSurface = appliesToSurface(report, surface);
    lintLocalRules(report, profile, surface);
    internalReports.push(report);
  }

  const repoWideRoots = new Set(
    internalReports
      .filter((report) => report.preset === "copilot" && report.kind === "repository" && report.repoRoot)
      .map((report) => report.repoRoot as string)
  );

  for (const report of internalReports) {
    const repoFiles = report.repoRoot ? repoFilesByRoot.get(report.repoRoot) ?? [] : [];
    report.matchedFiles = resolveMatchedFiles(report, repoFiles);
    report.matchedFileSet = new Set(report.matchedFiles);

    if (
      report.preset === "copilot" &&
      report.kind === "path-specific" &&
      report.applyTo.some((pattern) => pattern === "**" || pattern === "**/*") &&
      report.repoRoot &&
      repoWideRoots.has(report.repoRoot)
    ) {
      report.findings.push(
        createFinding(
          report.file,
          "error",
          "global-applyto-overlap",
          "Path-specific instruction file uses applyTo: \"**\" even though a repository-wide copilot-instructions.md file already exists.",
          report.applyToLine ?? 1,
          "Keep repository-wide guidance in .github/copilot-instructions.md and narrow applyTo to a real subset.",
          {
            relatedLocation: {
              file: ".github/copilot-instructions.md",
              line: 1
            },
            patterns: report.applyTo,
            matchedFileCount: report.matchedFiles.length,
            ...(report.matchedFiles.length > 0
              ? { matchedFilesSample: sampleItems(report.matchedFiles) }
              : {})
          }
        )
      );
    }

    if (
      report.preset === "copilot" &&
      report.kind === "path-specific" &&
      report.applyTo.length > 0 &&
      report.matchedFiles.length === 0
    ) {
      const warning =
        `${report.file} applyTo patterns do not match any repository files.`;
      warnings.add(warning);
      report.findings.push(
        createFinding(
          report.file,
          "warning",
          "stale-applyto",
          "applyTo patterns do not match any repository files.",
          report.applyToLine ?? 1,
          "Update the glob patterns or delete the file if the scope no longer exists.",
          {
            patterns: report.applyTo,
            matchedFileCount: 0
          }
        )
      );
    }
  }

  lintCrossFileRules(internalReports);
  const applicableTokenSummary = addApplicableTokenBudgetFindings(
    internalReports,
    repoFilesByRoot,
    profile,
    surface
  );
  const postProcessSummary = postProcessFindings(internalReports, policy);

  const files: InstructionFileReport[] = internalReports
    .sort((left, right) => left.file.localeCompare(right.file))
    .map((report) => ({
      file: report.file,
      kind: report.kind,
      ...(report.preset ? { preset: report.preset } : {}),
      ...(report.applyTo.length > 0 ? { applyTo: report.applyTo } : {}),
      ...(report.scopePath ? { scopePath: report.scopePath } : {}),
      ...(report.excludeAgents.length > 0 ? { excludeAgents: report.excludeAgents } : {}),
      appliesToSurface: report.appliesToSurface,
      chars: report.chars,
      words: report.words,
      estimatedTokens: report.estimatedTokens,
      statementCount: report.statements.length,
      ...(report.kind !== "unsupported" ? { matchedFileCount: report.matchedFiles.length } : {}),
      findings: [...report.findings].sort(findingSort)
    }));

  const findings = files
    .flatMap((file) => file.findings)
    .sort(findingSort);
  const stats = buildStats(files, findings, applicableTokenSummary, ignoreSummary, postProcessSummary);
  const passed = findings.every((finding) => !isSeverityFailing(finding, failOnSeverity));
  const detectedPresets = [...new Set(files.flatMap((file) => (file.preset ? [file.preset] : [])))].sort();

  return {
    kind: "instructions-lint-report",
    schemaVersion: INSTRUCTION_LINT_REPORT_SCHEMA_VERSION,
    schemaPath: INSTRUCTION_LINT_REPORT_SCHEMA_PATH,
    preset,
    detectedPresets,
    profile,
    surface,
    ...(model ? { model } : {}),
    ...(modelLimit ? { contextWindow: modelLimit.contextWindow } : {}),
    ...(modelLimit && stats.maxApplicableTokens > 0
      ? {
          maxApplicableContextPercent:
            (stats.maxApplicableTokens / modelLimit.contextWindow) * 100
        }
      : {}),
    passed,
    exitCode: passed ? 0 : 2,
    failOnSeverity,
    ...(policy.appliedConfig ? { config: policy.appliedConfig } : {}),
    stats,
    files,
    findings,
    warnings: [...warnings].sort((left, right) => left.localeCompare(right))
  };
}
