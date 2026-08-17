import { uuid } from "../utils/uuid";
import { Rating, preview, review, stateName, type Grade } from "../fsrs/adapter";
import { getNewRecommendations, getMandatoryRecommendations, getSelfReviewRecommendations, type Recommendation } from "../services/recommend";
import { downloadJson, exportData, importVocabularyFile } from "../services/importExport";
import { getStudyHistory } from "../services/history";
import { apiRequest } from "../services/api";
import { store } from "../db/db";
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

type VocabularySummary = { id: string; name: string; kind: string; priority: number; description?: string; wordCount?: number; selected?: boolean };
type ServerWord = { id: string; word: string; type?: string; meaning: string; category?: string; source?: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> { return apiRequest<T>(path, init); }

export async function mount(root: HTMLElement) {
  const words = await store.getWords();
  if (!words.length) for (const word of VOCAB_DATA) await store.putWord({ ...word, id: word.id ?? `vocab-${uuid()}` });
  try { const result = await api<{ user: typeof me }>("/auth/me"); me = result.user; } catch { me = null; }
  if (me) await hydrateServerVocabulary();
  await loadVocabularyState();
  renderShell(root);
  await render();
  installKeyboardShortcuts();
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
  document.getElementById("logout")?.addEventListener("click", async () => { await api("/auth/logout", { method: "POST" }).catch(() => undefined); location.reload(); });
  document.getElementById("vocab-manage")?.addEventListener("click", () => { location.href = "/vocabularies"; });
  document.getElementById("history-manage")?.addEventListener("click", () => { location.href = "/history"; });
  document.getElementById("settings-manage")?.addEventListener("click", () => { location.href = "/settings"; });
  document.querySelectorAll<HTMLButtonElement>("[data-quota]").forEach(b => b.addEventListener("click", async () => { quota = Number(b.dataset.quota); localStorage.setItem("daily-new-quota", String(quota)); resetSession(); syncControls(); await render(); }));
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(b => b.addEventListener("click", async () => { mode = b.dataset.mode as Mode; localStorage.setItem("study-mode", mode); resetSession(); answerVisible = false; syncControls(); await render(); }));
}

async function toggleVocabularyPanel() { if (!me) { location.href = "/login"; return; } const panel = document.getElementById("vocab-panel")!; panel.hidden = !panel.hidden; if (!panel.hidden) await renderVocabularyPanel(); }
async function toggleHistoryPanel() { if (!me) { location.href = "/login"; return; } const panel = document.getElementById("history-panel")!; panel.hidden = !panel.hidden; if (!panel.hidden) await renderHistoryPanel(); }

async function renderHistoryPanel() {
  const panel = document.getElementById("history-panel")!; panel.innerHTML = `<div class="empty"><p>正在读取学习历史…</p></div>`;
  try { const history = await getStudyHistory(30); const recent = history.days.slice().reverse(); const totalReviews = recent.reduce((sum, day) => sum + day.totalReviews, 0); const accuracy = totalReviews ? Math.round(recent.reduce((sum, day) => sum + day.accuracy * day.totalReviews, 0) / totalReviews) : 0; panel.innerHTML = `<div class="history-head"><div><strong>学习历史</strong><span>最近 30 天</span></div><div class="history-kpis"><b>${history.totalReviews}</b><small>累计复习</small><b>${history.activeDays}</b><small>活跃天数</small><b>${history.streak}</b><small>连续学习</small><b>${accuracy}%</b><small>平均正确率</small></div></div><div class="history-list">${recent.map(day => `<div class="history-row"><div><strong>${escapeHtml(day.date)}</strong><small>${day.learnedWords} 个单词 · ${day.totalReviews} 次复习</small></div><div class="history-bar"><span style="width:${Math.min(100, day.accuracy)}%"></span></div><b>${day.accuracy}%</b><small class="history-breakdown">${day.again}/${day.hard}/${day.good}/${day.easy}</small></div>`).join("") || `<div class="empty"><p>还没有学习记录。</p></div>`}</div>`; }
  catch { panel.innerHTML = `<div class="empty"><h2>暂时无法读取历史</h2><p>请登录并确认网络连接正常。</p></div>`; }
}

async function renderVocabularyPanel() {
  const panel = document.getElementById("vocab-panel")!;
  if (!vocabularies.length) { panel.innerHTML = `<div class="empty"><h2>还没有可用词库</h2><p>请先导入词库或等待系统词库部署。</p></div>`; return; }
  const stats = await Promise.all(vocabularies.map(async v => { try { return await api<{ wordCount: number; learned: number; due: number; new: number; masteryRate: number }>(`/vocabularies/${v.id}/stats`); } catch { return { wordCount: v.wordCount || 0, learned: 0, due: 0, new: v.wordCount || 0, masteryRate: 0 }; } }));
  panel.innerHTML = `<div class="vocab-head"><div><strong>我的词库</strong><span>选择后，今日新词只从启用的词库中抽取</span></div></div><div class="vocab-list">${vocabularies.map((v, i) => { const s = stats[i]; return `<div class="vocab-item"><div class="vocab-info"><label><input type="checkbox" data-vocab="${v.id}" ${v.selected ? "checked" : ""}><strong>${escapeHtml(v.name)}</strong></label><small>${escapeHtml(v.description || "系统词库")} · ${s.wordCount} 词</small><div class="vocab-progress"><span style="width:${Math.min(100, s.masteryRate)}%"></span></div><small>已学 ${s.learned} · 待复习 ${s.due} · 未学 ${s.new}</small></div><b>${s.masteryRate}%</b></div>`; }).join("")}</div>`;
  panel.querySelectorAll<HTMLInputElement>("[data-vocab]").forEach(input => input.addEventListener("change", async () => { const id = input.dataset.vocab!; try { await api(`/vocabularies/${id}/selection`, { method: "PUT", body: JSON.stringify({ enabled: input.checked }) }); await loadVocabularyState(); resetSession(); await renderVocabularyPanel(); await render(); } catch (error) { input.checked = !input.checked; alert(error instanceof Error ? error.message : "保存失败"); } }));
}

function resetSession() { sessionAnswered = 0; sessionTotal = 0; sessionKey = ""; syncError = ""; submittingReview = false; }
function getSessionKey() { return `${new Date().toISOString().slice(0, 10)}:${mode}:${quota}:${Array.from(selectedWordIds || []).sort().join(",")}`; }
function syncSession(total: number) { const key = getSessionKey(); if (sessionKey !== key) { sessionKey = key; sessionAnswered = Number(localStorage.getItem(`session:${key}`) || 0); sessionTotal = total; } }
function markAnswered() { sessionAnswered += 1; localStorage.setItem(`session:${sessionKey}`, String(sessionAnswered)); }
function syncControls() { document.querySelectorAll<HTMLButtonElement>("[data-quota]").forEach(b => b.classList.toggle("active", Number(b.dataset.quota) === quota)); document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(b => b.classList.toggle("active", b.dataset.mode === mode)); }
function installKeyboardShortcuts() { document.removeEventListener("keydown", handleKeydown); document.addEventListener("keydown", handleKeydown); }
function handleKeydown(event: KeyboardEvent) { const target = event.target as HTMLElement | null; if (target?.matches("input,textarea,select,[contenteditable='true']") || event.repeat) return; if (event.code === "Space") { event.preventDefault(); if (!answerVisible) showAnswer(); return; } if (["1","2","3","4"].includes(event.key) && answerVisible) { event.preventDefault(); void submitRating(Number(event.key) as Grade); } }
function showAnswer() { if (!current || answerVisible || submittingReview) return; answerVisible = true; renderCurrentCard(); }
async function submitRating(rating: Grade) {
  if (!current || !answerVisible || submittingReview) return;
  submittingReview = true;
  const word = current.word;
  try {
    const localReview = await review(word, rating);
    if (me) {
      try {
        await api(`/reviews`, {
          method: "POST",
          body: JSON.stringify({
            wordId: word.id,
            rating,
            reviewType: mode,
            reviewId: localReview.reviewId,
            reviewedAt: localReview.reviewedAt,
            card: {
              state: localReview.card.state,
              stability: localReview.card.stability,
              difficulty: localReview.card.difficulty,
              dueAt: localReview.card.due.toISOString(),
              reviewCount: localReview.card.reps,
              wrongCount: localReview.card.lapses,
              correctCount: Math.max(0, localReview.card.reps - localReview.card.lapses)
            }
          })
        });
        syncError = "";
      } catch {
        syncError = "本次学习已保存在本地，但云端同步失败。请稍后重新登录或检查网络。";
      }
    }
    markAnswered();
    answerVisible = false;
    await render();
  } finally {
    submittingReview = false;
  }
}

async function render() {
  const [allNew, allMandatory, allSelf, words] = await Promise.all([getNewRecommendations(quota), getMandatoryRecommendations(), getSelfReviewRecommendations(), store.getWords()]);
  const newRows = filterSelected(allNew), mandatoryRows = filterSelected(allMandatory), selfRows = filterSelected(allSelf);
  const rows = mode === "new" ? newRows : mode === "mandatory" ? mandatoryRows : selfRows;
  const total = mode === "new" ? Math.min(quota, newRows.length) : rows.length;
  syncSession(total);
  const totalForDisplay = sessionTotal;
  const remaining = Math.max(0, totalForDisplay - sessionAnswered);
  const statsEl = document.getElementById("stats")!; const modeLabel = mode === "new" ? "今日背诵" : mode === "mandatory" ? "强制复习" : "自主复习";
  const sessionLabel = document.getElementById("session-label")!; const sessionCount = document.getElementById("session-count")!;
  sessionLabel.textContent = modeLabel; sessionCount.textContent = `${Math.min(sessionAnswered, totalForDisplay)} / ${totalForDisplay}`;
  statsEl.innerHTML = `<div><b>${newRows.length}</b><span>今日新词</span></div><div><b>${mandatoryRows.length}</b><span>强制复习</span></div><div><b>${selfRows.length}</b><span>自主复习</span></div><div><b>${words.length}</b><span>本地词库</span></div>`;
  current = remaining > 0 ? rows[0] : undefined;
  const cardEl = document.getElementById("card")!;
  if (!current) { answerVisible = false; cardEl.innerHTML = `<div class="empty"><h2>${totalForDisplay ? "这一组完成了" : "暂时没有学习任务"}</h2><p>${syncError ? escapeHtml(syncError) : totalForDisplay ? `今日已完成 ${Math.min(sessionAnswered, totalForDisplay)} / ${totalForDisplay}` : (!me ? "登录后即可开始云端学习。" : selectedWordIds?.size === 0 ? "请先在「我的词库」中启用至少一个词库。" : mode === "new" ? "今天没有可用的新词。" : mode === "mandatory" ? "目前没有需要强制复习的词。" : "目前没有需要自主复习的词。")}</p></div>`; return; }
  sessionCount.textContent = `${Math.min(sessionAnswered + 1, totalForDisplay)} / ${totalForDisplay}`; renderCurrentCard(remaining, totalForDisplay);
}

function renderCurrentCard(remaining?: number, total?: number) {
  const cardEl = document.getElementById("card"); if (!cardEl || !current) return; const options = preview(current.card), w = current.word;
  const progress = remaining !== undefined && total !== undefined ? `<div class="session-progress"><span>本轮进度</span><strong>${Math.min(sessionAnswered + 1, total)} / ${total}</strong></div>` : "";
  const answer = answerVisible ? `<div class="answer"><p class="meaning">${escapeHtml(w.meaning)}</p>${w.example ? `<p class="example">${escapeHtml(w.example)}</p>` : ""}</div>` : `<button id="show-answer" class="show-answer">查看释义 <small>Space</small></button>`;
  const ratings = answerVisible ? `<div class="ratings">${reviewRatings.map((r, i) => `<button class="rating" data-rating="${r}" ${submittingReview ? "disabled" : ""}><strong>${ratingNames[r]}</strong><small>${i + 1} · ${stateName(options[r].card.state)} · ${formatInterval(options[r].card.due)}</small></button>`).join("")}</div>` : "";
  const syncNotice = syncError ? `<div class="sync-notice" role="status">${escapeHtml(syncError)}</div>` : "";
  cardEl.innerHTML = `<div class="word-card">${progress}${syncNotice}<div class="progress">${mode === "new" ? "今日新词" : mode === "mandatory" ? "强制复习" : "自主复习"}</div><h2>${escapeHtml(w.word)}</h2><div class="meta"><span>${escapeHtml(w.type || "")}</span><span>${escapeHtml(w.category || "")}</span></div>${answer}${ratings}</div>`;
  document.getElementById("show-answer")?.addEventListener("click", showAnswer); cardEl.querySelectorAll<HTMLButtonElement>("[data-rating]").forEach(b => b.addEventListener("click", () => void submitRating(Number(b.dataset.rating) as Grade)));
}

function formatInterval(date: Date) { const hours = Math.max(0, Math.round((date.getTime() - Date.now()) / 3600000)); if (hours < 24) return `${Math.max(1, hours)}小时后`; return `${Math.ceil(hours / 24)}天后`; }
function escapeHtml(value: string) { return value.replace(/[&<>\"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[ch]!)); }
