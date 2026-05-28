import fs from "node:fs";
import path from "node:path";

import type {
  InstructionFileKind,
  InstructionLintPreset,
  InstructionLintPresetSelector
} from "../types.js";

export interface CandidateFile {
  absolutePath: string;
  file: string;
  kind: InstructionFileKind;
  preset?: InstructionLintPreset;
  repoRoot?: string;
  scopePath?: string;
}

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", ".npm-cache"]);

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function walkFiles(directory: string): string[] {
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

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

export function directoryExists(directoryPath: string): boolean {
  return fs.existsSync(directoryPath) && fs.statSync(directoryPath).isDirectory();
}

export function inferRepoRootFromDirectory(directoryPath: string): string | undefined {
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

export function inferRepoRootFromFile(filePath: string): string | undefined {
  const normalized = path.resolve(filePath);
  let current = path.dirname(normalized);
  let fallback: string | undefined;
  let selfMarkerFallback: string | undefined;
  while (true) {
    const markerFiles = [
      path.join(current, "AGENTS.md"),
      path.join(current, "CLAUDE.md"),
      path.join(current, "GEMINI.md"),
      path.join(current, ".cursorrules")
    ];
    const hasMarkerFile = markerFiles.some((markerPath) => {
      if (!fileExists(markerPath)) {
        return false;
      }
      if (path.resolve(markerPath) === normalized) {
        selfMarkerFallback ??= current;
        return false;
      }
      return true;
    });
    if (
      directoryExists(path.join(current, ".github")) ||
      directoryExists(path.join(current, ".claude")) ||
      directoryExists(path.join(current, ".cursor")) ||
      hasMarkerFile
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
      return fallback ?? selfMarkerFallback;
    }
    current = parent;
  }
}

export function displayPath(absolutePath: string, repoRoot?: string): string {
  if (repoRoot) {
    return normalizePath(path.relative(repoRoot, absolutePath));
  }

  const relativeToCwd = path.relative(process.cwd(), absolutePath);
  return relativeToCwd.startsWith("..") ? normalizePath(absolutePath) : normalizePath(relativeToCwd);
}

export function matchesAnyGlob(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesGlob(filePath, pattern));
}

export function matchesGlob(filePath: string, pattern: string): boolean {
  return path.matchesGlob(normalizePath(filePath), normalizePath(pattern));
}

function pathHasDirectoryPair(filePath: string, parent: string, child: string): boolean {
  const parts = normalizePath(filePath).split("/");
  return parts.some((part, index) => part === parent && parts[index + 1] === child);
}

export function knownUnsupportedAgentSurface(filePath: string): string | undefined {
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

export function classifyCandidate(absolutePath: string, repoRoot?: string): CandidateFile {
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

export function discoverDirectoryCandidates(
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
