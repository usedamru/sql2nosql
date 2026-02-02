import React, { useState } from "react";
import { analyzeSqlToNoSql } from "@s2n/core";

export const App: React.FC = () => {
  const [sql, setSql] = useState("");
  const [resultJson, setResultJson] = useState<string | null>(null);

  const handleAnalyze = () => {
    const result = analyzeSqlToNoSql(sql);
    setResultJson(JSON.stringify(result, null, 2));
  };

  return (
    <div className="app-root">
      <header className="app-header">
        <h1>SQL → NoSQL Analyzer</h1>
        <p className="subtitle">
          v0.1 — analysis only, deterministic, human-in-the-loop.
        </p>
      </header>

      <main className="app-main">
        <section className="panel">
          <h2>Input SQL schema (DDL)</h2>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            placeholder="Paste CREATE TABLE statements here..."
          />
          <button
            className="primary"
            type="button"
            onClick={handleAnalyze}
            disabled={!sql.trim()}
          >
            Analyze (stub)
          </button>
        </section>

        <section className="panel">
          <h2>Analysis output (JSON)</h2>
          <pre className="output">
            {resultJson ?? "// Run analysis to see structured output here"}
          </pre>
        </section>
      </main>
    </div>
  );
};

