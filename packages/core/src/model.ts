export type SqlColumnType =
  | "integer"
  | "bigint"
  | "serial"
  | "bigserial"
  | "numeric"
  | "text"
  | "varchar"
  | "boolean"
  | "timestamp"
  | "timestamptz"
  | "date"
  | "json"
  | "jsonb"
  | "uuid"
  | "unknown";

export interface SqlColumn {
  name: string;
  type: SqlColumnType;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  hasDefault: boolean;
}

export type SqlRelationshipCardinality = "one-to-one" | "one-to-many" | "many-to-many";

export interface SqlForeignKey {
  name: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  cardinality: SqlRelationshipCardinality;
}

export interface SqlTable {
  name: string;
  columns: SqlColumn[];
  primaryKey: string[];
  uniqueConstraints: string[][];
}

export interface SqlSchema {
  tables: SqlTable[];
  foreignKeys: SqlForeignKey[];
}

export type NoSqlFieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "object"
  | "array"
  | "reference"
  | "unknown";

export interface NoSqlField {
  name: string;
  type: NoSqlFieldType;
  optional: boolean;
  description?: string;
  refCollection?: string;
}

export interface NoSqlCollection {
  name: string;
  fields: NoSqlField[];
  description?: string;
}

export interface NoSqlSchema {
  collections: NoSqlCollection[];
}

export type EmbeddingStrategy = "full" | "partial" | "reference" | "hybrid";

export interface EmbeddingRecommendation {
  collection: string;
  field: string;
  strategy: EmbeddingStrategy;
  reason: string;
  suggestedFields?: string[];
  confidence?: number;
}

export interface OptimizationInsight {
  type: "embedding" | "denormalization" | "indexing" | "sharding";
  collection: string;
  recommendation: string;
  reasoning: string;
  tradeoffs?: {
    pros: string[];
    cons: string[];
  };
}

export interface LLMRecommendations {
  embeddings: EmbeddingRecommendation[];
  insights: OptimizationInsight[];
  warnings?: string[];
}

export interface AnalysisResult {
  sqlSchema: SqlSchema;
  nosqlSchema: NoSqlSchema;
  llmRecommendations?: LLMRecommendations;
}

