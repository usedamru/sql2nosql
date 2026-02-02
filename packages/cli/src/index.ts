#!/usr/bin/env node

import { Command } from "commander";
import { Client } from "pg";
import {
  buildAnalysisResult,
  type AnalysisResult,
  type SqlColumn,
  type SqlColumnType,
  type SqlForeignKey,
  type SqlSchema,
  type SqlTable,
} from "@s2n/core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";

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
      }

      // Basic CLI output
      // eslint-disable-next-line no-console
      console.log(
        `Analyzed ${analysis.sqlSchema.tables.length} tables from schema "${schema}". JSON written to ${outputDir}`,
      );
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

