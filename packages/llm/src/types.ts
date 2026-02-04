import type {
  AnalysisResult,
  LLMRecommendations,
  SqlSchema,
  NoSqlSchema,
} from "@s2n/core";

export interface LLMProvider {
  generateRecommendations(
    sqlSchema: SqlSchema,
    nosqlSchema: NoSqlSchema,
  ): Promise<LLMRecommendations>;
}

export interface LLMOptions {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}
