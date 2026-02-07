#!/usr/bin/env node

import { Command } from "commander";
import { Client } from "pg";
import chalk from "chalk";
import {
  buildAnalysisResult,
  type AnalysisResult,
  type NoSqlCollection,
  type NoSqlField,
  type NoSqlFieldType,
  type NoSqlSchema,
  type SqlColumn,
  type SqlColumnType,
  type SqlForeignKey,
  type SqlSchema,
  type SqlTable,
  type LLMRecommendations,
} from "@s2n/core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { exec } from "node:child_process";
import {
  generateMigrationRunnerScript,
  generateMigrationScriptForCollection,
} from "./scripts";
import {
  generateIndexHTML,
  generateOverviewHTML,
  generateTableHTML,
} from "./view";

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
  .option("--llm", "Enable LLM-powered optimization recommendations")
  .option(
    "--llm-api-key <key>",
    "OpenAI API key (or set OPENAI_API_KEY env var)",
  )
  .option(
    "--llm-model <model>",
    "OpenAI model to use (default: gpt-4)",
    "gpt-4",
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
        chalk.red("Missing connection string. Provide --connection or set it in sql2nosql.config.json"),
      );
      process.exit(1);
    }

    // eslint-disable-next-line no-console
      console.log(chalk.cyan.bold("sql2nosql") + chalk.dim(" · analyzing schema ") + chalk.cyan(`"${schema}"`) + "\n");

    const client = new Client({ connectionString });
    await client.connect();

    try {
      const tables = await loadTables(client, schema);
      const foreignKeys = await loadForeignKeys(client, schema);

      const sqlSchema: SqlSchema = {
        tables,
        foreignKeys,
      };

      const baseAnalysis: AnalysisResult = buildAnalysisResult(sqlSchema);
      let optimizedAnalysis: AnalysisResult | undefined;

      // LLM recommendations (optional): enable if --llm passed or config has llm.enabled (and flag not explicitly off)
      const enableLLM =
        opts.llm === true ||
        (opts.llm !== false && configFromFile.llm?.enabled === true);
      if (enableLLM) {
        const apiKey =
          opts.llmApiKey ??
          configFromFile.llm?.apiKey ??
          process.env.OPENAI_API_KEY;
        const model = opts.llmModel ?? configFromFile.llm?.model ?? "gpt-4";

        if (!apiKey) {
          // eslint-disable-next-line no-console
          console.error(
            chalk.red("LLM enabled but no API key provided. Set --llm-api-key, OPENAI_API_KEY env var, or llm.apiKey in config."),
          );
          process.exit(1);
        }

        // eslint-disable-next-line no-console
        console.log(chalk.cyan("Generating LLM optimization recommendations..."));
        try {
          // Dynamic import to avoid requiring @s2n/llm when not used.
          // Cast to any so this file doesn't depend on @s2n/llm types at compile time.
          const llmModule: any = await import("@s2n/llm");
          if (!llmModule || !llmModule.OpenAIProvider) {
            throw new Error("Cannot find module '@s2n/llm'. Run 'yarn install' and 'yarn build:llm'.");
          }
          const { OpenAIProvider } = llmModule;
          const llmProvider = new OpenAIProvider({
            apiKey,
            model,
            temperature: 0.3,
            maxTokens: 2000,
          });

          const recommendations = await llmProvider.generateRecommendations(
            sqlSchema,
            baseAnalysis.nosqlSchema,
          );

          const optimizedNoSqlSchema = applyLLMRecommendationsToNoSqlSchema(
            baseAnalysis.nosqlSchema,
            sqlSchema,
            recommendations,
          );

          optimizedAnalysis = {
            ...baseAnalysis,
            nosqlSchema: optimizedNoSqlSchema,
            llmRecommendations: recommendations,
          };

          // eslint-disable-next-line no-console
          console.log(
            chalk.green(`Generated ${recommendations.embeddings.length} embedding recommendations and ${recommendations.insights.length} insights.`),
          );
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes("Cannot find module")
          ) {
            // eslint-disable-next-line no-console
            console.error(
              chalk.red("LLM package not found. Run 'yarn install' and 'yarn build:llm' to enable LLM features."),
            );
          } else {
            // eslint-disable-next-line no-console
            console.warn(
              chalk.yellow(`LLM recommendations failed: ${error instanceof Error ? error.message : String(error)}. Continuing with deterministic analysis only.`),
            );
          }
        }
      }

      mkdirSync(outputDir, { recursive: true });

      const analyzeDir = join(outputDir, "analyze");
      const recommendDir = join(outputDir, "recommend");
      const viewDir = join(outputDir, "view");

      mkdirSync(analyzeDir, { recursive: true });
      mkdirSync(viewDir, { recursive: true });
      if (optimizedAnalysis) {
        mkdirSync(recommendDir, { recursive: true });
      }

      // Write deterministic analysis (without LLM) to analyze/
      writeFileSync(
        join(analyzeDir, "schema-analysis.json"),
        JSON.stringify(baseAnalysis, null, 2),
        "utf8",
      );

      for (const table of baseAnalysis.sqlSchema.tables) {
        const collection = baseAnalysis.nosqlSchema.collections.find(
          (c) => c.name === table.name,
        );

        const perTable = {
          sqlTable: table,
          nosqlCollection: collection ?? null,
        };

        const fileName = `table-${table.name}.json`;
        writeFileSync(
          join(analyzeDir, fileName),
          JSON.stringify(perTable, null, 2),
          "utf8",
        );
      }

      // If we have an optimized schema, write it to recommend/
      const analysisForHtml: AnalysisResult = optimizedAnalysis ?? baseAnalysis;

      if (optimizedAnalysis) {
        writeFileSync(
          join(recommendDir, "schema-analysis.json"),
          JSON.stringify(optimizedAnalysis, null, 2),
          "utf8",
        );

        for (const table of optimizedAnalysis.sqlSchema.tables) {
          const collection = optimizedAnalysis.nosqlSchema.collections.find(
            (c) => c.name === table.name,
          );

          const perTable = {
            sqlTable: table,
            nosqlCollection: collection ?? null,
          };

          const fileName = `table-${table.name}.json`;
          writeFileSync(
            join(recommendDir, fileName),
            JSON.stringify(perTable, null, 2),
            "utf8",
          );
        }
      }

      // Generate migration scripts under scripts/
      const scriptsDir = join(outputDir, "scripts");
      mkdirSync(scriptsDir, { recursive: true });

      const collectionsForScripts = analysisForHtml.nosqlSchema.collections;

      // Build dependency map for scripts
      const allNames = new Set(collectionsForScripts.map((c) => c.name));
      const depsMap = new Map<string, Set<string>>();
      for (const collection of collectionsForScripts) {
        const deps = new Set<string>();
        function visitFields(fields: NoSqlField[]) {
          for (const field of fields) {
            if (field.type === "object") {
              const candidates = new Set<string>();
              candidates.add(field.name);
              candidates.add(`${field.name}s`);
              if (field.name.endsWith("s")) {
                candidates.add(field.name.slice(0, -1));
              }
              for (const cand of candidates) {
                if (allNames.has(cand) && cand !== collection.name) {
                  deps.add(cand);
                }
              }
              if (field.fields) {
                visitFields(field.fields);
              }
            }
          }
        }
        visitFields(collection.fields ?? []);
        depsMap.set(collection.name, deps);
      }

      for (const collection of collectionsForScripts) {
        const deps = depsMap.get(collection.name) ?? new Set();
        const sqlTable = analysisForHtml.sqlSchema.tables.find(
          (t) => t.name === collection.name,
        );
        const tableFks = analysisForHtml.sqlSchema.foreignKeys.filter(
          (fk) => fk.fromTable === collection.name,
        );
        const scriptSource = generateMigrationScriptForCollection(
          collection,
          Array.from(deps),
          sqlTable,
          tableFks,
        );
        const scriptFileName = `${collection.name}.migrate.js`;
        writeFileSync(join(scriptsDir, scriptFileName), scriptSource, "utf8");
      }

      const runnerSource = generateMigrationRunnerScript(collectionsForScripts);
      writeFileSync(join(scriptsDir, "run-all.migrate.js"), runnerSource, "utf8");

      // Generate HTML views under view/
      for (const table of analysisForHtml.sqlSchema.tables) {
        const collection = analysisForHtml.nosqlSchema.collections.find(
          (c) => c.name === table.name,
        );

        const htmlFileName = `table-${table.name}.html`;
        const tableRecommendations = analysisForHtml.llmRecommendations?.embeddings.filter(
          (r) => r.collection === table.name,
        );
        writeFileSync(
          join(viewDir, htmlFileName),
          generateTableHTML(
            table,
            collection ?? null,
            analysisForHtml.sqlSchema.foreignKeys,
            tableRecommendations,
            analysisForHtml.llmRecommendations?.insights.filter(
              (i) => i.collection === table.name,
            ),
          ),
          "utf8",
        );
      }

      // Overview + index for the selected analysis (optimized if available)
      writeFileSync(
        join(viewDir, "schema-analysis.html"),
        generateOverviewHTML(analysisForHtml),
        "utf8",
      );

      writeFileSync(
        join(viewDir, "index.html"),
        generateIndexHTML(analysisForHtml),
        "utf8",
      );

      // Basic CLI output
      const indexHtmlPath = join(viewDir, "index.html");
      // eslint-disable-next-line no-console
      console.log(
        chalk.green("✓") +
          " " +
          chalk.bold(`Analyzed ${baseAnalysis.sqlSchema.tables.length} tables`) +
          chalk.dim(` from schema "${schema}".`) +
          "\n  " +
          chalk.dim(`JSON: ${join(outputDir, "analyze")}`) +
          (optimizedAnalysis ? chalk.dim(` | ${join(outputDir, "recommend")}`) : "") +
          "\n  " +
          chalk.dim(`HTML: ${join(outputDir, "view")}`),
      );
      
      // Auto-open browser
      openBrowser(indexHtmlPath);
    } finally {
      await client.end();
    }
  });

program.parseAsync(process.argv).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(chalk.red("Error:"), err);
  process.exit(1);
});

function loadConfig(
  explicitPath?: string,
): {
  connection?: string;
  schema?: string;
  output?: string;
  llm?: {
    enabled?: boolean;
    apiKey?: string;
    model?: string;
  };
} {
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
  llm?: {
    enabled?: boolean;
    apiKey?: string;
    model?: string;
  };
} {
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as {
      connection?: string;
      schema?: string;
      output?: string;
      llm?: {
        enabled?: boolean;
        apiKey?: string;
        model?: string;
      };
    };
    return parsed ?? {};
  } catch {
    // eslint-disable-next-line no-console
    console.error(chalk.yellow(`Failed to read config from ${path}, ignoring it.`));
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

/**
 * Apply LLM embedding recommendations to the NoSQL schema.
 *
 * This keeps the deterministic mapping as a base, then:
 * - augments field descriptions with LLM reasoning
 * - optionally adds synthetic embedded fields for partial/full/hybrid strategies
 */
function applyLLMRecommendationsToNoSqlSchema(
  baseSchema: NoSqlSchema,
  sqlSchema: SqlSchema,
  llm: LLMRecommendations | undefined,
): NoSqlSchema {
  if (!llm || llm.embeddings.length === 0) {
    return baseSchema;
  }

  const collections = new Map<string, NoSqlCollection>();
  for (const collection of baseSchema.collections) {
    collections.set(collection.name, {
      ...collection,
      fields: collection.fields.map((f) => ({ ...f })),
    });
  }

  for (const rec of llm.embeddings) {
    const collection = collections.get(rec.collection);
    if (!collection) continue;

    // Try to find the referenced table.
    // 1) Prefer real FK metadata if present.
    const fk = sqlSchema.foreignKeys.find(
      (candidate) =>
        candidate.fromTable === rec.collection && candidate.fromColumn === rec.field,
    );

    let referencedTable = fk
      ? sqlSchema.tables.find((t) => t.name === fk.toTable)
      : undefined;

    // 2) If there's no FK (common in legacy schemas), infer table name from field.
    //    e.g. album.artistid -> artist, album.ArtistId -> artist
    if (!referencedTable) {
      const baseName = rec.field.replace(/_id$/i, "").replace(/id$/i, "");
      if (baseName) {
        const lowerBase = baseName.toLowerCase();
        referencedTable =
          sqlSchema.tables.find((t) => t.name.toLowerCase() === lowerBase) ??
          sqlSchema.tables.find((t) => t.name.toLowerCase() === `${lowerBase}s`) ??
          sqlSchema.tables.find((t) => t.name.toLowerCase() === `${lowerBase}es`);
      }
    }

    // Derive a nested object field name from the FK field, e.g. artist_id -> artist
    const baseName = rec.field.replace(/_id$/i, "").replace(/Id$/i, "");
    const nestedName = baseName || `${rec.field}_obj`;

    const existing = collection.fields.find((f) => f.name === nestedName);

    let nestedFields: NoSqlField[] | undefined;

    if (referencedTable) {
      // Start from LLM-suggested fields if present, otherwise all columns.
      const baseFieldNames =
        rec.suggestedFields && rec.suggestedFields.length > 0
          ? rec.suggestedFields
          : referencedTable.columns.map((c) => c.name);

      // Ensure id/PK columns are always included as part of the partial view.
      const idLikeColumns = referencedTable.columns
        .map((c) => c.name)
        .filter((name) => /id$/i.test(name));

      const allFieldNames = Array.from(
        new Set<string>([...baseFieldNames, ...idLikeColumns]),
      );

      nestedFields = allFieldNames.map<NoSqlField>((fieldName) => {
        const col = referencedTable.columns.find(
          (c) => c.name.toLowerCase() === fieldName.toLowerCase(),
        );

        const fieldType: NoSqlFieldType = col
          ? mapSqlColumnTypeToNoSqlFieldType(col.type)
          : "unknown";

        return {
          name: fieldName,
          type: fieldType,
          optional: true,
        };
      });
    }

    if (existing) {
      // If the field already exists and is an object, merge/extend nested fields.
      if (existing.type === "object" && nestedFields && nestedFields.length > 0) {
        const existingAny = existing as any;
        const existingNames = new Set(
          (existingAny.fields ?? []).map((f: NoSqlField) => f.name),
        );
        const mergedFields = [...(existingAny.fields ?? [])];
        for (const nf of nestedFields) {
          if (!existingNames.has(nf.name)) {
            mergedFields.push(nf);
            existingNames.add(nf.name);
          }
        }
        existingAny.fields = mergedFields;
      }
    } else {
      collection.fields.push({
        name: nestedName,
        type: "object",
        optional: true,
        ...(nestedFields && nestedFields.length > 0 ? { fields: nestedFields } : {}),
      } as any);
    }
  }

  return { collections: Array.from(collections.values()) };
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

function mapSqlColumnTypeToNoSqlFieldType(type: SqlColumnType): NoSqlFieldType {
  switch (type) {
    case "integer":
    case "bigint":
    case "numeric":
    case "serial":
    case "bigserial":
      return "number";
    case "boolean":
      return "boolean";
    case "timestamp":
    case "timestamptz":
    case "date":
      return "date";
    case "text":
    case "varchar":
    case "uuid":
      return "string";
    case "json":
    case "jsonb":
      return "object";
    default:
      return "unknown";
  }
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
      console.log(chalk.yellow(`Could not auto-open browser. Please open ${filePath} manually.`));
    } else {
      // eslint-disable-next-line no-console
      console.log(chalk.green(`Opened ${filePath} in your browser.`));
    }
  });
}

