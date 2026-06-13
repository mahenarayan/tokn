import fs from "node:fs";
import path from "node:path";

import { readText } from "../helpers.js";
import { getModelLimit } from "../models.js";
import { estimateTextTokens } from "../tokenizer.js";
import {
  type CandidateFile,
  classifyCandidate,
  discoverDirectoryCandidates,
  inferRepoRootFromFile,
  matchesAnyGlob,
  normalizePath,
  walkFiles
} from "./discovery.js";
import {
  type Statement,
  instructionTokenText,
  parseFrontmatter,
  parseMarkdownBlocks,
  statementFromBlock
} from "./markdown.js";
import {
  INSTRUCTION_LINT_REPORT_SCHEMA_PATH,
  INSTRUCTION_LINT_REPORT_SCHEMA_VERSION
} from "./rules.js";
import {
  addApplicableTokenBudgetFindings,
  lintCrossFileRules,
  lintLocalRules
} from "./rule-checks.js";
import {
  buildInstructionDriftSummary,
  lintInstructionDrift
} from "./drift.js";
import {
  countWords
} from "./text.js";
import {
  type IgnoreSummary,
  type InstructionInputCollection,
  type InternalFileReport,
  type PostProcessSummary,
  appliesToSurface
} from "./internal.js";
import {
  createFinding,
  findingSort
} from "./findings.js";
import {
  type ResolvedLintPolicy,
  isSeverityFailing,
  postProcessFindings,
  resolveLintPolicy
} from "./policy.js";
import {
  buildInstructionCoverageAnalysis,
  buildInstructionCoverageMap,
  resolveInstructionScopeFindings
} from "./scope.js";
import type {
  InstructionExcludeAgent,
  InstructionFileReport,
  InstructionFinding,
  InstructionFindingCategory,
  InstructionLintOptions,
  InstructionLintReport,
  InstructionLintStats
} from "../types.js";

const MAX_INSTRUCTION_FILE_BYTES = 1024 * 1024;

/*
 * Instruction lint is a deterministic pipeline, not a model-judged rule engine:
 * collect candidate files, parse instruction text, run local file rules, resolve
 * file-scope composition, run executable checks, then apply policy and render a
 * stable report. `rules.ts` is the public rule registry; `rule-checks.ts`
 * contains the deterministic checks that make those rules fire.
 */

function splitFrontmatterList(value: unknown): {
  entries: string[];
  invalid: boolean;
} {
  if (value === undefined) {
    return { entries: [], invalid: false };
  }
  if (typeof value === "string") {
    return {
      entries: value.split(",").map((entry) => entry.trim()).filter(Boolean),
      invalid: value.trim().length === 0
    };
  }
  if (Array.isArray(value)) {
    const entries: string[] = [];
    let invalid = value.length === 0;
    for (const entry of value) {
      if (typeof entry !== "string" || entry.trim().length === 0) {
        invalid = true;
        continue;
      }
      entries.push(entry.trim());
    }
    return { entries, invalid };
  }
  return { entries: [], invalid: true };
}

function parseApplyTo(value: unknown): {
  applyTo: string[];
  invalid: boolean;
} {
  const parsed = splitFrontmatterList(value);
  return {
    applyTo: parsed.entries,
    invalid: parsed.invalid
  };
}

function parseFrontmatterText(value: unknown): {
  text?: string;
  invalid: boolean;
} {
  if (value === undefined) {
    return { invalid: false };
  }
  if (typeof value !== "string") {
    return { invalid: true };
  }
  const trimmed = value.trim();
  return trimmed ? { text: trimmed, invalid: false } : { invalid: true };
}

function parseExcludeAgents(value: unknown): {
  excludeAgents: InstructionExcludeAgent[];
  invalidEntries: string[];
  invalidType: boolean;
} {
  const parsed = splitFrontmatterList(value);

  const excludeAgents: InstructionExcludeAgent[] = [];
  const invalidEntries: string[] = [];
  if (parsed.invalid) {
    return {
      excludeAgents: [],
      invalidEntries,
      invalidType: true
    };
  }

  for (const entry of parsed.entries) {
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
    invalidEntries,
    invalidType: parsed.invalid
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

function matchesFindingFilters(
  finding: InstructionFinding,
  onlyCategories: InstructionFindingCategory[],
  onlyRules: InstructionFinding["ruleId"][]
): boolean {
  if (onlyCategories.length > 0 && (!finding.category || !onlyCategories.includes(finding.category))) {
    return false;
  }
  if (onlyRules.length > 0 && !onlyRules.includes(finding.ruleId)) {
    return false;
  }
  return true;
}

function collectVisibleRepoFiles(
  repoRoot: string,
  ignore: string[],
  ignoreSummary: IgnoreSummary
): string[] {
  const repoFiles = walkFiles(repoRoot).map((filePath) =>
    normalizePath(path.relative(repoRoot, filePath))
  );
  const visibleRepoFiles = repoFiles.filter((filePath) => !matchesAnyGlob(filePath, ignore));
  ignoreSummary.ignoredTargetFileCount += repoFiles.length - visibleRepoFiles.length;
  return visibleRepoFiles;
}

function collectInstructionInputs(
  inputs: string[],
  policy: ResolvedLintPolicy
): InstructionInputCollection {
  const candidates: CandidateFile[] = [];
  const warnings = new Set<string>();
  const repoFilesByRoot = new Map<string, string[]>();
  const ignoreSummary: IgnoreSummary = {
    ignoredInstructionFileCount: 0,
    ignoredTargetFileCount: 0
  };

  for (const input of inputs) {
    const absoluteInput = path.resolve(input);
    if (!fs.existsSync(absoluteInput)) {
      throw new Error(`Input path does not exist: ${input}`);
    }

    const stat = fs.statSync(absoluteInput);
    if (stat.isDirectory()) {
      const discovered = discoverDirectoryCandidates(absoluteInput, policy.preset);
      const visibleCandidates = discovered.filter((candidate) => !matchesAnyGlob(candidate.file, policy.ignore));
      ignoreSummary.ignoredInstructionFileCount += discovered.length - visibleCandidates.length;
      if (visibleCandidates.length === 0) {
        const message =
          policy.preset === "auto"
            ? `No supported instruction files were found under ${normalizePath(input)}.`
            : `No ${policy.preset} instruction files were found under ${normalizePath(input)}.`;
        warnings.add(message);
      }
      candidates.push(...visibleCandidates);
      if (!repoFilesByRoot.has(absoluteInput)) {
        repoFilesByRoot.set(
          absoluteInput,
          collectVisibleRepoFiles(absoluteInput, policy.ignore, ignoreSummary)
        );
      }
      continue;
    }

    if (!stat.isFile()) {
      throw new Error(`Input path is not a file or directory: ${input}`);
    }

    const repoRoot = inferRepoRootFromFile(absoluteInput);
    const candidate = classifyCandidate(absoluteInput, repoRoot);
    if (policy.preset === "auto" || candidate.preset === policy.preset) {
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
      repoFilesByRoot.set(repoRoot, collectVisibleRepoFiles(repoRoot, policy.ignore, ignoreSummary));
    }
    if (!repoRoot) {
      warnings.add(`Repository root could not be inferred for ${normalizePath(input)}; overlap resolution is limited.`);
    }
  }

  return {
    candidates,
    repoFilesByRoot,
    ignoreSummary,
    warnings
  };
}

function buildInternalFileReport(
  candidate: CandidateFile,
  policy: ResolvedLintPolicy,
  notes: Set<string>
): InternalFileReport {
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
  const tokenText = instructionTokenText(candidate, frontmatter, rawText);

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
    estimatedTokens: estimateTextTokens(tokenText),
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
          "Use simple YAML frontmatter with applyTo: \"glob\" or description: \"when to use this file\"."
        )
      );
    } else if (!frontmatter.hasFrontmatter) {
      report.findings.push(
        createFinding(
          report.file,
          "error",
          "missing-frontmatter",
          "Path-specific instruction files must start with YAML frontmatter containing applyTo or description.",
          1,
          "Add frontmatter like --- applyTo: \"**/*.ts\" --- or --- description: \"Use for architecture questions\" --- at the top of the file."
        )
      );
    } else {
      const applyTo = parseApplyTo(frontmatter.data.applyTo);
      report.applyTo = applyTo.applyTo;
      if (frontmatter.lines.applyTo !== undefined) {
        report.applyToLine = frontmatter.lines.applyTo;
      }
      if (applyTo.invalid) {
        report.findings.push(
          createFinding(
            report.file,
            "error",
            "malformed-frontmatter",
            "applyTo must be a non-empty string or an array of non-empty strings.",
            report.applyToLine ?? 1,
            'Use applyTo: "**/*.ts" or applyTo: ["src/**/*.ts", "web/**/*.tsx"].'
          )
        );
      }

      const description = parseFrontmatterText(frontmatter.data.description);
      if (description.text) {
        report.description = description.text;
      }
      if (frontmatter.lines.description !== undefined) {
        report.descriptionLine = frontmatter.lines.description;
      }
      if (description.invalid) {
        report.findings.push(
          createFinding(
            report.file,
            "error",
            "malformed-frontmatter",
            "description must be a non-empty string.",
            report.descriptionLine ?? 1,
            'Use description: "Use when this instruction should be selected manually."'
          )
        );
      }

      if (report.applyTo.length === 0 && !report.description && !applyTo.invalid && !description.invalid) {
        report.findings.push(
          createFinding(
            report.file,
            "error",
            "missing-applyto",
            "Path-specific instruction file is missing a valid applyTo or description value.",
            report.applyToLine ?? report.descriptionLine ?? 2,
            "Set applyTo for automatic path matching, or set description for manual/task-triggered activation."
          )
        );
      }
      if (report.applyTo.length === 0 && report.description && !applyTo.invalid) {
        notes.add(
          `${report.file} uses description-only activation; target-file matching, stale applyTo checks, and overlap analysis are skipped for this file.`
        );
      }

      const excludeAgent = parseExcludeAgents(frontmatter.data.excludeAgent);
      report.excludeAgents = excludeAgent.excludeAgents;
      if (frontmatter.lines.excludeAgent !== undefined) {
        report.excludeAgentsLine = frontmatter.lines.excludeAgent;
      }
      if (excludeAgent.invalidType || excludeAgent.invalidEntries.length > 0) {
        const message = excludeAgent.invalidType
          ? "excludeAgent must be a non-empty string or an array of non-empty strings."
          : `excludeAgent contains unsupported value(s): ${excludeAgent.invalidEntries.join(", ")}.`;
        report.findings.push(
          createFinding(
            report.file,
            "error",
            "invalid-exclude-agent",
            message,
            report.excludeAgentsLine ?? 1,
            'Use "code-review" or "cloud-agent".'
          )
        );
      }
    }
  }

  report.appliesToSurface = appliesToSurface(report, policy.surface);
  lintLocalRules(report, policy.profile, policy.surface, policy.budgets);
  return report;
}

function buildInternalFileReports(
  candidates: CandidateFile[],
  policy: ResolvedLintPolicy,
  notes: Set<string>
): InternalFileReport[] {
  return candidates
    .sort((left, right) => left.file.localeCompare(right.file))
    .map((candidate) => buildInternalFileReport(candidate, policy, notes));
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
  const budgets = policy.budgets;
  const model = policy.model;
  const verbose = options.verbose === true;
  const onlyCategories = options.onlyCategories ?? [];
  const onlyRules = options.onlyRules ?? [];
  const modelLimit = getModelLimit(model);
  const notes = new Set<string>();
  const {
    candidates,
    repoFilesByRoot,
    ignoreSummary,
    warnings
  } = collectInstructionInputs(inputs, policy);

  if (model && !modelLimit) {
    warnings.add(`Model limits are unknown for ${model}; context-window share metrics are unavailable.`);
  }

  const internalReports = buildInternalFileReports(candidates, policy, notes);
  resolveInstructionScopeFindings(internalReports, repoFilesByRoot, warnings);

  lintInstructionDrift(internalReports, repoFilesByRoot);
  lintCrossFileRules(internalReports);
  const coverageAnalysis = buildInstructionCoverageAnalysis(internalReports, repoFilesByRoot);
  const coverage = buildInstructionCoverageMap(coverageAnalysis);
  const applicableTokenSummary = addApplicableTokenBudgetFindings(
    coverageAnalysis,
    profile,
    surface,
    budgets
  );
  const postProcessSummary = postProcessFindings(internalReports, policy);

  const files: InstructionFileReport[] = internalReports
    .sort((left, right) => left.file.localeCompare(right.file))
    .map((report) => ({
      file: report.file,
      kind: report.kind,
      ...(report.preset ? { preset: report.preset } : {}),
      ...(report.applyTo.length > 0 ? { applyTo: report.applyTo } : {}),
      ...(report.description ? { description: report.description } : {}),
      ...(report.scopePath ? { scopePath: report.scopePath } : {}),
      ...(report.excludeAgents.length > 0 ? { excludeAgents: report.excludeAgents } : {}),
      appliesToSurface: report.appliesToSurface,
      chars: report.chars,
      words: report.words,
      estimatedTokens: report.estimatedTokens,
      statementCount: report.statements.length,
      ...(verbose
        ? {
            statementEstimates: report.statements.map((statement) => ({
              line: statement.line,
              sourceType: statement.sourceType,
              chars: statement.text.length,
              words: statement.wordCount,
              estimatedTokens: estimateTextTokens(statement.text),
              text: statement.text
            }))
          }
        : {}),
      ...(report.kind !== "unsupported" ? { matchedFileCount: report.matchedFiles.length } : {}),
      findings: report.findings
        .filter((finding) => matchesFindingFilters(finding, onlyCategories, onlyRules))
        .sort(findingSort)
    }));

  const findings = files
    .flatMap((file) => file.findings)
    .sort(findingSort);
  const drift = buildInstructionDriftSummary(findings);
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
    coverage,
    ...(drift ? { drift } : {}),
    stats,
    files,
    findings,
    warnings: [...warnings].sort((left, right) => left.localeCompare(right)),
    notes: [...notes].sort((left, right) => left.localeCompare(right))
  };
}
