import type { AnalysisResult } from "./model";
import { parseSqlSchema } from "./sqlParser";
import { buildAnalysisResult } from "./nosqlMapping";

/**
 * End-to-end SQL → NoSQL analysis entrypoint.
 *
 * Deterministic, rule-based, and side-effect free:
 * - Parses a subset of Postgres DDL into SqlSchema.
 * - Maps SqlSchema into a NoSqlSchema using simple rules.
 */
export function analyzeSqlToNoSql(sql: string): AnalysisResult {
  const sqlSchema = parseSqlSchema(sql);
  return buildAnalysisResult(sqlSchema);
}

