import { mkdir, writeFile } from "node:fs/promises";

const base = "https://raw.githubusercontent.com/SOGOOD-ONE/kaoyan-core-vocab/main";
const files = ["index.html", "data.js", "sentences.js"];

for (const name of files) {
  const response = await fetch(`${base}/${name}`, { redirect: "follow" });
  if (!response.ok) throw new Error(`Failed to fetch ${name}: HTTP ${response.status}`);
  const text = await response.text();
  await writeFile(name, text, "utf8");
}

await mkdir("dist", { recursive: true });
console.log("Synced original kaoyan-core-vocab page, data.js, and sentences.js");
