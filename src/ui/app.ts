import { uuid } from "../utils/uuid";
import { Rating, preview, review, stateName, type Grade } from "../fsrs/adapter";
import { getNewRecommendations, getMandatoryRecommendations, getSelfReviewRecommendations, type Recommendation } from "../services/recommend";
import { downloadJson, exportData, importVocabularyFile } from "../services/importExport";
import { getStudyHistory } from "../services/history";
import { apiRequest } from "../services/api";
import { setStoreUser, store } from "../db/db";
import { VOCAB_DATA } from "../data/vocab";
import { studyNav } from "./studyNav";

const reviewRatings: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
const ratingNames: Record<Grade, string> = { [Rating.Again]: "不认识", [Rating.Hard]: "模糊", [Rating.Good]: "认识", [Rating.Easy]: "很熟" };
const QUOTAS = [80, 100, 150, 200] as const;
type Mode = "new" | "mandatory" | "self";
let mode: Mode = (localStorage.getItem("study-mode") as Mode) || "new";
let quota = Number(localStorage.getItem("daily-new-quota") || 100);
if (![80, 100, 150, 200].includes(quota)) quota = 100;
let current: Recommendation | undefined;
let me: { id: string; email: string; nickname: string } | null = null;
let vocabularySelections: Record<string, boolean> = {};
let vocabularies: VocabularySummary[] = [];
let selectedWordIds: Set<string> | null = null;
let answerVisible = false;
let sessionAnswered = 0;
let sessionTotal = 0;
let sessionKey = "";
let submittingReview = false;
let syncError = "";
let todayProgress: { newCompleted: number; mandatoryCompleted: number; selfCompleted: number } | null = null;

type VocabularySummary = { id: string; name: string; kind: string; priority: number; description?: string; wordCount?: number; selected?: boolean };
type ServerWord = { id: string; word: string; type?: string; meaning: string; category?: string; source?: string };
type TodayStudy = { newTotal: number; newCompleted: number; reviewTotal: number; reviewCompleted: number; mandatoryCompleted: number; selfCompleted: number };

async function api<T>(path: string, init?: RequestInit): Promise<T> { return apiRequest<T>(path, init); }

export async function mount(root: HTMLElement) {
  try { const result = await api<{ user: typeof me }>("/auth/me"); me = result.user; } catch { me = null; }
  setStoreUser(me?.id);
  const words = await store.getWords();
  if (!words.length) for (const word of VOCAB_DATA) await store.putWord({ ...word, id: word.id ?? `vocab-${uuid()}` });
  if (me) {
    await hydrateServerVocabulary();
    await loadTodayProgress();
  } else {
    todayProgress = null;
  }
  await loadVocabularyState();
  renderShell(root);
  await render();
  installKeyboardShortcuts();
}

async function loadTodayProgress() {
  if (!me) { todayProgress = null; return; }
  try {
    const result = await api<TodayStudy>("/study/today");
    todayProgress = { newCompleted: result.newCompleted, mandatoryCompleted: result.mandatoryCompleted, selfCompleted: result.selfCompleted };
  } catch {
    todayProgress = null;
  }
}

async function hydrateServerVocabulary() {
  try {
    const result = await api<{ words: ServerWord[] }>("/study/available");
    for (const word of result.words) await store.putWord({ id: word.id, word: word.word, meaning: word.meaning, type: word.type, category: word.category });
  } catch { /* Local/offline mode remains available. */ }
}

async function loadVocabularyState() {
  if (!me) { vocabularies = []; vocabularySelections = {}; selectedWordIds = null; return; }
  try {
    vocabularies = await api<VocabularySummary[]>("/vocabularies");
    const selections = await api<{ vocabularyId: string; enabled: boolean }[]>("/vocabularies/selections");
    vocabularySelections = Object.fromEntries(selections.map(s => [s.vocabularyId, s.enabled]));
    vocabularies = vocabularies.map(v => ({ ...v, selected: vocabularySelections[v.id] ?? false }));
    const enabled = vocabularies.filter(v => v.selected);
    if (!enabled.length) { selectedWordIds = new Set(); return; }
    const details = await Promise.all(enabled.map(v => api<{ words: { id: string }[] }>(`/vocabularies/${v.id}`)));
    selectedWordIds = new Set(details.flatMap(d => d.words.map(w => w.id)));
  } catch { vocabularies = []; vocabularySelections = {}; selectedWordIds = null; }
}

function filterSelected(rows: Recommendation[]) {
  if (!me || selectedWordIds === null) return rows;
  const ids = selectedWordIds;
  return rows.filter(r => !!r.word.id && ids.has(r.word.id));
}

function renderShell(root: HTMLElement) {
  root.innerHTML = `<main class="shell home-shell"><header class="home-header"><div class="home-brand"><h1>考研英语</h1><p>专注真题语境的智能背词</p></div><div class="home-header-right">${studyNav("/")}<div class="home-account">${me ? `<span>你好，${escapeHtml(me.nickname)}</span><button id="logout" class="nav-quiet">退出</button>` : `<a href="/login" class="nav-quiet">登录</a>`}</div></div></header><section class="today-head"><div><span class="eyebrow">${me ? "今日学习" : "开始学习"}</span><h2>${me ? "继续你的记忆训练" : "建立你的考研英语词汇系统"}</h2><p>${me ? "先主动回忆，再查看释义，最后进行 FSRS 评分。" : "登录后即可保存学习进度、同步词库，并开始智能复习。"}</p></div><div class="today-actions">${me ? `<button id="vocab-manage">词库</button><button id="history-manage">历史</button><button id="settings-manage">设置</button>` : `<a class="primary-cta" href="/login">登录开始学习</a>`}</div></section><section class="today-overview panel"><div class="today-overview-main"><strong id="session-label">今日背诵</strong><span id="session-count">0 / 0</span></div><div class="today-stats" id="stats"></div></section><section class="panel plan-panel"><div class="plan-title"><div><strong>每日新词</strong><span>今天计划背多少个？</span></div></div><div class="quota-row">${QUOTAS.map(q => `<button class="quota ${q === quota ? "active" : ""}" data-quota="${q}">${q}</button>`).join("")}</div></section><section class="panel mode-panel"><button class="mode ${mode === "new" ? "active" : ""}" data-mode="new"><strong>今日背诵</strong><span>按计划学习新词</span></button><button class="mode ${mode === "mandatory" ? "active" : ""}" data-mode="mandatory"><strong>强制复习</strong><span>复习昨天背过的词</span></button><button class="mode ${mode === "self" ? "active" : ""}" data-mode="self"><strong>自主复习</strong><span>算法判断需要复习的词</span></button></section><section class="panel study-card-panel" id="card"></section><section class="home-tools"><button id="export">导出数据</button><label class="button">导入词汇<input id="import" type="file" accept=".xlsx,.xls,.csv,.json" hidden></label></section><section id="vocab-panel" class="panel vocab-panel" hidden></section><section id="history-panel" class="panel history-panel" hidden></section></main>`;
  document.getElementById("export")!.addEventListener("click", async () => downloadJson(await exportData(), "kaoyan-fsrs-backup.json"));
  document.getElementById("import")!.addEventListener("change", async e => {
    const input = e.target as HTMLInputElement, file = input.files?.[0]; if (!file) return;
    try { const result = await importVocabularyFile(file); alert(`识别 ${result.sourceRows} 行，新增 ${result.inserted}，更新 ${result.updated}，去重 ${result.duplicates}${result.serverSynchronized ? "，已同步云端" : "，当前仅保存本地"}`); await hydrateServerVocabulary(); await loadVocabularyState(); resetSession(); await render(); }
    catch (error) { alert(error instanceof Error ? error.message : "导入失败"); } finally { input.value = ""; }
  });
  document.getElementById("logout")?.addEventListener("click", async () => { await api("/auth/logout", { method: "POST" }).catch(() => undefined); setStoreUser(null); location.reload(); });
  document.getElementById("vocab-manage")?.addEventListener("click", () => { location.href = "/vocabularies"; });
  document.getElementById("history-manage")?.addEventListener("click", () => { location.href = "/history"; });
