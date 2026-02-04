import OpenAI from "openai";
import type { SqlSchema, NoSqlSchema, LLMRecommendations } from "@s2n/core";
import type { LLMProvider, LLMOptions } from "../types";
import { buildRecommendationPrompt } from "../prompts";

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(options: LLMOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model ?? "gpt-4";
    this.temperature = options.temperature ?? 0.3;
    this.maxTokens = options.maxTokens ?? 2000;
  }

  async generateRecommendations(
    sqlSchema: SqlSchema,
    nosqlSchema: NoSqlSchema,
  ): Promise<LLMRecommendations> {
    const prompt = buildRecommendationPrompt(sqlSchema, nosqlSchema);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are a NoSQL database design expert. Return only valid JSON, no markdown formatting.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      const parsed = JSON.parse(content) as LLMRecommendations;

      // Validate structure
      if (!parsed.embeddings || !Array.isArray(parsed.embeddings)) {
        parsed.embeddings = [];
      }
      if (!parsed.insights || !Array.isArray(parsed.insights)) {
        parsed.insights = [];
      }
      if (!parsed.warnings || !Array.isArray(parsed.warnings)) {
        parsed.warnings = [];
      }

      return parsed;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("LLM recommendation error:", error);
      throw new Error(
        `Failed to generate LLM recommendations: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
