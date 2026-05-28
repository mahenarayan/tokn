import { COPILOT_CODE_REVIEW_CHAR_LIMIT, type InstructionBudgets } from "./limits.js";
import {
  addFinding,
  createFinding
} from "./findings.js";
import {
  type InternalFileReport,
  type InstructionCoverageAnalysis,
  type TargetInstructionLoad,
  compareTargetLoads,
  concreteSurfaceApplies,
  groupReportsByRepoRoot,
  instructionActivationType,
  isAllSurface,
  isCopilotInstruction,
  isPathSpecificInstruction,
  isRepositoryInstruction,
  sampleItems,
  surfaceApplicabilityForReport
} from "./internal.js";
import { knownUnsupportedAgentSurface } from "./discovery.js";
import { countWords, jaccardSimilarity } from "./text.js";
import type {
  InstructionFindingEvidence,
  InstructionLintProfile,
  InstructionLintSeverity,
  InstructionLintSurface,
  InstructionRuleId
} from "../types.js";

const ORDER_DEPENDENT_RE =
  /\b(earlier rule|later rule|next rule|previous rule|following rule|as described above|mentioned above|see above|see below|rules? above|rules? below|instructions? above|instructions? below|above rules?|below rules?|above instructions?|below instructions?)\b/i;
const WEAK_MODAL_RE =
  /\b(try to|should consider|best effort|ideally|if possible|where possible|as appropriate)\b/i;
const VAGUE_RE =
  /\b(follow best practices|write clean code|use clean code|write readable code|ensure high quality|do the right thing|be thoughtful)\b/i;
const SCOPED_TOPIC_RE =
  /(\*\*\/|\.[a-z0-9]{1,5}\b|\/[A-Za-z0-9._-]+\/|typescript|javascript|python|ruby|react|frontend|backend|docs\/|tests?\/|tsx|jsx|sql|api|schema)/i;

export function lintLocalRules(
  report: InternalFileReport,
  profile: InstructionLintProfile,
  surface: InstructionLintSurface,
  budgets: InstructionBudgets
): void {
  const seen = new Set<string>();
  const activationType = instructionActivationType(report);
  const budgetEligible = activationType !== "description";
  const fileBudgetGroupId = `file-budget:${report.file}`;

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
    (surface === "code-review" || isAllSurface(surface)) &&
    concreteSurfaceApplies(report, "code-review") &&
    report.chars > COPILOT_CODE_REVIEW_CHAR_LIMIT
  ) {
    const isConditional = isAllSurface(surface);
    addFinding(
      report,
      seen,
      isConditional ? "warning" : "error",
      "file-char-limit",
      isConditional
        ? `File is ${report.chars} characters long and would exceed GitHub Copilot code review's ${COPILOT_CODE_REVIEW_CHAR_LIMIT}-character limit if used for code review.`
        : `File is ${report.chars} characters long and exceeds GitHub Copilot code review's ${COPILOT_CODE_REVIEW_CHAR_LIMIT}-character limit.`,
      1,
      `Split the file or reduce repeated wording when this instruction file is intended for Copilot code review.`,
      {
        actual: report.chars,
        expected: COPILOT_CODE_REVIEW_CHAR_LIMIT,
        surface: "code-review"
      },
      {
        surfaceApplicability: ["code-review"],
        groupId: fileBudgetGroupId
      }
    );
  }

  if (budgetEligible && isRepositoryInstruction(report) && report.chars > budgets.repositoryChars) {
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
      },
      {
        groupId: fileBudgetGroupId
      }
    );
  }

  if (budgetEligible && isRepositoryInstruction(report) && report.estimatedTokens > budgets.repositoryTokens) {
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
      },
      {
        groupId: fileBudgetGroupId
      }
    );
  }

  if (budgetEligible && isPathSpecificInstruction(report) && report.chars > budgets.pathSpecificChars) {
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
      },
      {
        groupId: fileBudgetGroupId
      }
    );
  }

  if (budgetEligible && isPathSpecificInstruction(report) && report.estimatedTokens > budgets.pathSpecificTokens) {
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
      },
      {
        groupId: fileBudgetGroupId
      }
    );
  }

  if (budgetEligible && report.statements.length > budgets.statements) {
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
      },
      {
        groupId: fileBudgetGroupId
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

    if (statement.sourceType === "paragraph" && (statement.sentenceCount >= 3 || statement.wordCount >= 50)) {
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
        "Keep examples minimal and only show the pattern that Copilot must prefer or avoid.",
        {
          actual: block.lines,
          expected: 12
        },
        {
          groupId: `example-budget:${report.file}`
        }
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

export function lintCrossFileRules(reports: InternalFileReport[]): void {
  for (const group of groupReportsByRepoRoot(reports).values()) {
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

export function addApplicableTokenBudgetFindings(
  coverageAnalysis: InstructionCoverageAnalysis,
  profile: InstructionLintProfile,
  surface: InstructionLintSurface,
  budgets: InstructionBudgets
): { maxApplicableTokens: number; maxApplicableTargetFile?: string } {
  const loadsByRoot = new Map<string, TargetInstructionLoad[]>();

  let overallMaxTokens = 0;
  let overallTargetFile: string | undefined;

  for (const load of coverageAnalysis.targetLoads) {
    const existing = loadsByRoot.get(load.repoRoot) ?? [];
    existing.push(load);
    loadsByRoot.set(load.repoRoot, existing);
  }

  for (const loads of loadsByRoot.values()) {
    const maxLoad = loads.slice().sort(compareTargetLoads)[0];
    if (!maxLoad) {
      continue;
    }

    const maxTokens = maxLoad.estimatedTokens;
    const targetFile = maxLoad.targetFile;
    const contributors = maxLoad.instructionReports;

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
        },
        {
          activationType: instructionActivationType(hostReport),
          surfaceApplicability: surfaceApplicabilityForReport(hostReport),
          groupId: `target-budget:${targetFile}`
        }
      )
    );
  }

  return {
    maxApplicableTokens: overallMaxTokens,
    ...(overallTargetFile ? { maxApplicableTargetFile: overallTargetFile } : {})
  };
}
