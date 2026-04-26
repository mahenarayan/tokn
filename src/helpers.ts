import fs from "node:fs";

export const DEFAULT_MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;

export function readText(
  filePath: string,
  options: { maxBytes?: number } = {}
): string {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_TEXT_FILE_BYTES;
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`Input path is not a file: ${filePath}`);
  }
  if (stat.size > maxBytes) {
    throw new Error(
      `Refusing to read ${filePath}: ${stat.size} bytes exceeds the ${maxBytes} byte safety limit.`
    );
  }
  return fs.readFileSync(filePath, "utf8");
}

export function safeJsonParse(raw: string): unknown {
  return JSON.parse(raw);
}

export function asArray<T>(value: T | T[] | undefined): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value === undefined ? [] : [value];
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatPercent(value?: number): string {
  if (value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return `${value.toFixed(1)}%`;
}
