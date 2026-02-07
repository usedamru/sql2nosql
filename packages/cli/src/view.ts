/**
 * HTML view generation for schema analysis (Tailwind, hacker theme: black + green, red/blue accents).
 */

import type {
  AnalysisResult,
  NoSqlCollection,
  SqlForeignKey,
  SqlTable,
} from "@s2n/core";
import { escapeHtml } from "./utils";

const TAILWIND_CDN =
  '<script src="https://cdn.tailwindcss.com"></script>';

/** Hacker theme: black bg, green primary, red for errors/cons, blue used sparingly */
function layout(
  title: string,
  bodyContent: string,
  options?: { subtitle?: string },
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${TAILWIND_CDN}
</head>
<body class="bg-black text-green-400 font-mono min-h-screen antialiased">
  <div class="max-w-6xl mx-auto px-4 py-8">
    ${bodyContent}
  </div>
</body>
</html>`;
}

export function generateOverviewHTML(analysis: AnalysisResult): string {
  const tables = analysis.sqlSchema.tables;
  const fks = analysis.sqlSchema.foreignKeys;
  const collections = analysis.nosqlSchema.collections;
  const hasLLM = !!analysis.llmRecommendations;

  const tableRows = tables
    .map(
      (table) => `
    <tr class="border-b border-green-800 hover:bg-green-950/30">
      <td class="px-4 py-3"><a href="table-${table.name}.html" class="text-green-400 hover:text-green-300 underline">${escapeHtml(table.name)}</a></td>
      <td class="px-4 py-3">${table.columns.length}</td>
      <td class="px-4 py-3 text-green-300">${table.primaryKey.length > 0 ? table.primaryKey.join(", ") : "—"}</td>
      <td class="px-4 py-3">${fks.filter((fk) => fk.fromTable === table.name).length}</td>
      <td class="px-4 py-3">${collections.find((c) => c.name === table.name)?.fields.length ?? 0}</td>
    </tr>
  `,
    )
    .join("");

  const body = `
    <h1 class="text-2xl font-bold text-green-400 mb-2">SQL → NoSQL Schema Analysis</h1>
    <p class="text-green-600 mb-6">Overview of all tables and their NoSQL mappings</p>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-black border border-green-800 rounded p-4">
        <div class="text-2xl font-bold text-green-400">${tables.length}</div>
        <div class="text-green-600 text-sm mt-1">Tables</div>
      </div>
      <div class="bg-black border border-green-800 rounded p-4">
        <div class="text-2xl font-bold text-green-400">${fks.length}</div>
        <div class="text-green-600 text-sm mt-1">Foreign Keys</div>
      </div>
      <div class="bg-black border border-green-800 rounded p-4">
        <div class="text-2xl font-bold text-green-400">${collections.length}</div>
        <div class="text-green-600 text-sm mt-1">NoSQL Collections</div>
      </div>
      ${hasLLM ? `
      <div class="bg-black border border-green-600 rounded p-4">
        <div class="text-2xl font-bold text-green-400">${analysis.llmRecommendations!.embeddings.length}</div>
        <div class="text-green-600 text-sm mt-1">LLM Recommendations</div>
      </div>
      ` : ""}
    </div>

    <div class="border border-green-800 rounded overflow-hidden">
      <table class="w-full">
        <thead>
          <tr class="bg-green-950 border-b border-green-800">
            <th class="px-4 py-3 text-left text-green-400 font-semibold">Table Name</th>
            <th class="px-4 py-3 text-left text-green-400 font-semibold">Columns</th>
            <th class="px-4 py-3 text-left text-green-400 font-semibold">Primary Key</th>
            <th class="px-4 py-3 text-left text-green-400 font-semibold">Foreign Keys</th>
            <th class="px-4 py-3 text-left text-green-400 font-semibold">NoSQL Fields</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
  `;

  return layout("SQL → NoSQL Schema Analysis", body);
}

export function generateTableHTML(
  table: SqlTable,
  collection: NoSqlCollection | null,
  foreignKeys: SqlForeignKey[],
  embeddingRecommendations?: Array<{
    collection: string;
    field: string;
    strategy: string;
    reason: string;
    suggestedFields?: string[];
    confidence?: number;
  }>,
  insights?: Array<{
    type: string;
    collection: string;
    recommendation: string;
    reasoning: string;
    tradeoffs?: { pros: string[]; cons: string[] };
  }>,
): string {
  const tableFKs = foreignKeys.filter((fk) => fk.fromTable === table.name);
  const refFKs = foreignKeys.filter((fk) => fk.toTable === table.name);

  const columnsHTML = table.columns
    .map(
      (col) => `
    <tr class="border-b border-green-800/50">
      <td class="px-4 py-2 font-semibold">${escapeHtml(col.name)}</td>
      <td class="px-4 py-2"><code class="bg-green-950 text-green-400 px-2 py-0.5 rounded border border-green-800 text-sm">${escapeHtml(col.type)}</code></td>
      <td class="px-4 py-2">${col.nullable ? "✓" : "✗"}</td>
      <td class="px-4 py-2">${col.isPrimaryKey ? "🔑" : ""} ${col.isUnique ? "🔒" : ""}</td>
    </tr>
  `,
    )
    .join("");

  const nosqlFieldsHTML =
    collection?.fields
      .map(
        (field) => `
    <tr class="border-b border-green-800/50">
      <td class="px-4 py-2 font-semibold">${escapeHtml(field.name)}</td>
      <td class="px-4 py-2"><code class="bg-green-950 text-green-400 px-2 py-0.5 rounded border border-green-800 text-sm">${field.type}</code></td>
      <td class="px-4 py-2">${field.optional ? "✓" : "✗"}</td>
      <td class="px-4 py-2 text-green-300">${field.refCollection ? `→ ${escapeHtml(field.refCollection)}` : field.description ?? ""}</td>
    </tr>
  `,
      )
      .join("") ??
    "<tr><td colspan='4' class='px-4 py-2 text-green-600'>No NoSQL collection mapped</td></tr>";

  const fullJson = escapeHtml(
    JSON.stringify(
      { sqlTable: table, nosqlCollection: collection },
      null,
      2,
    ),
  );

  let body = `
    <div class="mb-6">
      <a href="schema-analysis.html" class="text-green-600 hover:text-green-400 text-sm">← Back to Overview</a>
      <h1 class="text-2xl font-bold text-green-400 mt-2">Table: ${escapeHtml(table.name)}</h1>
    </div>

    <div class="grid md:grid-cols-2 gap-6 mb-6">
      <div class="border border-green-800 rounded p-5 bg-black">
        <h2 class="text-lg font-semibold text-green-400 mb-4">SQL Table Structure</h2>
        <div class="mb-2">
          <span class="text-green-600 text-sm">Primary Key</span>
          <div class="text-green-300">${table.primaryKey.length > 0 ? table.primaryKey.join(", ") : "None"}</div>
        </div>
        ${table.uniqueConstraints.length > 0 ? `
        <div class="mb-4">
          <span class="text-green-600 text-sm">Unique Constraints</span>
          <div class="text-green-300">${table.uniqueConstraints.map((uc) => uc.join(", ")).join("; ")}</div>
        </div>
        ` : ""}
        <div class="border border-green-800 rounded overflow-hidden mt-4">
          <table class="w-full text-sm">
            <thead><tr class="bg-green-950 border-b border-green-800">
              <th class="px-3 py-2 text-left text-green-400">Column</th>
              <th class="px-3 py-2 text-left text-green-400">Type</th>
              <th class="px-3 py-2 text-left text-green-400">Nullable</th>
              <th class="px-3 py-2 text-left text-green-400">Constraints</th>
            </tr></thead>
            <tbody>${columnsHTML}</tbody>
          </table>
        </div>
      </div>

      <div class="border border-green-800 rounded p-5 bg-black">
        <h2 class="text-lg font-semibold text-green-400 mb-4">NoSQL Collection Proposal</h2>
        ${collection ? `
        <div class="mb-2"><span class="text-green-600 text-sm">Collection Name</span><div class="text-green-300">${escapeHtml(collection.name)}</div></div>
        ${collection.description ? `<div class="mb-4"><span class="text-green-600 text-sm">Description</span><div class="text-green-300">${escapeHtml(collection.description)}</div></div>` : ""}
        <div class="border border-green-800 rounded overflow-hidden mt-4">
          <table class="w-full text-sm">
            <thead><tr class="bg-green-950 border-b border-green-800">
              <th class="px-3 py-2 text-left text-green-400">Field</th>
              <th class="px-3 py-2 text-left text-green-400">Type</th>
              <th class="px-3 py-2 text-left text-green-400">Optional</th>
              <th class="px-3 py-2 text-left text-green-400">Reference/Notes</th>
            </tr></thead>
            <tbody>${nosqlFieldsHTML}</tbody>
          </table>
        </div>
        ` : "<p class='text-green-600'>No collection mapping available</p>"}
      </div>
    </div>

    <div class="border border-green-800 rounded p-5 bg-black mb-6">
      <h2 class="text-lg font-semibold text-green-400 mb-4">Full JSON Structure</h2>
      <pre class="bg-black border border-green-800 rounded p-4 overflow-auto max-h-96 text-sm text-green-300"><code>${fullJson}</code></pre>
    </div>

    ${tableFKs.length > 0 || refFKs.length > 0 ? `
    <div class="border border-green-800 rounded p-5 bg-black mb-6">
      <h2 class="text-lg font-semibold text-green-400 mb-4">Relationships</h2>
      ${tableFKs.length > 0 ? `
      <h3 class="text-green-600 text-sm mb-2 mt-4">Outgoing References</h3>
      <ul class="list-none pl-0 space-y-2">
        ${tableFKs.map((fk) => `<li><code class="bg-green-950 text-green-400 px-2 py-0.5 rounded border border-green-800 text-sm">${escapeHtml(fk.fromColumn)}</code> → <a href="table-${fk.toTable}.html" class="text-green-400 hover:text-green-300 underline">${fk.toTable}.${fk.toColumn}</a></li>`).join("")}
      </ul>
      ` : ""}
      ${refFKs.length > 0 ? `
      <h3 class="text-green-600 text-sm mb-2 mt-4">Incoming References</h3>
      <ul class="list-none pl-0 space-y-2">
        ${refFKs.map((fk) => `<li><a href="table-${fk.fromTable}.html" class="text-green-400 hover:text-green-300 underline">${fk.fromTable}.${fk.fromColumn}</a> → <code class="bg-green-950 text-green-400 px-2 py-0.5 rounded border border-green-800 text-sm">${fk.toColumn}</code></li>`).join("")}
      </ul>
      ` : ""}
    </div>
    ` : ""}

    ${embeddingRecommendations && embeddingRecommendations.length > 0 ? `
    <div class="border border-green-600 rounded p-5 bg-black mb-6">
      <h2 class="text-lg font-semibold text-green-400 mb-4">🤖 LLM Optimization Recommendations</h2>
      ${embeddingRecommendations
        .map(
          (rec) => `
      <div class="mt-4 p-4 bg-green-950/30 border-l-4 border-green-500 rounded">
        <div class="flex justify-between items-start mb-2">
          <strong class="text-green-400">Field: ${escapeHtml(rec.field)}</strong>
          <span class="bg-green-900/50 text-green-400 px-2 py-1 rounded text-xs font-semibold">${rec.strategy.toUpperCase()}</span>
        </div>
        <p class="text-green-300 text-sm my-2">${escapeHtml(rec.reason)}</p>
        ${rec.suggestedFields?.length ? `<div class="mt-2"><span class="text-green-600 text-xs">Suggested fields:</span> ${rec.suggestedFields.map((f) => `<code class="bg-green-950 text-green-400 px-2 py-0.5 rounded text-xs mr-1">${escapeHtml(f)}</code>`).join("")}</div>` : ""}
        ${rec.confidence ? `<div class="mt-2 text-green-600 text-xs">Confidence: ${Math.round(rec.confidence * 100)}%</div>` : ""}
      </div>
      `,
        )
        .join("")}
    </div>
    ` : ""}

    ${insights && insights.length > 0 ? `
    <div class="border border-green-800 rounded p-5 bg-black mb-6">
      <h2 class="text-lg font-semibold text-green-400 mb-4">💡 Additional Insights</h2>
      ${insights
        .map(
          (insight) => `
      <div class="mt-4 p-4 bg-green-950/20 border-l-4 border-blue-600 rounded">
        <div class="mb-2"><strong class="text-green-400">${escapeHtml(insight.recommendation)}</strong></div>
        <p class="text-green-300 text-sm my-2">${escapeHtml(insight.reasoning)}</p>
        ${insight.tradeoffs ? `
        <div class="mt-3 grid grid-cols-2 gap-4">
          <div>
            <div class="text-green-500 text-xs font-semibold mb-1">Pros:</div>
            <ul class="list-none pl-0 text-green-300 text-sm space-y-1">${insight.tradeoffs.pros.map((p) => `<li>✓ ${escapeHtml(p)}</li>`).join("")}</ul>
          </div>
          <div>
            <div class="text-red-400 text-xs font-semibold mb-1">Cons:</div>
            <ul class="list-none pl-0 text-green-300 text-sm space-y-1">${insight.tradeoffs.cons.map((c) => `<li>✗ ${escapeHtml(c)}</li>`).join("")}</ul>
          </div>
        </div>
        ` : ""}
      </div>
      `,
        )
        .join("")}
    </div>
    ` : ""}
  `;

  return layout(`${table.name} - SQL → NoSQL Analysis`, body);
}

export function generateIndexHTML(analysis: AnalysisResult): string {
  const tables = analysis.sqlSchema.tables;
  const fks = analysis.sqlSchema.foreignKeys;
  const collections = analysis.nosqlSchema.collections;
  const hasLLM = !!analysis.llmRecommendations;

  const tableCards = tables
    .map((table) => {
      const collection = collections.find((c) => c.name === table.name);
      const tableFKs = fks.filter((fk) => fk.fromTable === table.name);
      return `
    <div class="border border-green-800 rounded overflow-hidden bg-black hover:border-green-600 transition-colors">
      <div class="px-5 py-4 bg-green-950/50 border-b border-green-800 flex justify-between items-center">
        <h3 class="font-bold text-lg"><a href="table-${table.name}.html" class="text-green-400 hover:text-green-300">${escapeHtml(table.name)}</a></h3>
        <span class="bg-green-950 text-green-400 px-3 py-1 rounded text-xs font-semibold border border-green-800">${table.columns.length} columns</span>
      </div>
      <div class="p-5 space-y-2 text-sm">
        <div class="flex justify-between"><span class="text-green-600">SQL Columns</span><span class="text-green-300 font-semibold">${table.columns.length}</span></div>
        <div class="flex justify-between"><span class="text-green-600">NoSQL Fields</span><span class="text-green-300 font-semibold">${collection?.fields.length ?? 0}</span></div>
        <div class="flex justify-between"><span class="text-green-600">Foreign Keys</span><span class="text-green-300 font-semibold">${tableFKs.length}</span></div>
        ${table.primaryKey.length > 0 ? `<div class="flex justify-between"><span class="text-green-600">Primary Key</span><span class="text-green-300"><code class="bg-green-950 px-2 py-0.5 rounded border border-green-800 text-xs">${table.primaryKey.join(", ")}</code></span></div>` : ""}
        ${hasLLM ? (() => {
          const tableRecs = analysis.llmRecommendations!.embeddings.filter((r) => r.collection === table.name);
          return tableRecs.length > 0 ? `<div class="flex justify-between"><span class="text-green-600">LLM Recommendations</span><span class="text-green-400 font-semibold">${tableRecs.length}</span></div>` : "";
        })() : ""}
      </div>
      <div class="px-5 py-3 border-t border-green-800 bg-black">
        <a href="table-${table.name}.html" class="text-green-400 hover:text-green-300 font-semibold text-sm">View Details →</a>
      </div>
    </div>
  `;
    })
    .join("");

  const body = `
    <div class="text-center mb-12 pb-8 border-b-2 border-green-800">
      <h1 class="text-4xl font-bold text-green-400 mb-2">SQL → NoSQL Analyzer</h1>
      <p class="text-green-600 text-lg mb-6">Schema Analysis Results</p>

      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
        <div class="border border-green-800 rounded p-5 bg-black text-center hover:border-green-600 transition-colors">
          <div class="text-3xl font-bold text-green-400">${tables.length}</div>
          <div class="text-green-600 text-sm mt-1 uppercase tracking-wider">Tables</div>
        </div>
        <div class="border border-green-800 rounded p-5 bg-black text-center hover:border-green-600 transition-colors">
          <div class="text-3xl font-bold text-green-400">${fks.length}</div>
          <div class="text-green-600 text-sm mt-1 uppercase tracking-wider">Relationships</div>
        </div>
        <div class="border border-green-800 rounded p-5 bg-black text-center hover:border-green-600 transition-colors">
          <div class="text-3xl font-bold text-green-400">${collections.length}</div>
          <div class="text-green-600 text-sm mt-1 uppercase tracking-wider">NoSQL Collections</div>
        </div>
        <div class="border border-green-800 rounded p-5 bg-black text-center hover:border-green-600 transition-colors">
          <div class="text-3xl font-bold text-green-400">${tables.reduce((sum, t) => sum + t.columns.length, 0)}</div>
          <div class="text-green-600 text-sm mt-1 uppercase tracking-wider">Total Columns</div>
        </div>
        ${hasLLM ? `
        <div class="border border-green-600 rounded p-5 bg-black text-center">
          <div class="text-3xl font-bold text-green-400">🤖</div>
          <div class="text-green-600 text-sm mt-1 uppercase tracking-wider">AI Optimized</div>
        </div>
        ` : ""}
      </div>

      <div class="flex flex-wrap gap-3 justify-center mb-8">
        <a href="schema-analysis.html" class="bg-green-950 border border-green-600 text-green-400 px-5 py-2.5 rounded font-semibold hover:bg-green-900/50 hover:border-green-500 transition-colors">📊 Full Overview</a>
        <a href="schema-analysis.json" class="bg-green-950 border border-green-600 text-green-400 px-5 py-2.5 rounded font-semibold hover:bg-green-900/50 hover:border-green-500 transition-colors" download>📥 Download JSON</a>
        ${hasLLM ? `<span class="bg-green-950/50 border border-green-600 text-green-400 px-5 py-2.5 rounded font-semibold">🤖 LLM Recommendations Enabled</span>` : ""}
      </div>
    </div>

    <h2 class="text-xl font-bold text-green-400 mb-6">All Tables</h2>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
      ${tableCards}
    </div>

    <div class="mt-12 pt-8 border-t border-green-800 text-center text-green-600 text-sm">
      <p>Generated by SQL → NoSQL Analyzer v0.1</p>
      <p class="mt-2">Click on any table to view detailed SQL and NoSQL mappings</p>
    </div>
  `;

  return layout("SQL → NoSQL Analyzer - Results", body);
}
