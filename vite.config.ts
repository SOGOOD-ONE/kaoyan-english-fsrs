import { defineConfig } from "vite";

function replaceFunction(html: string, name: string, replacement: string) {
  const pattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = pattern.exec(html);
  if (!match) return html;
  const open = html.indexOf("{", match.index + match[0].length);
  if (open < 0) return html;

  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = open; i < html.length; i += 1) {
    const ch = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const prefix = html.slice(match.index, open);
        return `${html.slice(0, match.index)}${prefix}{${replacement}}${html.slice(i + 1)}`;
      }
    }
  }
  return html;
}

export default defineConfig({
  base: "/",
  plugins: [
    {
      name: "wire-v3-runtime",
      transformIndexHtml(html) {
        let output = html.replace(
          "</head>",
          '    <script src="/auth-gate.js"></script>\n</head>'
        );

        output = output.replace(
          /import\s+\*\s+as\s+TSFSRS\s+from\s+["']https:\/\/cdn\.jsdelivr\.net\/npm\/ts-fsrs@5\.4\.1\/\+esm["'];?/g,
          'import * as TSFSRS from "/src/fsrs-browser.ts";'
        );

        output = replaceFunction(
          output,
          "loadRemoteVocab",
          `
  const response = await fetch("/api/words?limit=500", { credentials: "include" });
  if (!response.ok) throw new Error("Vocabulary API failed: " + response.status);
  const rows = await response.json();
  const vocab = Array.isArray(rows) ? rows.map((row) => ({
    id: row.id,
    word: row.word,
    type: row.type || "",
    meaning: row.meaning || "",
    category: row.category || "核心词",
    source: row.source || "",
    sourceDetail: row.sourceDetail || ""
  })) : [];
  window.VOCAB_DATA = vocab;
  return vocab;
`
        );

        output = replaceFunction(
          output,
          "ensureFSRS",
          `
  if (window.__TSFSRS) return window.__TSFSRS;
  if (window.__TSFSRSReady) return await window.__TSFSRSReady;
  throw new Error("本地 ts-fsrs 加载失败");
`
        );

        output = output.replace(/\s*<script[^>]+src=["'](?:\.\/)?data\.js["'][^>]*><\/script>/gi, "");
        return output;
      }
    }
  ]
});
