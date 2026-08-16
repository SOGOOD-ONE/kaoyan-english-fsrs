import { Rating, preview, review, stateName, type Grade } from "../fsrs/adapter";
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
if (![80, 100, 150, 200].includes(quota)) quota = 100;
let current: Recommendation | undefined;
let me: { id: string; email: string; nickname: string } | null = null;
let vocabularySelections: Record<string, boolean> = {};
let vocabularies: VocabularySummary[] = [];
let selectedWordIds: Set<string> | null = null;

type VocabularySummary = { id: string; name: string; kind: string; priority: number; description?: string; wordCount?: number; selected?: boolean };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `API ${response.status}`);
  return response.json();
}

export async function mount(root: HTMLElement) {
  const words = await store.getWords();
  if (!words.length) for (const word of VOCAB_DATA) await store.putWord({ ...word, id: word.id ?? `vocab-${crypto.randomUUID()}` });
  try { const result = await api<{ user: typeof me }>("/auth/me"); me = result.user; } catch { me = null; }
  await loadVocabularyState();
  renderShell(root);
  await render();
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

function filterSelected(rows: Recommendation[]) { if (!me || selectedWordIds === null) return rows; return rows.filter(r => !!r.word.id && selectedWordIds.has(r.word.id)); }

function renderShell(root: HTMLElement) {
  root.innerHTML = `<main class="shell"><header><div><h1>考研英语</h1><p>专注真题语境的智能背词</p></div><div class="actions"><span id="user-area">${me ? `你好，${escapeHtml(me.nickname)} <button id="logout">退出</button>` : `<button id="login">登录 / 注册</button>`}</span><button id="vocab-manage">我的词库</button><button id="export">导出</button><label class="button">导入词汇<input id="import" type="file" accept=".xlsx,.xls,.csv,.json" hidden></label></div></header><section id="vocab-panel" class="panel vocab-panel" hidden></section><section class="panel plan-panel"><div class="plan-title"><div><strong>每日新词</strong><span>今天计划背多少个？</span></div></div><div class="quota-row">${QUOTAS.map(q => `<button class="quota ${q === quota ? "active" : ""}" data-quota="${q}">${q}</button>`).join("")}</div></section><section class="panel mode-panel"><button class="mode ${mode === "new" ? "active" : ""}" data-mode="new"><strong>今日背诵</strong><span>按计划学习新词</span></button><button class="mode ${mode === "mandatory" ? "active" : ""}" data-mode="mandatory"><strong>强制复习</strong><span>复习昨天背过的词</span></button><button class="mode ${mode === "self" ? "active" : ""}" data-mode="self"><strong>自主复习</strong><span>算法判断需要复习的词</span></button></section><section class="panel"><div class="stats" id="stats"></div></section><section class="panel" id="card"></section></main>`;
  document.getElementById("export")!.addEventListener("click", async () => downloadJson(await exportData(), "kaoyan-fsrs-backup.json"));
  document.getElementById("import")!.addEventListener("change", async e => { const input = e.target as HTMLInputElement, file = input.files?.[0]; if (!file) return; try { const result = await importVocabularyFile(file); alert(`识别 ${result.sourceRows} 行，新增 ${result.inserted}，更新 ${result.updated}，去重 ${result.duplicates}`); await render(); } catch (error) { alert(error instanceof Error ? error.message : "导入失败"); } finally { input.value = ""; } });
  document.getElementById("login")?.addEventListener("click", showAuth);
  document.getElementById("logout")?.addEventListener("click", async () => { await api("/auth/logout", { method: "POST" }).catch(() => undefined); me = null; await loadVocabularyState(); renderShell(root); await render(); });
  document.getElementById("vocab-manage")!.addEventListener("click", toggleVocabularyPanel);
  document.querySelectorAll<HTMLButtonElement>("[data-quota]").forEach(b => b.addEventListener("click", async () => { quota = Number(b.dataset.quota); localStorage.setItem("daily-new-quota", String(quota)); syncControls(); await render(); }));
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(b => b.addEventListener("click", async () => { mode = b.dataset.mode as Mode; localStorage.setItem("study-mode", mode); syncControls(); await render(); }));
}

async function toggleVocabularyPanel() { if (!me) { showAuth(); return; } const panel = document.getElementById("vocab-panel")!; panel.hidden = !panel.hidden; if (!panel.hidden) await renderVocabularyPanel(); }

async function renderVocabularyPanel() {
  const panel = document.getElementById("vocab-panel")!;
  if (!vocabularies.length) { panel.innerHTML = `<div class="empty"><h2>还没有可用词库</h2><p>请先导入词库或等待系统词库部署。</p></div>`; return; }
  const stats = await Promise.all(vocabularies.map(async v => { try { return await api<{ wordCount: number; learned: number; due: number; new: number; masteryRate: number }>(`/vocabularies/${v.id}/stats`); } catch { return { wordCount: v.wordCount || 0, learned: 0, due: 0, new: v.wordCount || 0, masteryRate: 0 }; } }));
  panel.innerHTML = `<div class="vocab-head"><div><strong>我的词库</strong><span>选择后，今日新词只从启用的词库中抽取</span></div></div><div class="vocab-list">${vocabularies.map((v, i) => { const s = stats[i]; return `<div class="vocab-item"><div class="vocab-info"><label><input type="checkbox" data-vocab="${v.id}" ${v.selected ? "checked" : ""}><strong>${escapeHtml(v.name)}</strong></label><small>${escapeHtml(v.description || "系统词库")} · ${s.wordCount} 词</small><div class="vocab-progress"><span style="width:${Math.min(100, s.masteryRate)}%"></span></div><small>已学 ${s.learned} · 待复习 ${s.due} · 未学 ${s.new}</small></div><b>${s.masteryRate}%</b></div>`; }).join("")}</div>`;
  panel.querySelectorAll<HTMLInputElement>("[data-vocab]").forEach(input => input.addEventListener("change", async () => { const id = input.dataset.vocab!; try { await api(`/vocabularies/${id}/selection`, { method: "PUT", body: JSON.stringify({ enabled: input.checked }) }); await loadVocabularyState(); await renderVocabularyPanel(); await render(); } catch (error) { input.checked = !input.checked; alert(error instanceof Error ? error.message : "保存失败"); } }));
}

function showAuth() {
  const email = prompt("邮箱"); if (!email) return; const password = prompt("密码（至少 8 位）"); if (!password) return; const nickname = prompt("昵称（注册时填写，已有账号可直接回车）") || "考研用户";
  api<{ user: { id: string; email: string; nickname: string } }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }).then(result => { me = result.user; location.reload(); }).catch(async error => { if (error.message !== "invalid_credentials") { alert(error.message); return; } try { const result = await api<{ user: { id: string; email: string; nickname: string } }>("/auth/register", { method: "POST", body: JSON.stringify({ email, password, nickname }) }); me = result.user; location.reload(); } catch (registerError) { alert(registerError instanceof Error ? registerError.message : "登录失败"); } });
}

function syncControls() { document.querySelectorAll<HTMLButtonElement>("[data-quota]").forEach(b => b.classList.toggle("active", Number(b.dataset.quota) === quota)); document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(b => b.classList.toggle("active", b.dataset.mode === mode)); }

async function render() {
  const [allNew, allMandatory, allSelf, words] = await Promise.all([getNewRecommendations(quota), getMandatoryRecommendations(), getSelfReviewRecommendations(), store.getWords()]);
  const newRows = filterSelected(allNew), mandatoryRows = filterSelected(allMandatory), selfRows = filterSelected(allSelf), rows = mode === "new" ? newRows : mode === "mandatory" ? mandatoryRows : selfRows;
  document.getElementById("stats")!.innerHTML = `<div><b>${newRows.length}</b><span>今日新词</span></div><div><b>${mandatoryRows.length}</b><span>强制复习</span></div><div><b>${selfRows.length}</b><span>自主复习</span></div><div><b>${words.length}</b><span>本地词库</span></div>`;
  const cardEl = document.getElementById("card")!; current = rows[0];
  if (!current) { const message = me && selectedWordIds?.size === 0 ? "请先在「我的词库」中启用至少一个词库。" : mode === "new" ? `今天的 ${quota} 个新词已经完成。` : mode === "mandatory" ? "昨天背过的词已经全部复习。" : "目前没有需要自主复习的词。"; cardEl.innerHTML = `<div class="empty"><h2>这一组完成了</h2><p>${message}</p></div>`; return; }
  const options = preview(current.card), w = current.word;
  cardEl.innerHTML = `<div class="word-card"><div class="progress">${mode === "new" ? "今日新词" : mode === "mandatory" ? "强制复习" : "自主复习"}</div><h2>${escapeHtml(w.word)}</h2><div class="meta"><span>${escapeHtml(w.type || "")}</span><span>${escapeHtml(w.category || "")}</span></div><p class="meaning">${escapeHtml(w.meaning)}</p>${w.example ? `<p class="example">${escapeHtml(w.example)}</p>` : ""}<div class="ratings">${reviewRatings.map(r => `<button class="rating" data-rating="${r}"><strong>${ratingNames[r]}</strong><small>${stateName(options[r].card.state)} · ${formatInterval(options[r].card.due)}</small></button>`).join("")}</div></div>`;
  cardEl.querySelectorAll<HTMLButtonElement>("[data-rating]").forEach(b => b.addEventListener("click", async () => { if (!current) return; const wordId = current.word.id, rating = Number(b.dataset.rating) as Grade; await review(current.word, rating); try { await api(`/reviews`, { method: "POST", body: JSON.stringify({ wordId, rating, reviewType: mode }) }); } catch { } await render(); }));
}

function formatInterval(date: Date) { const hours = Math.max(0, Math.round((date.getTime() - Date.now()) / 3600000)); if (hours < 24) return `${Math.max(1, hours)}小时后`; return `${Math.ceil(hours / 24)}天后`; }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[ch]!)); }
