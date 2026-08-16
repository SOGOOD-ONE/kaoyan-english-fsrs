import { apiRequest } from "../services/api";
import { renderNav } from "./nav";

type Vocabulary = { id: string; name: string; kind: string; priority: number; description?: string };
type Selection = { vocabularyId: string; enabled: boolean; priority: number };
type Stats = { wordCount: number; learned: number; due: number; new: number; masteryRate: number };

export async function mountVocabularies(root: HTMLElement) {
  root.innerHTML = `<main class="shell page"><header class="page-header"><div><h1>我的词库</h1><p>选择今天要学习的词库，也可以导入自己的词表</p></div>${renderNav("/vocabularies")}</header><section class="panel" id="vocab-page"></section></main>`;
  await renderList(root.querySelector("#vocab-page") as HTMLElement);
}

async function renderList(container: HTMLElement) {
  try {
    const [vocabularies, selections] = await Promise.all([
      apiRequest<Vocabulary[]>("/vocabularies"),
      apiRequest<Selection[]>("/vocabularies/selections"),
    ]);
    const selected = new Map(selections.map(item => [item.vocabularyId, item]));
    const stats = await Promise.all(vocabularies.map(v => apiRequest<Stats>(`/vocabularies/${v.id}/stats`).catch(() => ({ wordCount: 0, learned: 0, due: 0, new: 0, masteryRate: 0 }))));
    container.innerHTML = `<div class="vocab-page-head"><div><strong>词库</strong><span>${vocabularies.length} 个可用词库</span></div><label class="button">导入词表<input id="vocab-import" type="file" accept=".xlsx,.xls,.csv,.json" hidden></label></div><div class="vocab-page-list">${vocabularies.map((v, i) => { const s = stats[i]; const enabled = selected.get(v.id)?.enabled ?? false; return `<article class="vocab-page-item"><div class="vocab-page-main"><label><input type="checkbox" data-select="${v.id}" ${enabled ? "checked" : ""}><strong>${escapeHtml(v.name)}</strong></label><p>${escapeHtml(v.description || "系统词库")}</p><div class="vocab-progress"><span style="width:${Math.min(100, s.masteryRate)}%"></span></div><small>${s.wordCount} 词 · 已学 ${s.learned} · 待复习 ${s.due} · 未学 ${s.new}</small></div><div class="vocab-page-rate">${s.masteryRate}%</div></article>`; }).join("") || `<div class="empty"><h2>还没有词库</h2><p>导入第一份词表开始学习。</p></div>`}</div>`;
    container.querySelectorAll<HTMLInputElement>("[data-select]").forEach(input => input.addEventListener("change", async () => { try { await apiRequest(`/vocabularies/${input.dataset.select}/selection`, { method: "PUT", body: JSON.stringify({ enabled: input.checked }) }); await renderList(container); } catch { input.checked = !input.checked; } }));
    container.querySelector<HTMLInputElement>("#vocab-import")?.addEventListener("change", async e => {
      const input = e.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return;
      try {
        const rows = await parseFile(file);
        await apiRequest("/vocabularies/import", { method: "POST", body: JSON.stringify({ name: file.name.replace(/\.(xlsx|xls|csv|json)$/i, ""), words: rows }) });
        await renderList(container);
      } catch (error) { alert(error instanceof Error ? error.message : "导入失败"); } finally { input.value = ""; }
    });
  } catch { container.innerHTML = `<div class="empty"><h2>暂时无法读取词库</h2><p>请登录后再试。</p></div>`; }
}

async function parseFile(file: File): Promise<Array<Record<string, string>>> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json")) { const data = JSON.parse(await file.text()); return Array.isArray(data) ? data : data.words ?? []; }
  const XLSX = await import("xlsx");
  if (name.endsWith(".csv")) { const text = await file.text(); const rows = text.split(/\r?\n/).filter(Boolean).map(line => line.split(",")); const headers = rows.shift() || []; return rows.map(row => Object.fromEntries(headers.map((h, i) => [h.trim(), row[i] ?? ""]))); }
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Array<Record<string, string>>;
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[ch]!)); }
