import { mkdir, writeFile } from "node:fs/promises";

const base = "https://raw.githubusercontent.com/SOGOOD-ONE/kaoyan-core-vocab/main";
const files = ["index.html", "data.js", "sentences.js"];

await mkdir("public", { recursive: true });

for (const name of files) {
  const response = await fetch(`${base}/${name}`, { redirect: "follow" });
  if (!response.ok) throw new Error(`Failed to fetch ${name}: HTTP ${response.status}`);
  const text = await response.text();
  if (name === "index.html") await writeFile(name, text, "utf8");
  else await writeFile(`public/${name}`, text, "utf8");
}

console.log("Synced original kaoyan-core-vocab page and its data files");
