import fs from "node:fs";

export function readText(filePath: string): string {
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
