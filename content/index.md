# sql2nosql

**Damru** — Analyze PostgreSQL schemas and generate NoSQL (MongoDB) design and migration scripts.

## Quick start

1. **Clone and install**
   ```bash
   git clone https://github.com/usedamru/sql2nosql.git
   cd sql2nosql
   yarn install
   yarn build
   ```
2. **Configure** — Copy `sql2nosql.config.example.json` to `sql2nosql.config.json` and set your Postgres `connection` and (optional) `mongodb` / `migration` options.
3. **Analyze** your Postgres schema:
   ```bash
   yarn analyze
   # or: npx sql2nosql analyze
   ```
4. **Run migrations** (Postgres → MongoDB, optional):
   ```bash
   cd packages/cli && node output/scripts/run-all.migrate.js
   ```

## Documentation

- [Run migrations](/run-migrations) — How to run migration scripts with Node
- [Generator checklist](/generator-checklist) — Migration script generator options and config

## Links

- [GitHub](https://github.com/usedamru/sql2nosql)
- [Live docs](https://usedamru.github.io/sql2nosql/) (GitHub Pages)
- Config: `sql2nosql.config.json` at project root
