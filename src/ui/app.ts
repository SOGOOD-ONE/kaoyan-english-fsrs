import { Rating, preview, review, stateName, getRetrievability, type Grade } from "../fsrs/adapter";
import { getDueRecommendations } from "../services/recommend";
import { downloadJson, exportData, importVocabularyFile } from "../services/importExport";
import { store } from "../db/db";
import { VOCAB_DATA } from "../data/vocab";

const reviewRatings: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
const ratingNames: Record<Grade, string> = {
  [Rating.Again]: "Again",
  [Rating.Hard]: "Hard",
  [Rating.Good]: "Good",
  [Rating.Easy]: "Easy"
};

let current: Awaited<ReturnType<typeof getDueRecommendations>>[number] | undefined;

export async function mount(root: HTMLElement) {
  const words = await store.getWords();
  if (!words.length) {
    for (const word of VOCAB_DATA) await store.putWord({ ...word, id: word.id ?? `vocab-${crypto.randomUUID()}` });
  }
  root.innerHTML = `<main class="shell"><header><div><h1>考研英语 · FSRS-6</h1><p>标准 FSRS Scheduler · IndexedDB · Review Log</p></div><div class="actions"><button id="export">导出数据</button><label class="button">导入词汇<input id="import" type="file" accept=".xlsx,.xls,.csv,.json" hidden></label></div></header><section class="panel"><div class="stats" id="stats"></div></section><section class="panel" id="card"></section></main>`;
  document.getElementById("export")!.addEventListener("click", async () => downloadJson(await exportData(), "kaoyan-fsrs-backup.json"));
  document.getElementById("import")!.addEventListener("change", async event => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const count = await importVocabularyFile(file);
      alert(`成功导入 ${count} 个词汇。已有 FSRS 卡片不会被覆盖。`);
      await render();
    } catch (error) {
      alert(error instanceof Error ? error.message : "导入失败");
    } finally { input.value = ""; }
  });
  await render();
}

async function render() {
  const rows = await getDueRecommendations(20);
  document.getElementById("stats")!.innerHTML = `<div><b>${rows.length}</b><span>当前到期</span></div><div><b>${(await store.getWords()).length}</b><span>词库</span></div>`;
  const cardEl = document.getElementById("card")!;
  current = rows[0];
  if (!current) { cardEl.innerHTML = `<div class="empty"><h2>暂无到期单词</h2><p>FSRS 当前没有要求你复习的卡片。</p></div>`; return; }

  const options = preview(current.card);
  const optionText = (r: Grade) => `${ratingNames[r]} · ${options[r].card.due.toLocaleString("zh-CN")}`;
  cardEl.innerHTML = `<div class="word-card"><div class="tag">${stateName(current.card.state)}</div><h2>${escapeHtml(current.word.word)}</h2><p class="meaning">${escapeHtml(current.word.meaning)}</p>${current.word.example ? `<p class="example">${escapeHtml(current.word.example)}</p>` : ""}<div class="meta"><span>R ${(getRetrievability(current.card) * 100).toFixed(1)}%</span><span>S ${current.card.stability.toFixed(2)}</span><span>D ${current.card.difficulty.toFixed(2)}</span><span>到期 ${current.card.due.toLocaleString("zh-CN")}</span></div><div class="ratings">${reviewRatings.map(r => `<button class="rating" data-rating="${r}"><strong>${ratingNames[r]}</strong><small>${optionText(r)}</small></button>`).join("")}</div></div>`;
  cardEl.querySelectorAll<HTMLButtonElement>("[data-rating]").forEach(button => button.addEventListener("click", async () => {
    if (!current) return;
    await review(current.word, Number(button.dataset.rating) as Grade);
    await render();
  }));
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[ch]!)); }
