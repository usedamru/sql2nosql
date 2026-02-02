import type {
  SqlColumn,
  SqlColumnType,
  SqlForeignKey,
  SqlSchema,
  SqlTable,
} from "./model";

// Very small, deterministic subset parser for Postgres-style DDL.
// Handles:
// - CREATE TABLE <name> (...);
// - column lines: name type [constraints...]
// - PRIMARY KEY (col, ...)
// - FOREIGN KEY (col) REFERENCES other(col)

const TYPE_MAP: Record<string, SqlColumnType> = {
  integer: "integer",
  int: "integer",
  bigint: "bigint",
  serial: "serial",
  bigserial: "bigserial",
  numeric: "numeric",
  decimal: "numeric",
  text: "text",
  varchar: "varchar",
  boolean: "boolean",
  bool: "boolean",
  timestamp: "timestamp",
  timestamptz: "timestamptz",
  date: "date",
  json: "json",
  jsonb: "jsonb",
  uuid: "uuid",
};

function normalizeWhitespace(input: string): string {
  return input
    .replace(/--.*$/gm, "") // strip line comments
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSqlSchema(sql: string): SqlSchema {
  const cleaned = sql.trim();
  if (!cleaned) {
    return { tables: [], foreignKeys: [] };
  }

  const statements = cleaned
    .split(/;/)
    .map((s) => s.trim())
    .filter(Boolean);

  const tables: SqlTable[] = [];
  const foreignKeys: SqlForeignKey[] = [];

  for (const stmt of statements) {
    const match = /^CREATE\s+TABLE\s+("?[\w.]+"?)\s*\(([\s\S]*)\)$/i.exec(
      stmt.trim().replace(/;$/, ""),
    );
    if (!match) continue;

    const tableName = stripQuotes(match[1]);
    const body = match[2].trim();
    const lines = splitColumns(body);

    const columns: SqlColumn[] = [];
    const primaryKey: string[] = [];
    const uniqueConstraints: string[][] = [];

    for (const rawLine of lines) {
      const line = normalizeWhitespace(rawLine);
      if (!line) continue;

      const upper = line.toUpperCase();
      if (upper.startsWith("PRIMARY KEY")) {
        const cols = extractColumnList(line);
        primaryKey.push(...cols);
        continue;
      }

      if (upper.startsWith("UNIQUE")) {
        const cols = extractColumnList(line);
        uniqueConstraints.push(cols);
        continue;
      }

      if (upper.startsWith("FOREIGN KEY")) {
        const fk = parseTableLevelForeignKey(line, tableName);
        if (fk) foreignKeys.push(fk);
        continue;
      }

      const col = parseColumnLine(line, tableName);
      if (col) columns.push(col);
    }

    tables.push({
      name: tableName,
      columns,
      primaryKey,
      uniqueConstraints,
    });
  }

  return { tables, foreignKeys };
}

function splitColumns(body: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function stripQuotes(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function mapType(token: string): SqlColumnType {
  const base = token.toLowerCase().replace(/\(.*/, "");
  return TYPE_MAP[base] ?? "unknown";
}

function parseColumnLine(line: string, tableName: string): SqlColumn | null {
  const tokens = line.split(" ").filter(Boolean);
  if (tokens.length < 2) return null;

  const name = stripQuotes(tokens[0]);
  const typeToken = tokens[1];
  const type = mapType(typeToken);

  const rest = tokens.slice(2).join(" ").toUpperCase();
  const nullable = !/NOT NULL/.test(rest);
  const isPrimaryKey = /PRIMARY KEY/.test(rest);
  const isUnique = /UNIQUE/.test(rest);
  const hasDefault = /DEFAULT /.test(rest);

  return {
    name,
    type,
    nullable,
    isPrimaryKey,
    isUnique,
    hasDefault,
  };
}

function extractColumnList(line: string): string[] {
  const m = /\(([^)]+)\)/.exec(line);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((c) => stripQuotes(c))
    .map((c) => c.trim())
    .filter(Boolean);
}

function parseTableLevelForeignKey(
  line: string,
  tableName: string,
): SqlForeignKey | null {
  const fkCols = extractColumnList(line);
  const refMatch = /REFERENCES\s+("?[\w.]+"?)\s*\(([^)]+)\)/i.exec(line);
  if (!fkCols.length || !refMatch) return null;

  const toTable = stripQuotes(refMatch[1]);
  const toCols = refMatch[2]
    .split(",")
    .map((c) => stripQuotes(c))
    .map((c) => c.trim())
    .filter(Boolean);

  if (fkCols.length !== 1 || toCols.length !== 1) {
    // For simplicity, only handle single-column FKs for now.
    return null;
  }

  return {
    name: `${tableName}_${fkCols[0]}_fk`,
    fromTable: tableName,
    fromColumn: fkCols[0],
    toTable,
    toColumn: toCols[0],
    // Cardinality will be refined later based on referenced side uniqueness.
    cardinality: "one-to-many",
  };
}

