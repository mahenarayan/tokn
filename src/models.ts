import type { ModelLimit } from "./types.js";

const MODEL_LIMITS: ModelLimit[] = [
  {
    id: "gpt-4o",
    aliases: ["gpt-4o-latest", "gpt-4o-2024-08-06"],
    contextWindow: 128000,
    defaultReservedOutput: 4096,
    provider: "openai"
  },
  {
    id: "gpt-4.1",
    aliases: ["gpt-4.1-mini", "gpt-4.1-nano"],
    contextWindow: 1047576,
    defaultReservedOutput: 8192,
    provider: "openai"
  },
  {
    id: "o3",
    aliases: ["o3-mini"],
    contextWindow: 200000,
    defaultReservedOutput: 8192,
    provider: "openai"
  },
  {
    id: "claude-3-5-sonnet-latest",
    aliases: ["claude-3-5-sonnet-20241022", "claude-3-5-sonnet"],
    contextWindow: 200000,
    defaultReservedOutput: 4096,
    provider: "anthropic"
  },
  {
    id: "claude-3-7-sonnet-latest",
    aliases: ["claude-3-7-sonnet-20250219"],
    contextWindow: 200000,
    defaultReservedOutput: 8192,
    provider: "anthropic"
  },
  {
    id: "gemini-1.5-pro",
    aliases: ["gemini-1.5-pro-latest"],
    contextWindow: 2097152,
    defaultReservedOutput: 8192,
    provider: "google"
  }
];

export function getModelLimit(model?: string): ModelLimit | undefined {
  if (!model) {
    return undefined;
  }

  const normalized = model.toLowerCase();
  return MODEL_LIMITS.find((entry) => {
    if (entry.id.toLowerCase() === normalized) {
      return true;
    }
    return entry.aliases?.some((alias) => alias.toLowerCase() === normalized) ?? false;
  });
}

export function listModelLimits(): ModelLimit[] {
  return [...MODEL_LIMITS];
}
