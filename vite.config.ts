import { defineConfig } from "vite";

export default defineConfig({
  base: "/kaoyan-english-fsrs/",
  plugins: [
    {
      name: "auth-gate-inject",
      transformIndexHtml(html) {
        return html.replace("</head>", '    <script src="/auth-gate.js"></script>\n</head>');
      }
    }
  ]
});
