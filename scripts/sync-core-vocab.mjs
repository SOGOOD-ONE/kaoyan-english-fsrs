import { mkdir, writeFile } from "node:fs/promises";

const base = "https://raw.githubusercontent.com/SOGOOD-ONE/kaoyan-core-vocab/main";
const files = ["data.js", "sentences.js"];

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
      await writeFile(`public/${name}`, text, "utf8");
    }
    console.log("Synced optional vocabulary support files");
  } finally {
    clearTimeout(timeout);
  }
} catch (error) {
  console.warn(
    `Vocab support sync skipped: ${error instanceof Error ? error.message : String(error)}`
  );
  console.warn("Continuing build without replacing the application entry.");
}
