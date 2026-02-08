# Configuration

**Damru** — sql2nosql is configured via a single JSON file at the **project root**: `sql2nosql.config.json`. Copy from `sql2nosql.config.example.json` and fill in your values.

## Config file reference

Example structure:

```json
{
  "connection": "postgres://<username>:<password>@<host>:<port>/<database>",
  "schema": "public",
  "output": "./output",
  "llm": {
    "enabled": false,
    "apiKey": "<OPENAI_API_KEY>",
    "model": "gpt-4.1-mini"
  },
  "mongodb": {
    "uri": "mongodb://<username>:<password>@<host>:<port>",
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

---

## Required for analysis

| Key | Description |
|-----|-------------|
| `connection` | Postgres connection string. Required for `yarn analyze`. |
| `schema` | Postgres schema to introspect (default: `public`). |
| `output` | Directory for generated JSON, HTML, and scripts (default: `./output`). |

---

## MongoDB (for running migrations)

| Key | Description |
|-----|-------------|
| `mongodb.uri` | MongoDB connection URI. Required when running migration scripts (unless `migration.dryRun` is `true`). |
| `mongodb.database` | Target database name (default: `sql2nosql`). |
| `mongodb.collectionPrefix` | Optional prefix for collection names (default: `""`). |

---

## Migration script options

Used by the generated `.migrate.js` scripts when you run them.

| Key | Description |
|-----|-------------|
| `migration.batchSize` | `0` = load all rows; `>0` = paginate with LIMIT/OFFSET (e.g. `5000`) to avoid loading huge tables. |
| `migration.dryRun` | `true` = connect and process rows but **do not write** to MongoDB (safe to test). |
| `migration.skipOnError` | `true` = log row errors and continue; `false` = fail on first error. |
| `migration.progressEvery` | Log progress every N rows (e.g. `1000`); `0` = only final summary. |

---

## LLM (optional)

The **LLM** section enables AI-powered schema recommendations during `yarn analyze`. It is **optional** and **off by default**.

### Config fields

| Key | Description |
|-----|-------------|
| `llm.enabled` | Set `true` to enable LLM recommendations (default: `false`). You can also pass `--llm` on the CLI. |
| `llm.apiKey` | OpenAI API key. Can be set here, or via `--llm-api-key` or the `OPENAI_API_KEY` environment variable. |
| `llm.model` | Model name (e.g. `gpt-4.1-mini`, `gpt-4`). Default: `gpt-4`. |

### Advantages of using LLM

- **Embedding recommendations** — Suggests which relations to embed vs keep as references, with reasoning (e.g. “embed artist in album for read-heavy workloads”).
- **Trade-off explanations** — Describes pros and cons (denormalization, indexing, sharding) in plain language.
- **Optimized NoSQL layout** — Output in `output/recommend/` and the **view** HTML include an LLM-optimized schema and per-table insights you can compare to the deterministic analysis.
- **Human-in-the-loop** — The tool never migrates data or changes schemas itself; it only proposes. You decide what to apply.

### When to enable

- Enable when you want **suggestions and rationale** for embedding strategy, indexing, or document shape.
- Leave disabled if you only need **deterministic** SQL → NoSQL mapping and migration script generation (no API key required).

### Example with LLM enabled

```json
"llm": {
  "enabled": true,
  "apiKey": "sk-...",
  "model": "gpt-4.1-mini"
}
```

Then run:

```bash
yarn analyze --llm
```

Results appear in `output/recommend/` and in the **view** pages (e.g. “LLM Optimization Recommendations” and “Additional Insights”).

---

## Security

- **Do not commit `sql2nosql.config.json`** — it contains credentials (Postgres, MongoDB, and optionally the LLM API key). It is listed in `.gitignore`.
- Use `sql2nosql.config.example.json` (no secrets) as the template and document only the **shape** of the config in docs (as on this page).
