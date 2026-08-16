import { Rating, preview, review, stateName, getRetrievability, type Grade } from "../fsrs/adapter";
import { getNewRecommendations, getMandatoryRecommendations, getSelfReviewRecommendations, type Recommendation } from "../services/recommend";
import { downloadJson, exportData, importVocabularyFile } from "../services/importExport";
import { store } from "../db/db";
import { VOCAB_DATA } from "../data/vocab";

const reviewRatings: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
const ratingNames: Record<Grade, string> = { [Rating.Again]: "不认识", [Rating.Hard]: "模糊", [Rating.Good]: "认识", [Rating.Easy]: "很熟" };
const QUOTAS = [80, 100, 150, 200] as const;
type Mode = "new" | "mandatory" | "self";
let mode: Mode = (localStorage.getItem("study-mode") as Mode) || "new";
let quota = Number(localStorage.getItem("daily-new-quota") || 100);
if (![80,100,150,200].includes(quota)) quota = 100;
let current: Recommendation | undefined;

export async function mount(root: HTMLElement) {
  const words = await store.getWords();
  if (!words.length) for (const word of VOCAB_DATA) await store.putWord({ ...word, id: word.id ?? `vocab-${crypto.randomUUID()}` });
  root.innerHTML = `<main class="shell"><header><div><h1>考研英语</h1><p>专注真题语境的智能背词</p></div><div class="actions"><button id="export">导出</button><label class="button">导入词汇<input id="import" type="file" accept=".xlsx,.xls,.csv,.json" hidden></label></div></header><section class="panel plan-panel"><div class="plan-title"><div><strong>每日新词</strong><span>今天计划背多少个？</span></div></div><div class="quota-row">${QUOTAS.map(q=>`<button class="quota ${q===quota?"active":""}" data-quota="${q}">${q}</button>`).join("")}</div></section><section class="panel mode-panel"><button class="mode ${mode==="new"?"active":""}" data-mode="new"><strong>今日背诵</strong><span>按计划学习新词</span></button><button class="mode ${mode==="mandatory"?"active":""}" data-mode="mandatory"><strong>强制复习</strong><span>复习昨天背过的词</span></button><button class="mode ${mode==="self"?"active":""}" data-mode="self"><strong>自主复习</strong><span>算法判断需要复习的词</span></button></section><section class="panel"><div class="stats" id="stats"></div></section><section class="panel" id="card"></section></main>`;
  document.getElementById("export")!.addEventListener("click",async()=>downloadJson(await exportData(),"kaoyan-fsrs-backup.json"));
  document.getElementById("import")!.addEventListener("change",async e=>{const input=e.target as HTMLInputElement,file=input.files?.[0];if(!file)return;try{const count=await importVocabularyFile(file);alert(`成功导入 ${count} 个词汇`);await render()}catch(error){alert(error instanceof Error?error.message:"导入失败")}finally{input.value=""}});
  document.querySelectorAll<HTMLButtonElement>("[data-quota]").forEach(b=>b.addEventListener("click",async()=>{quota=Number(b.dataset.quota);localStorage.setItem("daily-new-quota",String(quota));syncControls();await render()}));
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(b=>b.addEventListener("click",async()=>{mode=b.dataset.mode as Mode;localStorage.setItem("study-mode",mode);syncControls();await render()}));
  await render();
}
function syncControls(){
  document.querySelectorAll<HTMLButtonElement>('[data-quota]').forEach(b=>b.classList.toggle('active', Number(b.dataset.quota)===quota));
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
}
async function render(){
  const [newRows,mandatoryRows,selfRows,words]=await Promise.all([getNewRecommendations(quota),getMandatoryRecommendations(),getSelfReviewRecommendations(),store.getWords()]);
  const rows=mode==="new"?newRows:mode==="mandatory"?mandatoryRows:selfRows;
  document.getElementById("stats")!.innerHTML=`<div><b>${newRows.length}</b><span>今日新词</span></div><div><b>${mandatoryRows.length}</b><span>强制复习</span></div><div><b>${selfRows.length}</b><span>自主复习</span></div><div><b>${words.length}</b><span>词库</span></div>`;
  const cardEl=document.getElementById("card")!;current=rows[0];
  if(!current){const message=mode==="new"?`今天的 ${quota} 个新词已经完成。`:mode==="mandatory"?"昨天背过的词已经全部复习。":"目前没有需要自主复习的词。";cardEl.innerHTML=`<div class="empty"><h2>这一组完成了</h2><p>${message}</p></div>`;return}
  const options=preview(current.card);
  cardEl.innerHTML=`<div class="word-card"><div class="progress">继续学习</div><h2>${escapeHtml(current.word.word)}</h2><p class="meaning">${escapeHtml(current.word.meaning)}</p>${current.word.example?`<p class="example">${escapeHtml(current.word.example)}</p>`:""}<div class="ratings">${reviewRatings.map(r=>`<button class="rating" data-rating="${r}"><strong>${ratingNames[r]}</strong><small>${stateName(options[r].card.state)}</small></button>`).join("")}</div></div>`;
  cardEl.querySelectorAll<HTMLButtonElement>("[data-rating]").forEach(b=>b.addEventListener("click",async()=>{if(!current)return;await review(current.word,Number(b.dataset.rating) as Grade);await render()}));
}
function escapeHtml(value:string){return value.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch]!))}
