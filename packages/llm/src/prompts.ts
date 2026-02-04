import type { SqlSchema, NoSqlSchema } from "@s2n/core";

export function buildRecommendationPrompt(
  sqlSchema: SqlSchema,
  nosqlSchema: NoSqlSchema,
): string {
  const tablesSummary = sqlSchema.tables
    .map((table) => {
      const fks = sqlSchema.foreignKeys.filter((fk) => fk.fromTable === table.name);
      return `- ${table.name}: ${table.columns.length} columns, PK: ${table.primaryKey.join(", ") || "none"}, FKs: ${fks.length}`;
    })
    .join("\n");

  const relationshipsSummary = sqlSchema.foreignKeys
    .map(
      (fk) =>
        `- ${fk.fromTable}.${fk.fromColumn} → ${fk.toTable}.${fk.toColumn} (${fk.cardinality})`,
    )
    .join("\n");

  return `You are a NoSQL database design expert analyzing a SQL schema migration to MongoDB.

SQL Schema Summary:
${tablesSummary}

Relationships:
${relationshipsSummary}

Current NoSQL Mapping:
${nosqlSchema.collections
  .map(
    (c) =>
      `- ${c.name}: ${c.fields.map((f) => `${f.name}(${f.type}${f.refCollection ? `→${f.refCollection}` : ""})`).join(", ")}`,
  )
  .join("\n")}

Analyze each foreign key relationship and recommend whether to:
1. **reference**: Keep as reference only (current default)
2. **partial**: Embed some fields from the referenced table (e.g., name, slug)
3. **full**: Embed all fields from the referenced table
4. **hybrid**: Use reference + denormalize specific fields

Consider:
- How often is referenced data accessed together?
- Size of referenced data (small = safer to embed)
- Update frequency (rarely updated = safer to embed)
- Query patterns (if filtering by embedded field is common, embed it)

Return JSON in this exact format:
{
  "embeddings": [
    {
      "collection": "albums",
      "field": "artist_id",
      "strategy": "partial",
      "reason": "Artist name is frequently accessed with albums and rarely changes. Embedding name enables efficient queries without joins.",
      "suggestedFields": ["name"],
      "confidence": 0.85
    }
  ],
  "insights": [
    {
      "type": "embedding",
      "collection": "albums",
      "recommendation": "Consider embedding artist.name in albums collection",
      "reasoning": "Artist names are stable and frequently queried together with albums",
      "tradeoffs": {
        "pros": ["Faster queries", "No joins needed"],
        "cons": ["Data duplication", "Need to update multiple places if artist name changes"]
      }
    }
  ],
  "warnings": []
}

Be concise but specific. Focus on high-impact optimizations.`;
}
