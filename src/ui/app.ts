import { Rating, preview, review, stateName, getRetrievability, type Grade } from "../fsrs/adapter";
import { getMandatoryRecommendations, getNewRecommendations, getSelfReviewRecommendations, type Recommendation } from "../services/recommend";
import { downloadJson, exportData, importVocabularyFile } from "../services/importExport";
import { store } from "../db/db";
import { VOCAB_DATA } from "../data/vocab";

const reviewRatings: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
const ratingNames: Record<Grade, string> = { [Rating.Again]: "重来", [Rating.Hard]: "困难", [Rating.Good]: "良好", [Rating.Easy]: "简单" };
const QUOTAS = [80, 100, 150, 200] as const;
type Mode = "new" | "mandatory" | "self";
let mode: Mode = (localStorage.getItem("fsrs-mode") as Mode) || "new";
let quota = Number(localStorage.getItem("fsrs-daily-quota") || 100);
if (![80,100,150,200].includes(quota)) quota = 100;
let current: Recommendation | undefined;

export async function mount(root: HTMLElement) {
  const words = await store.getWords();
  if (!words.length) for (const word of VOCAB_DATA) await store.putWord({ ...word, id: word.id ?? `vocab-${crypto.randomUUID()}` });
  root.innerHTML = `<main class="shell"><header><div><h1>考研英语 · FSRS-6</h1><p>标准 FSRS Scheduler · 每日计划 · IndexedDB · Review Log</p></div><div class="actions"><button id="export">导出数据</button><label class="button">导入词汇<input id="import" type="file" accept=".xlsx,.xls,.csv,.json" hidden></label></div></header><section class="panel plan-panel"><div class="plan-title"><div><strong>每日背诵量</strong><span>今天的新词目标</span></div></div><div class="quota-row">${QUOTAS.map(q=>`<button class="quota ${q===quota?"active":""}" data-quota="${q}">${q}</button>`).join("")}</div></section><section class="panel mode-panel"><button class="mode ${mode==="new"?"active":""}" data-mode="new"><strong>今日背诵</strong><span>按每日数量加入新词</span></button><button class="mode ${mode==="mandatory"?"active":""}" data-mode="mandatory"><strong>强制复习</strong><span>复习前一天背诵的词</span></button><button class="mode ${mode==="self"?"active":""}" data-mode="self"><strong>自主复习</strong><span>复习今天全部到期词</span></button></section><section class="panel"><div class="stats" id="stats"></div></section><section class="panel" id="card"></section></main>`;
  document.getElementById("export")!.addEventListener("click",async()=>downloadJson(await exportData(),"kaoyan-fsrs-backup.json"));
  document.getElementById("import")!.addEventListener("change",async e=>{const input=e.target as HTMLInputElement,file=input.files?.[0];if(!file)return;try{const count=await importVocabularyFile(file);alert(`成功导入 ${count} 个词汇。已有 FSRS 卡片不会被覆盖。`);await render()}catch(error){alert(error instanceof Error?error.message:"导入失败")}finally{input.value=""}});
  document.querySelectorAll<HTMLButtonElement>("[data-quota]").forEach(b=>b.addEventListener("click",async()=>{quota=Number(b.dataset.quota);localStorage.setItem("fsrs-daily-quota",String(quota));await render()}));
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(b=>b.addEventListener("click",async()=>{mode=b.dataset.mode as Mode;localStorage.setItem("fsrs-mode",mode);await render()}));
  await render();
}
async function render(){
  const [newRows,mandatoryRows,selfRows,words]=await Promise.all([getNewRecommendations(quota),getMandatoryRecommendations(),getSelfReviewRecommendations(),store.getWords()]);
  const rows=mode==="new"?newRows:mode==="mandatory"?mandatoryRows:selfRows;
  document.getElementById("stats")!.innerHTML=`<div><b>${newRows.length}</b><span>今日新词</span></div><div><b>${mandatoryRows.length}</b><span>强制复习</span></div><div><b>${selfRows.length}</b><span>当前到期</span></div><div><b>${words.length}</b><span>词库</span></div>`;
  const cardEl=document.getElementById("card")!;current=rows[0];
  if(!current){const message=mode==="new"?`今日 ${quota} 个新词计划已完成，明天继续。`:mode==="mandatory"?"前一天背诵的单词已经全部完成强制复习。":"FSRS 当前没有要求你自主复习的到期卡片。";cardEl.innerHTML=`<div class="empty"><h2>这一组完成了</h2><p>${message}</p></div>`;return}
  const options=preview(current.card);
  cardEl.innerHTML=`<div class="word-card"><div class="tag">${escapeHtml(stateName(current.card.state))}</div><h2>${escapeHtml(current.word.word)}</h2><p class="meaning">${escapeHtml(current.word.meaning)}</p>${current.word.example?`<p class="example">${escapeHtml(current.word.example)}</p>`:""}<div class="meta"><span>R ${(getRetrievability(current.card)*100).toFixed(1)}%</span><span>S ${current.card.stability.toFixed(2)}</span><span>D ${current.card.difficulty.toFixed(2)}</span></div><div class="ratings">${reviewRatings.map(r=>`<button class="rating" data-rating="${r}"><strong>${ratingNames[r]}</strong><small>${stateName(options[r].card.state)}</small></button>`).join("")}</div></div>`;
  cardEl.querySelectorAll<HTMLButtonElement>("[data-rating]").forEach(b=>b.addEventListener("click",async()=>{if(!current)return;await review(current.word,Number(b.dataset.rating) as Grade);await render()}));
}
function escapeHtml(value:string){return value.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch]!))}
