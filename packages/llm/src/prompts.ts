import type { SqlSchema, NoSqlSchema } from "@s2n/core";

export function buildRecommendationPrompt(
  sqlSchema: SqlSchema,
  nosqlSchema: NoSqlSchema,
): string {
  const tablesSummary = sqlSchema.tables
    .map((table) => {
      const fks = sqlSchema.foreignKeys.filter(
        (fk) => fk.fromTable === table.name,
      );

      const columnPreview = table.columns
        .slice(0, 6)
        .map((c) => `${c.name}:${c.type}`)
        .join(", ");

      return `- ${table.name}
  columns: ${columnPreview}${table.columns.length > 6 ? ", ..." : ""}
  PK: ${table.primaryKey.join(", ") || "none"}
  FKs: ${fks.length}`;
    })
    .join("\n");

  const relationshipsSummary = sqlSchema.foreignKeys
    .map(
      (fk) =>
        `- ${fk.fromTable}.${fk.fromColumn} → ${fk.toTable}.${fk.toColumn} (${fk.cardinality})`,
    )
    .join("\n");

  return `You are a senior NoSQL database architect helping migrate a SQL schema to MongoDB.

This system already has multiple layers:
1. SQL schema introspection is complete
2. A base NoSQL schema is already generated WITHOUT AI
3. Your role is ONLY to recommend schema optimizations
4. Data migration and chunking are handled elsewhere

SQL Schema Summary:
${tablesSummary}

Explicit SQL Foreign Key Relationships:
${relationshipsSummary || "None"}

Current NoSQL Mapping (baseline, auto-generated):
${nosqlSchema.collections
  .map(
    (c) =>
      `- ${c.name}: ${c.fields
        .map(
          (f) =>
            `${f.name}(${f.type}${
              f.refCollection ? `→${f.refCollection}` : ""
            })`,
        )
        .join(", ")}`,
  )
  .join("\n")}

You may analyze TWO types of relationships:
1. **Explicit relationships** – defined by SQL foreign keys
2. **Implicit relationships** – id-like columns such as *_id, created_by, owner_id,
   even if no SQL foreign key exists

Strategies you may recommend:
1. **reference** – keep reference only
2. **partial** – embed selected fields
3. **full** – embed entire referenced document (ONLY for explicit FKs)
4. **hybrid** – reference + denormalized fields

Rules:
- Implicit (non-FK) relationships may ONLY use "partial" or "hybrid"
- Never recommend FULL embedding for implicit relationships
- Prefer immutable or rarely updated fields (name, title, slug, code)
- Avoid large, frequently updated, or unbounded fields
- Respect MongoDB limits (16MB document size, shallow nesting)
- Focus on read optimization, not write optimization
- If reference is optimal, still include it with strategy "reference"

Return JSON in EXACTLY this format:
{
  "embeddings": [
    {
      "collection": "orders",
      "field": "user_id",
      "relationshipType": "implicit",
      "strategy": "partial",
      "reason": "User name is frequently needed when reading orders and rarely changes.",
      "suggestedFields": ["name"],
      "confidence": 0.7
    }
  ],
  "insights": [],
  "warnings": []
}

Confidence meaning:
- 0.0–0.4 = weak / optional
- 0.5–0.7 = reasonable
- 0.8–1.0 = very strong

Be concise, conservative, and deterministic.
`;
}
