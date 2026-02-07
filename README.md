# SQL → NoSQL Analyzer

> Analyze SQL databases and generate explainable NoSQL schema designs.

**v0.1** — Deterministic analysis + optional LLM recommendations + migration script generation (human-in-the-loop).

## Overview

`sql2nosql` is an open-source tool that helps you understand how your SQL schema maps to NoSQL design patterns. It analyzes your SQL DDL (CREATE TABLE statements) and produces structured NoSQL schema proposals with explanations.

### Current Status

- ✅ **v0.1**: CLI-based analysis pipeline (PostgreSQL support)
- 🚧 **Coming**: deeper insights and recommendations
- 🔮 **Future**: optional LLM-powered explanations

### What This Tool Does

- Connects to a PostgreSQL database (via CLI)
- Introspects tables/columns/keys from `information_schema`
- Builds a structured SQL schema model (`SqlSchema`)
- Generates NoSQL schema proposals (collections, fields, references)
- Writes deterministic JSON files per table for further processing

### What This Tool Does NOT Do

- ❌ Directly migrate data automatically (it generates scripts; you run them)
- ❌ Execute SQL queries
- ❌ Modify databases
- ❌ Provide hosted UI (runs locally)
- ❌ Auto-correct schemas

## Installation

### Prerequisites

- Node.js 18+ and Yarn

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd sql2nosql

# Install dependencies
yarn install

# Build all packages
yarn build
```

## Usage

### CLI

The CLI connects to Postgres, analyzes the schema, and writes JSON files:

```bash
# Build core + CLI
yarn build

# Option 1: configure via CLI flags
yarn analyze \
  --connection "postgres://<username>:<password>@<host>:<port>/<database>" \
  --schema public \
  --output ./output

# Option 2: use a config file (sql2nosql.config.json)
yarn analyze
```

**Example with real values:**
```bash
yarn analyze \
  --connection "postgres://postgres:mypassword@localhost:5432/devdb" \
  --schema public \
  --output ./output
```

This will produce:

- `output/index.html`: **Main entry point** - opens automatically in your browser
- `output/schema-analysis.json`: full SQL + NoSQL analysis
- `output/schema-analysis.html`: detailed overview table
- `output/table-<tableName>.json`: one JSON file per table
- `output/table-<tableName>.html`: one HTML page per table with:
  - `sqlTable`: columns, primary keys, uniques
  - `nosqlCollection`: proposed NoSQL collection definition

### CLI config file (optional)

Instead of passing flags every time, you can create a `sql2nosql.config.json`
in the directory where you run the command.

**Config template:** copy [`sql2nosql.config.example.json`](./sql2nosql.config.example.json) to `sql2nosql.config.json` and fill in values.

**Full config structure:**

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
  }
}
```

**Config file fields:**

| Field | Description |
|-------|-------------|
| `connection` | PostgreSQL connection string: `postgres://username:password@host:port/database` |
| `schema` | Postgres schema to analyze (default: `"public"`) |
| `output` | Directory for generated files: `analyze/`, `recommend/`, `view/`, `scripts/` (default: `"./output"`) |
| `llm.enabled` | Set `true` to enable LLM optimization recommendations (default: `false`) |
| `llm.apiKey` | OpenAI API key (or use `--llm-api-key` / `OPENAI_API_KEY` env var) |
| `llm.model` | OpenAI model, e.g. `gpt-4.1-mini` (default: `gpt-4`) |
| `mongodb.uri` | MongoDB connection string, e.g. `mongodb://user:pass@host:port` |
| `mongodb.database` | Target MongoDB database name for migration scripts (default: `"sql2nosql"`) |
| `mongodb.collectionPrefix` | Optional prefix for collection names (default: `""`) |

**Example with real values:**

```json
{
  "connection": "postgres://postgres:mypassword@localhost:5432/devdb",
  "schema": "public",
  "output": "./output",
  "llm": {
    "enabled": true,
    "apiKey": "sk-...",
    "model": "gpt-4.1-mini"
  },
  "mongodb": {
    "uri": "mongodb://admin:admin123@localhost:27017",
    "database": "devdb_mongo",
    "collectionPrefix": ""
  }
}
```

Then simply run:

```bash
yarn analyze
```

The tool will automatically:
1. Connect to your PostgreSQL database
2. Analyze all tables in the specified schema
3. Generate JSON and HTML files
4. Open `index.html` in your browser automatically

You can also point to a different config file:

```bash
yarn analyze --config ./path/to/other-config.json
```

**Note:** Flags always override config values if both are provided. The config file is ignored by git (already in `.gitignore`) to keep your credentials safe.

## Security

- **Never commit `sql2nosql.config.json`.** It contains credentials (Postgres/MongoDB/LLM API keys).
- Keep secrets in:
  - `sql2nosql.config.json` (ignored by git), or
  - environment variables (recommended for CI).

## Project Structure

```
sql2nosql/
├── packages/
│   ├── core/          # Core analysis library (@s2n/core)
│   │   ├── src/
│   │   │   ├── model.ts        # TypeScript domain models
│   │   │   ├── analyze.ts      # High-level analysis entrypoint
│   │   │   ├── sqlParser.ts    # SQL DDL parsing helpers
│   │   │   ├── nosqlMapping.ts # SQL → NoSQL mapping logic
│   │   │   └── index.ts        # Public API
│   │   └── package.json
│   │
│   └── cli/           # CLI tool (@s2n/cli)
│       ├── src/
│       │   └── index.ts        # sql2nosql CLI implementation
│       └── package.json
│
├── package.json       # Root workspace config
└── tsconfig.base.json # Shared TypeScript config
```

### Packages

- **`@s2n/core`**: Pure TypeScript library containing:
  - Domain models for SQL and NoSQL schemas
  - Analysis functions (SQL parsing → NoSQL mapping)
  - No database access, no side effects

- **`@s2n/cli`**: Command-line interface that:
  - Connects to PostgreSQL
  - Introspects tables/columns/constraints
  - Calls `@s2n/core` to build analysis results
  - Writes JSON files into the output directory

## Development

### Available Scripts

From the root directory:

```bash
# Building
yarn build            # Build core + CLI
yarn build:core       # Build core library only
yarn build:cli        # Build CLI only

# Analysis
yarn analyze          # Run CLI analysis (postgres connection required)
```

### Architecture Principles

- **Core logic** lives in `packages/core` (pure functions, no IO)
- **CLI** is thin (argument parsing + orchestration)
- **LLM logic** (when added) will be isolated and optional
- **Deterministic output** — same input always produces same output
- **Human-in-the-loop** — no auto-corrections or migrations

### TypeScript

- Shared base config: `tsconfig.base.json`
- Each package extends base with its own `tsconfig.json`
- Strict mode enabled
- Declaration files generated for `@s2n/core`

## Contributing

Contributions are welcome!

- For bugs or feature ideas, please open a **GitHub issue**.
- For code changes, see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.
- For larger changes, open an issue first and tag **@amide-init** to discuss the approach.

## License

MIT © amin uddin

## Roadmap

- [x] Core domain models and type definitions
- [x] SQL DDL / metadata parser (PostgreSQL, via information_schema)
- [x] NoSQL schema generation logic
- [x] CLI tool for DB introspection + JSON generation
- [ ] Insights and recommendations
- [ ] Optional LLM-powered explanations

---

**Note**: This tool is currently in early development (v0.1). The CLI and analysis pipeline are functional but the mapping rules and insights will evolve over time.
