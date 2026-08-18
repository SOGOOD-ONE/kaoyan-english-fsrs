import { mkdir, writeFile } from "node:fs/promises";

const base = "https://raw.githubusercontent.com/SOGOOD-ONE/kaoyan-core-vocab/main";
const files = ["index.html", "data.js", "sentences.js"];

await mkdir("public", { recursive: true });

try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    for (const name of files) {
      const response = await fetch(`${base}/${name}`, {
        redirect: "follow",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (name === "index.html") await writeFile(name, text, "utf8");
      else await writeFile(`public/${name}`, text, "utf8");
    }
    console.log("Synced original kaoyan-core-vocab page and its data files");
  } finally {
    clearTimeout(timeout);
  }
} catch (error) {
  console.warn(
    `Vocab sync skipped: ${error instanceof Error ? error.message : String(error)}`
  );
  console.warn("Continuing build with the vocabulary files already present locally.");
}
