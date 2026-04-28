import type { InstructionLintProfile } from "../types.js";

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
    repositoryChars: 2500,
    pathSpecificChars: 1500,
    repositoryTokens: 600,
    pathSpecificTokens: 375,
    maxApplicableTokens: 900,
    statements: 20,
    wordsPerStatement: 50
  },
  standard: {
    repositoryChars: 1500,
    pathSpecificChars: 900,
    repositoryTokens: 375,
    pathSpecificTokens: 225,
    maxApplicableTokens: 600,
    statements: 12,
    wordsPerStatement: 30
  },
  strict: {
    repositoryChars: 900,
    pathSpecificChars: 600,
    repositoryTokens: 225,
    pathSpecificTokens: 150,
    maxApplicableTokens: 350,
    statements: 8,
    wordsPerStatement: 20
  }
};

export const COPILOT_CODE_REVIEW_CHAR_LIMIT = 4000;
