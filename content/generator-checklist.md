# Generator optimization checklist

git **Damru** — Status of the migration script generator against the optimization checklist.

| Category | Item | Status | Notes |
|----------|------|--------|--------|
| **Primary key resolution** | Detect PK / composite PK | ✅ | Uses `sqlTable.primaryKey`; composite supported in upsert filter. |
| | Generate correct Mongo upsert filter | ✅ | Single-field: `{ idField: docId }`; composite: `{ f1: v1, f2: v2 }`. |
| | Avoid duplicate/null-coalescing artifacts | ✅ | Single ID path for composite; minimal fallbacks for single PK. |
| **Batch / cursor strategy** | Full-scan vs batched pagination | ✅ | Config `migration.batchSize`; 0 = full scan, >0 = LIMIT/OFFSET. |
| | Emit LIMIT/OFFSET or cursor-based loop | ✅ | Batched loop with ORDER BY for deterministic pages. |
| | Configurable batch size | ✅ | `migration.batchSize` in config (default 0). |
| **Relation handling** | Detect foreign keys | ✅ | Via object fields + name matching (`*_id`, `*id`). |
| | Decide embed vs reference | ⚠️ | Embed by default (nested object); reference via schema. |
| | Generate preload map or lazy fetch | ✅ | Preload dependency collections into Maps. |
| **MongoDB index generation** | Create indexes for PK and FK fields | ✅ | Script ensures indexes before writes. |
| | Apply unique: true where applicable | ✅ | PK and SQL unique constraints → unique index. |
| **Field naming strategy** | Preserve original names OR camelCase | ⚠️ | Preserves SQL names; optional camelCase via schema/mapping. |
| | Keep strategy configurable | 📋 | Future: config `migration.fieldNaming`. |
| **Document shape strategy** | Flat vs nested documents | ✅ | Nested via NoSqlField `object` + `fields`. |
| | Controlled depth for embedded relations | ⚠️ | Depth from schema; no explicit depth limit. |
| **ID strategy** | Natural key vs generated _id | ✅ | Natural key from PK or first id-like field. |
| | Support composite identifiers | ✅ | Composite PK used as multi-field filter. |
| **Memory safety** | Avoid loading full tables | ✅ | Batched mode streams via LIMIT/OFFSET. |
| | Stream or batch large tables | ✅ | `migration.batchSize` enables batching. |
| **Dry-run / preview mode** | Generate scripts that can simulate migration | ✅ | `migration.dryRun: true` in config. |
| | No writes when enabled | ✅ | Skips all `updateOne` when dry run. |
| **Progress logging** | Periodic counters (every N rows) | ✅ | `migration.progressEvery` (default 1000). |
| | Table-level summary logs | ✅ | Final migrated count and errors. |
| **Error handling strategy** | Skip-on-error vs fail-fast | ✅ | `migration.skipOnError` (default false). |
| | Row-level error logging | ✅ | Logs row identifier and error when skip-on-error. |
| **Config validation** | Fail early on missing connection/schema | ✅ | Config file + Postgres connection checked. |
| | Validate relation config | ⚠️ | Schema-driven; no extra relation config yet. |
| **Re-runnable safety** | Idempotent upserts | ✅ | `updateOne` with `upsert: true`. |
| | No duplicate inserts on re-run | ✅ | Same filter → same document updated. |
| **Extensibility hooks** | Clearly marked GENERATED blocks | ✅ | `// --- BEGIN GENERATED ---` / `// --- END GENERATED ---`. |
| | Safe manual edit zones | ✅ | buildDoc and config read outside generated block. |
| **Production readiness** | Index-first, write-later ordering | ✅ | Script creates indexes then migrates. |
| | Deterministic ordering in queries | ✅ | `ORDER BY` on PK columns in batched query. |

Legend: ✅ Done \| ⚠️ Partial \| 📋 Planned

## Config (migration scripts)

Scripts read `sql2nosql.config.json`. Relevant keys:

```json
{
  "connection": "postgres://...",
  "schema": "public",
  "mongodb": {
    "uri": "mongodb://localhost:27017",
    "database": "sql2nosql",
    "collectionPrefix": ""
  },
  "migration": {
    "batchSize": 0,
    "dryRun": false,
    "skipOnError": false,
    "progressEvery": 1000
  }
}
```

- **batchSize**: `0` = load all rows; `>0` = paginate with LIMIT/OFFSET.
- **dryRun**: `true` = no MongoDB writes, only logs.
- **skipOnError**: `true` = log and continue on row errors; `false` = throw and exit.
- **progressEvery**: log progress every N rows (0 = only final summary).

## Running migration scripts

**Run all migrations with Node:**

```bash
cd packages/cli && node output/scripts/run-all.migrate.js
```

Scripts are generated under `output/scripts/` (regenerated on each `sql2nosql analyze`). Ensure `sql2nosql.config.json` is at the project root; use `migration.dryRun: true` to test without writing to MongoDB.
