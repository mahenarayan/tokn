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

export function countWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

export function countSentences(text: string): number {
  const matches = text.match(/[.!?](?:\s|$)/g);
  return matches?.length ?? 1;
}

export function normalizeStatementText(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9./_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenSet(text: string, { removeNegation = false }: { removeNegation?: boolean } = {}): string[] {
  const tokens = normalizeStatementText(text)
    .split(" ")
    .filter((token) => token.length > 1)
    .filter((token) => !STOP_WORDS.has(token))
    .filter((token) => !(removeNegation && NEGATION_WORDS.has(token)));

  return [...new Set(tokens)];
}

export function isNegative(text: string): boolean {
  return /\b(do not|don't|never|avoid|without|no)\b/i.test(text);
}

export function jaccardSimilarity(left: string[], right: string[]): number {
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
