import type {
  InstructionLintBudgetOverrides,
  InstructionLintProfile
} from "../types.js";

export interface InstructionBudgets {
  repositoryChars: number;
  pathSpecificChars: number;
  repositoryTokens: number;
  pathSpecificTokens: number;
  maxApplicableTokens: number;
  statements: number;
  wordsPerStatement: number;
}

export const INSTRUCTION_PROFILE_BUDGETS: Record<InstructionLintProfile, InstructionBudgets> = {
  lite: {
    repositoryChars: 4000,
    pathSpecificChars: 4000,
    repositoryTokens: 1000,
    pathSpecificTokens: 1000,
    maxApplicableTokens: 3000,
    statements: 40,
    wordsPerStatement: 70
  },
  standard: {
    repositoryChars: 2500,
    pathSpecificChars: 2500,
    repositoryTokens: 650,
    pathSpecificTokens: 650,
    maxApplicableTokens: 2400,
    statements: 24,
    wordsPerStatement: 50
  },
  strict: {
    repositoryChars: 1500,
    pathSpecificChars: 900,
    repositoryTokens: 375,
    pathSpecificTokens: 225,
    maxApplicableTokens: 600,
    statements: 12,
    wordsPerStatement: 30
  }
};

export function resolveInstructionBudgets(
  profile: InstructionLintProfile,
  overrides: InstructionLintBudgetOverrides = {}
): InstructionBudgets {
  return {
    ...INSTRUCTION_PROFILE_BUDGETS[profile],
    ...overrides
  };
}

export const COPILOT_CODE_REVIEW_CHAR_LIMIT = 4000;
