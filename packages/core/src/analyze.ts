import type { AnalysisResult } from "./model";

/**
 * Temporary stub for SQL → NoSQL analysis.
 * For now this only echoes the input in metadata so that
 * UI and CLI can be wired and tested end-to-end.
 */
export function analyzeSqlToNoSql(sql: string): AnalysisResult {
  return {
    sqlSchema: {
      tables: [],
      foreignKeys: [],
    },
    nosqlSchema: {
      collections: [],
    },
  };
}

