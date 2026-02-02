#!/usr/bin/env node

import { Command } from "commander";
import { Client } from "pg";
import {
  buildAnalysisResult,
  type AnalysisResult,
  type NoSqlCollection,
  type SqlColumn,
  type SqlColumnType,
  type SqlForeignKey,
  type SqlSchema,
  type SqlTable,
} from "@s2n/core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { exec } from "node:child_process";

const program = new Command();

program
  .name("sql2nosql")
  .description("Analyze a SQL schema and propose a NoSQL design")
  .version("0.1.0");

program
  .command("analyze")
  .description("Connect to Postgres, analyze tables, and emit per-table JSON")
  .option(
    "--connection <connectionString>",
    "Postgres connection string, e.g. postgres://user:pass@host:5432/db",
  )
  .option(
    "--schema <schema>",
    "Postgres schema to analyze (default: public)",
    "public",
  )
  .option(
    "--output <dir>",
    "Output directory for JSON files (default: ./output)",
    "output",
  )
  .option(
    "--config <path>",
    "Path to JSON config file (default: ./sql2nosql.config.json)",
  )
  .action(async (opts) => {
    const configFromFile = loadConfig(opts.config);

    const connectionString: string =
      opts.connection ?? configFromFile.connection;
    const schema: string = opts.schema ?? configFromFile.schema ?? "public";
    const outputDir = resolvePath(
      process.cwd(),
      opts.output ?? configFromFile.output ?? "output",
    );

    if (!connectionString) {
      // eslint-disable-next-line no-console
      console.error(
        "Missing connection string. Provide --connection or set it in sql2nosql.config.json",
      );
      process.exit(1);
    }

    const client = new Client({ connectionString });
    await client.connect();

    try {
      const tables = await loadTables(client, schema);
      const foreignKeys = await loadForeignKeys(client, schema);

      const sqlSchema: SqlSchema = {
        tables,
        foreignKeys,
      };

      const analysis: AnalysisResult = buildAnalysisResult(sqlSchema);

      mkdirSync(outputDir, { recursive: true });

      // Global analysis file
      writeFileSync(
        join(outputDir, "schema-analysis.json"),
        JSON.stringify(analysis, null, 2),
        "utf8",
      );

      // Per-table files
      for (const table of analysis.sqlSchema.tables) {
        const collection = analysis.nosqlSchema.collections.find(
          (c) => c.name === table.name,
        );

        const perTable = {
          sqlTable: table,
          nosqlCollection: collection ?? null,
        };

        const fileName = `table-${table.name}.json`;
        writeFileSync(
          join(outputDir, fileName),
          JSON.stringify(perTable, null, 2),
          "utf8",
        );

        // Generate HTML for this table
        const htmlFileName = `table-${table.name}.html`;
        writeFileSync(
          join(outputDir, htmlFileName),
          generateTableHTML(table, collection ?? null, analysis.sqlSchema.foreignKeys),
          "utf8",
        );
      }

      // Generate overview HTML
      writeFileSync(
        join(outputDir, "schema-analysis.html"),
        generateOverviewHTML(analysis),
        "utf8",
      );

      // Generate index.html (main entry point)
      writeFileSync(
        join(outputDir, "index.html"),
        generateIndexHTML(analysis),
        "utf8",
      );

      // Basic CLI output
      const indexHtmlPath = join(outputDir, "index.html");
      // eslint-disable-next-line no-console
      console.log(
        `Analyzed ${analysis.sqlSchema.tables.length} tables from schema "${schema}". JSON and HTML written to ${outputDir}`,
      );
      
      // Auto-open browser
      openBrowser(indexHtmlPath);
    } finally {
      await client.end();
    }
  });

program.parseAsync(process.argv).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

function loadConfig(
  explicitPath?: string,
): { connection?: string; schema?: string; output?: string } {
  if (explicitPath) {
    const path = resolvePath(explicitPath);
    if (existsSync(path)) {
      return readConfigFile(path);
    }
    return {};
  }

  // Try current directory first
  const cwdPath = join(process.cwd(), "sql2nosql.config.json");
  if (existsSync(cwdPath)) {
    return readConfigFile(cwdPath);
  }

  // Try parent directory (in case running from packages/cli)
  const parentPath = join(process.cwd(), "..", "sql2nosql.config.json");
  if (existsSync(parentPath)) {
    return readConfigFile(parentPath);
  }

  // Try repo root (two levels up from packages/cli)
  const repoRootPath = join(process.cwd(), "..", "..", "sql2nosql.config.json");
  if (existsSync(repoRootPath)) {
    return readConfigFile(repoRootPath);
  }

  return {};
}

function readConfigFile(path: string): {
  connection?: string;
  schema?: string;
  output?: string;
} {
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as {
      connection?: string;
      schema?: string;
      output?: string;
    };
    return parsed ?? {};
  } catch {
    // eslint-disable-next-line no-console
    console.error(`Failed to read config from ${path}, ignoring it.`);
    return {};
  }
}

async function loadTables(client: Client, schema: string): Promise<SqlTable[]> {
  const tablesRes = await client.query<{
    table_name: string;
  }>(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $1
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
    `,
    [schema],
  );

  const tables: SqlTable[] = [];

  for (const row of tablesRes.rows) {
    const name = row.table_name;

    const columns = await loadColumns(client, schema, name);
    const primaryKey = await loadPrimaryKey(client, schema, name);
    const uniqueConstraints = await loadUniqueConstraints(client, schema, name);

    tables.push({
      name,
      columns,
      primaryKey,
      uniqueConstraints,
    });
  }

  return tables;
}

async function loadColumns(
  client: Client,
  schema: string,
  table: string,
): Promise<SqlColumn[]> {
  const res = await client.query<{
    column_name: string;
    data_type: string;
    is_nullable: "YES" | "NO";
    column_default: string | null;
  }>(
    `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = $2
    ORDER BY ordinal_position
    `,
    [schema, table],
  );

  return res.rows.map((row) => ({
    name: row.column_name,
    type: mapPostgresType(row.data_type),
    nullable: row.is_nullable === "YES",
    isPrimaryKey: false, // will be refined from constraints
    isUnique: false, // will be refined from constraints
    hasDefault: row.column_default != null,
  }));
}

async function loadPrimaryKey(
  client: Client,
  schema: string,
  table: string,
): Promise<string[]> {
  const res = await client.query<{ column_name: string }>(
    `
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = $1
      AND tc.table_name = $2
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position
    `,
    [schema, table],
  );

  return res.rows.map((r) => r.column_name);
}

async function loadUniqueConstraints(
  client: Client,
  schema: string,
  table: string,
): Promise<string[][]> {
  const res = await client.query<{
    constraint_name: string;
    column_name: string;
  }>(
    `
    SELECT tc.constraint_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = $1
      AND tc.table_name = $2
      AND tc.constraint_type = 'UNIQUE'
    ORDER BY tc.constraint_name, kcu.ordinal_position
    `,
    [schema, table],
  );

  const byConstraint = new Map<string, string[]>();
  for (const row of res.rows) {
    const list = byConstraint.get(row.constraint_name) ?? [];
    list.push(row.column_name);
    byConstraint.set(row.constraint_name, list);
  }

  return Array.from(byConstraint.values());
}

async function loadForeignKeys(
  client: Client,
  schema: string,
): Promise<SqlForeignKey[]> {
  const res = await client.query<{
    constraint_name: string;
    from_table: string;
    from_column: string;
    to_table: string;
    to_column: string;
  }>(
    `
    SELECT
      tc.constraint_name,
      kcu.table_name AS from_table,
      kcu.column_name AS from_column,
      ccu.table_name AS to_table,
      ccu.column_name AS to_column
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = $1
    `,
    [schema],
  );

  const fks: SqlForeignKey[] = res.rows.map((row) => ({
    name: row.constraint_name,
    fromTable: row.from_table,
    fromColumn: row.from_column,
    toTable: row.to_table,
    toColumn: row.to_column,
    cardinality: "one-to-many",
  }));

  return fks;
}

function mapPostgresType(dataType: string): SqlColumnType {
  const t = dataType.toLowerCase();
  if (t.includes("integer") || t === "int4") return "integer";
  if (t === "bigint" || t === "int8") return "bigint";
  if (t === "numeric" || t === "decimal") return "numeric";
  if (t === "boolean" || t === "bool") return "boolean";
  if (t.startsWith("timestamp with time zone")) return "timestamptz";
  if (t.startsWith("timestamp")) return "timestamp";
  if (t === "date") return "date";
  if (t === "text") return "text";
  if (t.startsWith("character varying")) return "varchar";
  if (t === "uuid") return "uuid";
  if (t === "json") return "json";
  if (t === "jsonb") return "jsonb";

  return "unknown";
}

function generateOverviewHTML(analysis: AnalysisResult): string {
  const tables = analysis.sqlSchema.tables;
  const fks = analysis.sqlSchema.foreignKeys;
  const collections = analysis.nosqlSchema.collections;

  const tableRows = tables
    .map(
      (table) => `
    <tr>
      <td><a href="table-${table.name}.html">${table.name}</a></td>
      <td>${table.columns.length}</td>
      <td>${table.primaryKey.length > 0 ? table.primaryKey.join(", ") : "—"}</td>
      <td>${fks.filter((fk) => fk.fromTable === table.name).length}</td>
      <td>${collections.find((c) => c.name === table.name)?.fields.length ?? 0}</td>
    </tr>
  `,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SQL → NoSQL Schema Analysis</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f172a;
      color: #e5e7eb;
      padding: 24px;
      line-height: 1.6;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #38bdf8; margin-bottom: 8px; }
    .subtitle { color: #9ca3af; margin-bottom: 24px; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: rgba(15, 23, 42, 0.9);
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid rgba(148, 163, 184, 0.3);
    }
    th {
      background: rgba(56, 189, 248, 0.1);
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #38bdf8;
      border-bottom: 1px solid rgba(148, 163, 184, 0.3);
    }
    td {
      padding: 12px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    }
    tr:hover { background: rgba(56, 189, 248, 0.05); }
    a {
      color: #38bdf8;
      text-decoration: none;
    }
    a:hover { text-decoration: underline; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: rgba(15, 23, 42, 0.9);
      padding: 16px;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.3);
    }
    .stat-value { font-size: 24px; font-weight: 600; color: #38bdf8; }
    .stat-label { color: #9ca3af; font-size: 14px; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>SQL → NoSQL Schema Analysis</h1>
    <p class="subtitle">Overview of all tables and their NoSQL mappings</p>
    
    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">${tables.length}</div>
        <div class="stat-label">Tables</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${fks.length}</div>
        <div class="stat-label">Foreign Keys</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${collections.length}</div>
        <div class="stat-label">NoSQL Collections</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Table Name</th>
          <th>Columns</th>
          <th>Primary Key</th>
          <th>Foreign Keys</th>
          <th>NoSQL Fields</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

function generateTableHTML(
  table: SqlTable,
  collection: NoSqlCollection | null,
  foreignKeys: SqlForeignKey[],
): string {
  const tableFKs = foreignKeys.filter((fk) => fk.fromTable === table.name);
  const refFKs = foreignKeys.filter((fk) => fk.toTable === table.name);

  const columnsHTML = table.columns
    .map(
      (col) => `
    <tr>
      <td><strong>${col.name}</strong></td>
      <td><code>${col.type}</code></td>
      <td>${col.nullable ? "✓" : "✗"}</td>
      <td>${col.isPrimaryKey ? "🔑" : ""} ${col.isUnique ? "🔒" : ""}</td>
    </tr>
  `,
    )
    .join("");

  const nosqlFieldsHTML =
    collection?.fields
      .map(
        (field) => `
    <tr>
      <td><strong>${field.name}</strong></td>
      <td><code>${field.type}</code></td>
      <td>${field.optional ? "✓" : "✗"}</td>
      <td>${field.refCollection ? `→ ${field.refCollection}` : field.description ?? ""}</td>
    </tr>
  `,
      )
      .join("") ?? "<tr><td colspan='4'>No NoSQL collection mapped</td></tr>";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${table.name} - SQL → NoSQL Analysis</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f172a;
      color: #e5e7eb;
      padding: 24px;
      line-height: 1.6;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    .header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.3);
    }
    h1 { color: #38bdf8; margin-bottom: 8px; }
    .back-link {
      color: #9ca3af;
      text-decoration: none;
      font-size: 14px;
    }
    .back-link:hover { color: #38bdf8; }
    .section {
      margin-bottom: 32px;
      background: rgba(15, 23, 42, 0.9);
      border-radius: 8px;
      padding: 20px;
      border: 1px solid rgba(148, 163, 184, 0.3);
    }
    h2 {
      color: #38bdf8;
      margin-bottom: 16px;
      font-size: 18px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      background: rgba(56, 189, 248, 0.1);
      padding: 10px;
      text-align: left;
      font-weight: 600;
      color: #38bdf8;
      font-size: 14px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.3);
    }
    td {
      padding: 10px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      font-size: 14px;
    }
    code {
      background: rgba(56, 189, 248, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: ui-monospace, monospace;
      font-size: 13px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
    }
    .info-item {
      margin-bottom: 8px;
    }
    .info-label { color: #9ca3af; font-size: 12px; }
    .info-value { color: #e5e7eb; margin-top: 2px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <a href="schema-analysis.html" class="back-link">← Back to Overview</a>
      <h1>Table: ${table.name}</h1>
    </div>

    <div class="grid">
      <div class="section">
        <h2>SQL Table Structure</h2>
        <div class="info-item">
          <div class="info-label">Primary Key</div>
          <div class="info-value">${table.primaryKey.length > 0 ? table.primaryKey.join(", ") : "None"}</div>
        </div>
        ${table.uniqueConstraints.length > 0 ? `
        <div class="info-item">
          <div class="info-label">Unique Constraints</div>
          <div class="info-value">${table.uniqueConstraints.map((uc) => uc.join(", ")).join("; ")}</div>
        </div>
        ` : ""}
        <table style="margin-top: 16px;">
          <thead>
            <tr>
              <th>Column</th>
              <th>Type</th>
              <th>Nullable</th>
              <th>Constraints</th>
            </tr>
          </thead>
          <tbody>
            ${columnsHTML}
          </tbody>
        </table>
      </div>

      <div class="section">
        <h2>NoSQL Collection Proposal</h2>
        ${collection ? `
        <div class="info-item">
          <div class="info-label">Collection Name</div>
          <div class="info-value">${collection.name}</div>
        </div>
        ${collection.description ? `
        <div class="info-item">
          <div class="info-label">Description</div>
          <div class="info-value">${collection.description}</div>
        </div>
        ` : ""}
        ` : "<p style='color: #9ca3af;'>No collection mapping available</p>"}
        ${collection ? `
        <table style="margin-top: 16px;">
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Optional</th>
              <th>Reference/Notes</th>
            </tr>
          </thead>
          <tbody>
            ${nosqlFieldsHTML}
          </tbody>
        </table>
        ` : ""}
      </div>
    </div>

    ${tableFKs.length > 0 || refFKs.length > 0 ? `
    <div class="section">
      <h2>Relationships</h2>
      ${tableFKs.length > 0 ? `
      <h3 style="color: #9ca3af; font-size: 14px; margin-bottom: 8px; margin-top: 16px;">Outgoing References</h3>
      <ul style="list-style: none; padding-left: 0;">
        ${tableFKs.map((fk) => `<li style="margin-bottom: 8px;"><code>${fk.fromColumn}</code> → <a href="table-${fk.toTable}.html" style="color: #38bdf8;">${fk.toTable}.${fk.toColumn}</a></li>`).join("")}
      </ul>
      ` : ""}
      ${refFKs.length > 0 ? `
      <h3 style="color: #9ca3af; font-size: 14px; margin-bottom: 8px; margin-top: 16px;">Incoming References</h3>
      <ul style="list-style: none; padding-left: 0;">
        ${refFKs.map((fk) => `<li style="margin-bottom: 8px;"><a href="table-${fk.fromTable}.html" style="color: #38bdf8;">${fk.fromTable}.${fk.fromColumn}</a> → <code>${fk.toColumn}</code></li>`).join("")}
      </ul>
      ` : ""}
    </div>
    ` : ""}
  </div>
</body>
</html>`;
}

function generateIndexHTML(analysis: AnalysisResult): string {
  const tables = analysis.sqlSchema.tables;
  const fks = analysis.sqlSchema.foreignKeys;
  const collections = analysis.nosqlSchema.collections;

  const tableCards = tables
    .map(
      (table) => {
        const collection = collections.find((c) => c.name === table.name);
        const tableFKs = fks.filter((fk) => fk.fromTable === table.name);
        return `
    <div class="card">
      <div class="card-header">
        <h3><a href="table-${table.name}.html">${table.name}</a></h3>
        <span class="badge">${table.columns.length} columns</span>
      </div>
      <div class="card-body">
        <div class="card-row">
          <span class="label">SQL Columns:</span>
          <span class="value">${table.columns.length}</span>
        </div>
        <div class="card-row">
          <span class="label">NoSQL Fields:</span>
          <span class="value">${collection?.fields.length ?? 0}</span>
        </div>
        <div class="card-row">
          <span class="label">Foreign Keys:</span>
          <span class="value">${tableFKs.length}</span>
        </div>
        ${table.primaryKey.length > 0 ? `
        <div class="card-row">
          <span class="label">Primary Key:</span>
          <span class="value"><code>${table.primaryKey.join(", ")}</code></span>
        </div>
        ` : ""}
      </div>
      <div class="card-footer">
        <a href="table-${table.name}.html" class="btn">View Details →</a>
      </div>
    </div>
  `;
      },
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SQL → NoSQL Analyzer - Results</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #e5e7eb;
      padding: 32px 24px;
      min-height: 100vh;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    .header {
      text-align: center;
      margin-bottom: 48px;
      padding-bottom: 32px;
      border-bottom: 2px solid rgba(56, 189, 248, 0.2);
    }
    h1 {
      font-size: 42px;
      color: #38bdf8;
      margin-bottom: 12px;
      font-weight: 700;
    }
    .subtitle {
      color: #9ca3af;
      font-size: 18px;
      margin-bottom: 24px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }
    .stat-card {
      background: rgba(15, 23, 42, 0.8);
      padding: 24px;
      border-radius: 12px;
      border: 1px solid rgba(56, 189, 248, 0.2);
      text-align: center;
      transition: transform 0.2s, border-color 0.2s;
    }
    .stat-card:hover {
      transform: translateY(-2px);
      border-color: rgba(56, 189, 248, 0.4);
    }
    .stat-value {
      font-size: 36px;
      font-weight: 700;
      color: #38bdf8;
      margin-bottom: 8px;
    }
    .stat-label {
      color: #9ca3af;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .quick-links {
      display: flex;
      gap: 12px;
      justify-content: center;
      margin-bottom: 40px;
      flex-wrap: wrap;
    }
    .quick-link {
      background: linear-gradient(135deg, #38bdf8, #6366f1);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 4px 12px rgba(56, 189, 248, 0.3);
    }
    .quick-link:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(56, 189, 248, 0.4);
    }
    .tables-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 24px;
    }
    .card {
      background: rgba(15, 23, 42, 0.9);
      border-radius: 12px;
      border: 1px solid rgba(148, 163, 184, 0.3);
      overflow: hidden;
      transition: transform 0.2s, border-color 0.2s;
    }
    .card:hover {
      transform: translateY(-4px);
      border-color: rgba(56, 189, 248, 0.5);
    }
    .card-header {
      padding: 20px;
      background: rgba(56, 189, 248, 0.1);
      border-bottom: 1px solid rgba(148, 163, 184, 0.3);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-header h3 {
      margin: 0;
      font-size: 20px;
    }
    .card-header a {
      color: #38bdf8;
      text-decoration: none;
    }
    .card-header a:hover {
      text-decoration: underline;
    }
    .badge {
      background: rgba(56, 189, 248, 0.2);
      color: #38bdf8;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    .card-body {
      padding: 20px;
    }
    .card-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    }
    .card-row:last-child {
      border-bottom: none;
    }
    .label {
      color: #9ca3af;
      font-size: 14px;
    }
    .value {
      color: #e5e7eb;
      font-weight: 600;
      font-size: 14px;
    }
    code {
      background: rgba(56, 189, 248, 0.1);
      padding: 2px 8px;
      border-radius: 4px;
      font-family: ui-monospace, monospace;
      font-size: 12px;
      color: #38bdf8;
    }
    .card-footer {
      padding: 16px 20px;
      background: rgba(15, 23, 42, 0.5);
      border-top: 1px solid rgba(148, 163, 184, 0.2);
    }
    .btn {
      display: inline-block;
      color: #38bdf8;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      transition: color 0.2s;
    }
    .btn:hover {
      color: #60a5fa;
    }
    .footer {
      margin-top: 48px;
      padding-top: 32px;
      border-top: 1px solid rgba(148, 163, 184, 0.3);
      text-align: center;
      color: #9ca3af;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SQL → NoSQL Analyzer</h1>
      <p class="subtitle">Schema Analysis Results</p>
      
      <div class="stats">
        <div class="stat-card">
          <div class="stat-value">${tables.length}</div>
          <div class="stat-label">Tables</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${fks.length}</div>
          <div class="stat-label">Relationships</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${collections.length}</div>
          <div class="stat-label">NoSQL Collections</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${tables.reduce((sum, t) => sum + t.columns.length, 0)}</div>
          <div class="stat-label">Total Columns</div>
        </div>
      </div>

      <div class="quick-links">
        <a href="schema-analysis.html" class="quick-link">📊 Full Overview</a>
        <a href="schema-analysis.json" class="quick-link" download>📥 Download JSON</a>
      </div>
    </div>

    <h2 style="color: #38bdf8; margin-bottom: 24px; font-size: 24px;">All Tables</h2>
    <div class="tables-grid">
      ${tableCards}
    </div>

    <div class="footer">
      <p>Generated by SQL → NoSQL Analyzer v0.1</p>
      <p style="margin-top: 8px;">Click on any table to view detailed SQL and NoSQL mappings</p>
    </div>
  </div>
</body>
</html>`;
}

function openBrowser(filePath: string): void {
  const platform = process.platform;
  let command: string;

  // Convert to file:// URL for cross-platform compatibility
  const fileUrl = `file://${filePath}`;

  if (platform === "darwin") {
    // macOS
    command = `open "${fileUrl}"`;
  } else if (platform === "win32") {
    // Windows
    command = `start "" "${fileUrl}"`;
  } else {
    // Linux and others
    command = `xdg-open "${fileUrl}"`;
  }

  exec(command, (error) => {
    if (error) {
      // eslint-disable-next-line no-console
      console.log(`Could not auto-open browser. Please open ${filePath} manually.`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`Opened ${filePath} in your browser.`);
    }
  });
}

