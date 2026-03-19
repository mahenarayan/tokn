import type { CountConfidence } from "./types.js";

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function estimateTextTokens(text: string): number {
  const normalized = normalizeText(text);
  if (!normalized) {
    return 0;
  }

  const chars = normalized.length;
  const words = normalized.split(" ").length;
  return Math.max(1, Math.ceil(chars / 4) + Math.ceil(words / 20));
}

export function estimateJsonTokens(value: unknown): number {
  return estimateTextTokens(JSON.stringify(value));
}

export function inferConfidence(hasProviderUsage: boolean, text?: string): CountConfidence {
  if (hasProviderUsage) {
    return "provider-reported";
  }
  return text ? "tokenizer-based" : "heuristic";
}
