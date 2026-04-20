import fs from "node:fs";
import path from "node:path";

import { getModelLimit } from "../models.js";
import { estimateTextTokens } from "../tokenizer.js";
import type {
  InstructionExcludeAgent,
  InstructionFileKind,
  InstructionFileReport,
  InstructionFinding,
  InstructionFindingEvidence,
  InstructionLintOptions,
  InstructionLintProfile,
  InstructionLintReport,
  InstructionLintSeverity,
  InstructionLintSurface,
  InstructionLintStats
} from "../types.js";

interface CandidateFile {
  absolutePath: string;
  file: string;
  kind: InstructionFileKind;
  repoRoot?: string;
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
  repoRoot?: string;
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

interface InstructionBudgets {
  repositoryChars: number;
  pathSpecificChars: number;
  repositoryTokens: number;
  pathSpecificTokens: number;
  maxApplicableTokens: number;
  statements: number;
  wordsPerStatement: number;
}

const DEFAULT_PROFILE: InstructionLintProfile = "standard";
const DEFAULT_FAIL_ON_SEVERITY: InstructionLintSeverity = "error";
const DEFAULT_SURFACE: InstructionLintSurface = "code-review";

const PROFILE_BUDGETS: Record<InstructionLintProfile, InstructionBudgets> = {
  lite: {
    repositoryChars: 2500,
    pathSpecificChars: 1500,
    repositoryTokens: 600,
    pathSpecificTokens: 375,
    maxApplicableTokens: 900,
    statements: 20,
    wordsPerStatement: 50
  },
  standard: {
    repositoryChars: 1500,
    pathSpecificChars: 900,
    repositoryTokens: 375,
    pathSpecificTokens: 225,
    maxApplicableTokens: 600,
    statements: 12,
    wordsPerStatement: 30
  },
  strict: {
    repositoryChars: 900,
    pathSpecificChars: 600,
    repositoryTokens: 225,
    pathSpecificTokens: 150,
    maxApplicableTokens: 350,
    statements: 8,
    wordsPerStatement: 20
  }
};

const CODE_REVIEW_CHAR_LIMIT = 4000;
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
    }
  }

  return files;
}

function inferRepoRootFromFile(filePath: string): string | undefined {
  const normalized = path.resolve(filePath);
  let current = path.dirname(normalized);
  while (true) {
    const candidate = path.join(current, ".github");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
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

function classifyCandidate(absolutePath: string, repoRoot?: string): CandidateFile {
  const kindRelativePath = repoRoot
    ? normalizePath(path.relative(repoRoot, absolutePath))
    : normalizePath(absolutePath);

  let kind: InstructionFileKind = "unsupported";
  if (kindRelativePath === ".github/copilot-instructions.md") {
    kind = "copilot-repository";
  } else if (
    kindRelativePath.startsWith(".github/instructions/") &&
    kindRelativePath.endsWith(".instructions.md")
  ) {
    kind = "copilot-path-specific";
  }

  return {
    absolutePath,
    file: displayPath(absolutePath, repoRoot),
    kind,
    ...(repoRoot ? { repoRoot } : {})
  };
}

function discoverDirectoryCandidates(root: string): CandidateFile[] {
  const candidates: CandidateFile[] = [];
  const repoWidePath = path.join(root, ".github", "copilot-instructions.md");
  if (fs.existsSync(repoWidePath) && fs.statSync(repoWidePath).isFile()) {
    candidates.push(classifyCandidate(repoWidePath, root));
  }

  const instructionDirectory = path.join(root, ".github", "instructions");
  if (fs.existsSync(instructionDirectory) && fs.statSync(instructionDirectory).isDirectory()) {
    for (const filePath of walkFiles(instructionDirectory)) {
      candidates.push(classifyCandidate(filePath, root));
    }
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
  ruleId: string,
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
  ruleId: string,
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
  const budgets = PROFILE_BUDGETS[profile];
  const seen = new Set<string>();

  if (report.kind === "unsupported") {
    addFinding(
      report,
      seen,
      "error",
      "invalid-file-path",
      "Instruction file path is not a supported GitHub Copilot instructions location.",
      1,
      "Use .github/copilot-instructions.md for repository-wide rules or .github/instructions/*.instructions.md for path-specific rules."
    );
  }

  if (!report.appliesToSurface) {
    return;
  }

  if (surface === "code-review" && report.chars > CODE_REVIEW_CHAR_LIMIT) {
    addFinding(
      report,
      seen,
      "error",
      "file-char-limit",
      `File is ${report.chars} characters long and exceeds GitHub Copilot code review's 4000-character limit.`,
      1,
      "Split the file or reduce repeated wording so the first 4000 characters contain the full rule set.",
      {
        actual: report.chars,
        expected: CODE_REVIEW_CHAR_LIMIT,
        surface
      }
    );
  }

  if (report.kind === "copilot-repository" && report.chars > budgets.repositoryChars) {
    addFinding(
      report,
      seen,
      "warning",
      "repository-char-budget",
      `Repository-wide instructions use ${report.chars} characters and exceed the ${profile} profile budget of ${budgets.repositoryChars}.`,
      1,
      "Keep always-on instructions short and move scoped guidance into path-specific files.",
      {
        actual: report.chars,
        expected: budgets.repositoryChars
      }
    );
  }

  if (report.kind === "copilot-repository" && report.estimatedTokens > budgets.repositoryTokens) {
    addFinding(
      report,
      seen,
      "warning",
      "repository-token-budget",
      `Repository-wide instructions use ${report.estimatedTokens} estimated tokens and exceed the ${profile} profile budget of ${budgets.repositoryTokens}.`,
      1,
      "Keep global guidance dense and move path- or language-specific rules into narrower instruction files.",
      {
        actual: report.estimatedTokens,
        expected: budgets.repositoryTokens
      }
    );
  }

  if (report.kind === "copilot-path-specific" && report.chars > budgets.pathSpecificChars) {
    addFinding(
      report,
      seen,
      "warning",
      "path-specific-char-budget",
      `Path-specific instructions use ${report.chars} characters and exceed the ${profile} profile budget of ${budgets.pathSpecificChars}.`,
      1,
      "Tighten the file to the rules that truly need to stay always-on for this scope.",
      {
        actual: report.chars,
        expected: budgets.pathSpecificChars
      }
    );
  }

  if (report.kind === "copilot-path-specific" && report.estimatedTokens > budgets.pathSpecificTokens) {
    addFinding(
      report,
      seen,
      "warning",
      "path-specific-token-budget",
      `Path-specific instructions use ${report.estimatedTokens} estimated tokens and exceed the ${profile} profile budget of ${budgets.pathSpecificTokens}.`,
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
        "Instruction relies on relative ordering, but Copilot does not guarantee instruction-file order across all surfaces.",
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
        "Instruction uses weak modal phrasing that is easy for Copilot to ignore or interpret loosely.",
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
        "Paragraph-style narrative is harder for Copilot to scan than short atomic directives.",
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

  if (report.kind === "copilot-repository") {
    const scopedStatements = report.statements.filter((statement) => SCOPED_TOPIC_RE.test(statement.text));
    if (scopedStatements.length >= 3 && report.statements.length >= 6) {
      addFinding(
        report,
        seen,
        "warning",
        "repo-wide-scoped-topics",
        "Repository-wide instructions mix in multiple scoped topics that likely belong in path-specific instruction files.",
        scopedStatements[0]?.line ?? 1,
        "Move language-, path-, or subsystem-specific rules into .github/instructions/*.instructions.md files."
      );
    }
  }
}

function resolveMatchedFiles(report: InternalFileReport, repoFiles: string[]): string[] {
  if (report.kind === "copilot-repository") {
    return [...repoFiles];
  }

  if (report.kind !== "copilot-path-specific" || report.applyTo.length === 0) {
    return [];
  }

  return repoFiles.filter((filePath) =>
    report.applyTo.some((pattern) => path.matchesGlob(filePath, pattern))
  );
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
  ruleId: string,
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
  const budgets = PROFILE_BUDGETS[profile];
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
          return left.kind === "copilot-repository" ? -1 : 1;
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
        "Reduce overlap, shorten always-on guidance, or narrow applyTo so no single target pulls in a large instruction bundle.",
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
  summary: { maxApplicableTokens: number; maxApplicableTargetFile?: string }
): InstructionLintStats {
  return {
    totalFiles: files.length,
    repositoryFiles: files.filter((file) => file.kind === "copilot-repository").length,
    pathSpecificFiles: files.filter((file) => file.kind === "copilot-path-specific").length,
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
    warningCount: findings.filter((finding) => finding.severity === "warning").length,
    errorCount: findings.filter((finding) => finding.severity === "error").length
  };
}

function isSeverityFailing(
  finding: InstructionFinding,
  failOnSeverity: InstructionLintSeverity
): boolean {
  return compareSeverity(finding.severity, failOnSeverity) >= 0;
}

export function lintInstructions(
  pathOrFiles: string | string[],
  options: InstructionLintOptions = {}
): InstructionLintReport {
  const profile = options.profile ?? DEFAULT_PROFILE;
  const failOnSeverity = options.failOnSeverity ?? DEFAULT_FAIL_ON_SEVERITY;
  const surface = options.surface ?? DEFAULT_SURFACE;
  const model = options.model;
  const modelLimit = getModelLimit(model);
  const inputs = Array.isArray(pathOrFiles) ? pathOrFiles : [pathOrFiles];
  const candidates: CandidateFile[] = [];
  const warnings = new Set<string>();
  const repoFilesByRoot = new Map<string, string[]>();

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
      const discovered = discoverDirectoryCandidates(absoluteInput);
      if (discovered.length === 0) {
        warnings.add(`No Copilot instruction files were found under ${normalizePath(input)}.`);
      }
      candidates.push(...discovered);
      const repoFiles = walkFiles(absoluteInput).map((filePath) =>
        normalizePath(path.relative(absoluteInput, filePath))
      );
      repoFilesByRoot.set(absoluteInput, repoFiles);
      continue;
    }

    if (!stat.isFile()) {
      throw new Error(`Input path is not a file or directory: ${input}`);
    }

    const repoRoot = inferRepoRootFromFile(absoluteInput);
    candidates.push(classifyCandidate(absoluteInput, repoRoot));
    if (repoRoot && !repoFilesByRoot.has(repoRoot)) {
      repoFilesByRoot.set(
        repoRoot,
        walkFiles(repoRoot).map((filePath) => normalizePath(path.relative(repoRoot, filePath)))
      );
    }
    if (!repoRoot) {
      warnings.add(`Repository root could not be inferred for ${normalizePath(input)}; overlap resolution is limited.`);
    }
  }

  const internalReports: InternalFileReport[] = [];
  for (const candidate of candidates.sort((left, right) => left.file.localeCompare(right.file))) {
    const rawText = fs.readFileSync(candidate.absolutePath, "utf8");
    const frontmatter =
      candidate.kind === "copilot-path-specific"
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
      ...(candidate.repoRoot ? { repoRoot: candidate.repoRoot } : {}),
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

    if (candidate.kind === "copilot-path-specific") {
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
              'Use "code-review" or "coding-agent".'
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
      .filter((report) => report.kind === "copilot-repository" && report.repoRoot)
      .map((report) => report.repoRoot as string)
  );

  for (const report of internalReports) {
    const repoFiles = report.repoRoot ? repoFilesByRoot.get(report.repoRoot) ?? [] : [];
    report.matchedFiles = resolveMatchedFiles(report, repoFiles);
    report.matchedFileSet = new Set(report.matchedFiles);

    if (
      report.kind === "copilot-path-specific" &&
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

    if (report.kind === "copilot-path-specific" && report.applyTo.length > 0 && report.matchedFiles.length === 0) {
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

  const files: InstructionFileReport[] = internalReports
    .sort((left, right) => left.file.localeCompare(right.file))
    .map((report) => ({
      file: report.file,
      kind: report.kind,
      ...(report.applyTo.length > 0 ? { applyTo: report.applyTo } : {}),
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
  const stats = buildStats(files, findings, applicableTokenSummary);
  const passed = findings.every((finding) => !isSeverityFailing(finding, failOnSeverity));

  return {
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
    stats,
    files,
    findings,
    warnings: [...warnings].sort((left, right) => left.localeCompare(right))
  };
}
