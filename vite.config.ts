import { defineConfig } from "vite";

export default defineConfig({
  base: "/kaoyan-english-fsrs/",
  plugins: [
    {
      name: "auth-gate-inject",
      transformIndexHtml(html) {
        const withAuthGate = html.replace(
          "</head>",
          '    <script src="/auth-gate.js"></script>\n</head>'
        );
        return withAuthGate.replace(
          "import * as TSFSRS from 'https://cdn.jsdelivr.net/npm/ts-fsrs@5.4.1/+esm';",
          "import * as TSFSRS from '/src/fsrs-browser.ts';"
        );
      }
    }
  ]
});
