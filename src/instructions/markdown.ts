import { parseDocument } from "yaml";

import type { CandidateFile } from "./discovery.js";
import {
  countSentences,
  countWords,
  isNegative,
  normalizeStatementText,
  tokenSet
} from "./text.js";

type MarkdownBlockType = "heading" | "bullet" | "numbered" | "paragraph" | "code";

export interface MarkdownBlock {
  type: MarkdownBlockType;
  line: number;
  text: string;
  lines: number;
}

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  lines: Record<string, number>;
  body: string;
  endLine: number;
  hasFrontmatter: boolean;
  error?: string;
  errorLine?: number;
}

export interface Statement {
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

const FRONTMATTER_DELIMITER = "---";

function isBlockBoundary(line: string): boolean {
  return (
    line.trim() === "" ||
    /^(```|~~~)/.test(line.trim()) ||
    /^#{1,6}\s+/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line)
  );
}

export function parseFrontmatter(rawText: string): ParsedFrontmatter {
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

  const lineNumbers: Record<string, number> = {};
  for (let index = 1; index < closingIndex; index += 1) {
    const match = (lines[index] ?? "").match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:/);
    if (match?.[1] && lineNumbers[match[1]] === undefined) {
      lineNumbers[match[1]] = index + 1;
    }
  }

  const frontmatterText = lines.slice(1, closingIndex).join("\n");
  const document = parseDocument(frontmatterText, {
    prettyErrors: false,
    strict: false
  });
  if (document.errors.length > 0) {
    return {
      data: {},
      lines: lineNumbers,
      body: rawText,
      endLine: closingIndex + 1,
      hasFrontmatter: true,
      error: `Frontmatter contains invalid YAML: ${document.errors[0]?.message ?? "unknown parse error"}.`,
      errorLine: 1
    };
  }

  const parsed = document.toJSON();
  if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed))) {
    return {
      data: {},
      lines: lineNumbers,
      body: rawText,
      endLine: closingIndex + 1,
      hasFrontmatter: true,
      error: "Frontmatter must be a YAML object with top-level keys.",
      errorLine: 1
    };
  }

  return {
    data: parsed ?? {},
    lines: lineNumbers,
    body: lines.slice(closingIndex + 1).join("\n"),
    endLine: closingIndex + 1,
    hasFrontmatter: true
  };
}

export function parseMarkdownBlocks(content: string, lineOffset: number): MarkdownBlock[] {
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

export function instructionTokenText(
  candidate: Pick<CandidateFile, "kind" | "preset">,
  frontmatter: Pick<ParsedFrontmatter, "body" | "error" | "hasFrontmatter">,
  rawText: string
): string {
  if (
    candidate.preset === "copilot" &&
    candidate.kind === "path-specific" &&
    frontmatter.hasFrontmatter &&
    !frontmatter.error
  ) {
    return frontmatter.body;
  }
  return rawText;
}

export function statementFromBlock(block: MarkdownBlock): Statement | undefined {
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
