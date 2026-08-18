import "./study.css";
import { apiRequest } from "../services/api";
import { Rating, review } from "../fsrs/adapter";
import type { Grade } from "../fsrs/adapter";
import { store } from "../db/db";
import { syncStudyData, submitReviewToServer } from "../services/sync";

type Mode = "new" | "mandatory" | "self";
type Direction = "ec" | "ce";
type ServerWord = { id: string; word: string; type?: string; meaning: string; category?: string; source?: string };
type ServerCard = { id: string; wordId: string; state: string; stability: number; difficulty: number; dueAt: string; firstLearnedAt?: string | null; lastReviewAt?: string | null; correctCount: number; wrongCount: number; reviewCount: number };
type NewCard = { id?: string; wordId?: string; newEcCorrect: number; newCeCorrect: number; knownExcluded: boolean; newComplete: boolean };
type TodayProgress = { mandatoryTotal: number; mandatoryCompleted: number; reviewRemaining?: number; newQuota: number; newCompleted: number };
type NewQueueWord = ServerWord & { card: NewCard };
type NewQueue = { newUnlocked: boolean; mandatoryRemaining: number; quota: number; effectiveQuota?: number; available?: number; completed: number; words: NewQueueWord[] };
type ReviewQueue = { quota: number; completed: number; remaining: number; words: Array<ServerWord & { card: ServerCard }> };
type SelfQueue = { total: number; words: Array<ServerWord & { card: ServerCard }> };
type Item = { word: ServerWord; card?: ServerCard };

function escapeHtml(value: string) {
  return value.replace(/[&<>'\"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;" }[ch]!));
}

function shuffle<T>(values: T[]) { return [...values].sort(() => Math.random() - 0.5); }
function newDirection(card: NewCard): Direction { return card.newEcCorrect >= 2 ? "ce" : "ec"; }
function buildNewOptions(items: NewQueueWord[], current: NewQueueWord, direction: Direction) {
  const correct = direction === "ec" ? current.meaning : current.word;
  const pool = items.filter(item => item.id !== current.id).map(item => direction === "ec" ? item.meaning : item.word).filter(value => value && value !== correct);
  return shuffle([correct, ...shuffle([...new Set(pool)]).slice(0, 3)]);
}

async function loadItems(mode: Mode): Promise<{ items: Item[]; total: number }> {
  if (mode === "new") throw new Error("new mode is handled separately");
  if (mode === "mandatory") {
    const queue = await apiRequest<ReviewQueue>("/study/review-queue");
    const items = queue.words.map(entry => ({ word: entry, card: entry.card }));
    return { items, total: items.length };
  }
  await syncStudyData().catch(() => undefined);
  const queue = await apiRequest<SelfQueue>("/study/self-queue");
  const items = queue.words.map(entry => ({ word: entry, card: entry.card }));
  return { items, total: items.length };
}

async function stopSession(sessionId: string) {
  try { await fetch(`/api/study/session/${encodeURIComponent(sessionId)}/stop`, { method: "POST", credentials: "include", keepalive: true }); } catch {}
}

function renderStudyShell(root: HTMLElement, mode: Mode, item: Item | undefined, index: number, total: number, answerVisible: boolean) {
  const title = mode === "mandatory" ? "今日复习" : "自主复习";
  const desc = mode === "mandatory" ? "完成今天必须完成的复习" : "可以自由复习已经学习过的单词";
  const percent = total ? Math.min(100, Math.round((index / total) * 100)) : 100;
  root.innerHTML = `<main class="study-page"><header class="study-session-head"><div><a href="/" class="study-back">← 返回首页</a><h1>${title}</h1><p>${desc}</p></div><div class="study-session-count">${Math.min(index + 1, total)} / ${total}</div></header><div class="study-session-track"><span style="width:${percent}%"></span></div>${item ? `<section class="study-word-panel"><div class="study-word-meta">${escapeHtml(item.word.category || "核心词")} ${item.word.type ? `· ${escapeHtml(item.word.type)}` : ""}</div><h2 id="study-word">${escapeHtml(item.word.word)}</h2><button class="study-reveal" id="study-reveal">${answerVisible ? "收起释义" : "显示释义"}</button><button class="study-known-button" data-action="known">认识，划掉</button><div id="study-answer-slot">${answerVisible ? `<div class="study-answer"><div class="study-meaning">${escapeHtml(item.word.meaning)}</div><div class="study-source">${escapeHtml(item.word.source || "")}</div></div><div class="study-ratings"><button data-action="rating" data-rating="1"><strong>不认识</strong><small>Again</small></button><button data-action="rating" data-rating="2"><strong>模糊</strong><small>Hard</small></button><button data-action="rating" data-rating="3"><strong>认识</strong><small>Good</small></button><button data-action="rating" data-rating="4"><strong>很熟</strong><small>Easy</small></button></div>` : ""}</div></section>` : `<section class="study-complete"><div class="study-complete-kicker">本次学习完成</div><h2>${title}完成</h2><p>本次完成 ${total} 个单词。</p><a href="/" class="study-home-btn">返回首页</a></section>`}<div class="study-footnote">已学习 <span>${Math.min(index, total)}</span> 个 · 本次进度会同步到你的账号</div></main>`;
}

export async function mountStudy(root: HTMLElement, mode: Mode) {
  root.innerHTML = `<div class="study-page"><div class="study-loading">正在加载学习内容…</div></div>`;
  try {
    const progress = await apiRequest<TodayProgress>("/study/today/progress");
    const reviewRemaining = Math.max(0, progress.reviewRemaining ?? (progress.mandatoryTotal - progress.mandatoryCompleted));

    if (mode === "new") {
      if (reviewRemaining > 0) {
        root.innerHTML = `<main class="study-page"><section class="study-complete"><div class="study-complete-kicker">今日学习顺序</div><h2>请先完成今日复习</h2><p>还有 ${reviewRemaining} 项必做复习未完成。完成后才能开始学习新词。</p><a href="/study/review" class="study-home-btn">开始复习</a></section></main>`;
        return;
      }
      const queue = await apiRequest<NewQueue>("/study/new-queue");
      if (!queue.newUnlocked) throw new Error(`今天还有 ${queue.mandatoryRemaining} 项必做复习，请先完成复习。`);
      const words = queue.words;
      const total = words.length;
      if (!total) {
        root.innerHTML = `<main class="study-page"><section class="study-complete"><div class="study-complete-kicker">今日新词</div><h2>今天的新词已经完成</h2><p>当前启用词库没有更多需要学习的新词。</p><a href="/" class="study-home-btn">返回首页</a></section></main>`;
        return;
      }

      let index = 0;
      const session = await apiRequest<{ sessionId: string }>("/study/session/start", { method: "POST", body: JSON.stringify({ mode: "new" }) });
      const handlePageHide = () => { void stopSession(session.sessionId); };
      window.addEventListener("pagehide", handlePageHide, { once: true });

      const renderNew = (message = "") => {
        const current = words[index];
        const card = current.card || { newEcCorrect: 0, newCeCorrect: 0, knownExcluded: false, newComplete: false };
        const direction = newDirection(card);
        const options = buildNewOptions(words, current, direction);
        const question = direction === "ec" ? "这个单词的中文意思是？" : "下面哪个英文单词对应这个中文？";
        const prompt = direction === "ec" ? current.word : current.meaning;
        const correctStage = card.newEcCorrect + card.newCeCorrect;
        const percent = Math.min(100, Math.round((index / total) * 100));
        root.innerHTML = `<main class="study-page"><header class="study-session-head"><div><a href="/" class="study-back">← 返回首页</a><h1>学习新词</h1><p>2 次英译汉 + 1 次汉译英，正确完成 3 次后才进入 FSRS</p></div><div class="study-session-count">${index + 1} / ${total}</div></header><div class="study-session-track"><span style="width:${percent}%"></span></div><section class="study-word-panel new-learning-panel"><div class="study-word-meta">${escapeHtml(current.category || "核心词")} ${current.type ? `· ${escapeHtml(current.type)}` : ""}</div><div class="new-learning-stage">${correctStage}/3 · ${direction === "ec" ? "英 → 汉" : "汉 → 英"}</div><h2 class="new-learning-question">${escapeHtml(question)}</h2><div class="new-learning-prompt">${escapeHtml(prompt)}</div><div class="new-learning-options">${options.map(option => `<button class="new-learning-option" data-action="new-answer" data-option="${encodeURIComponent(option)}">${escapeHtml(option)}</button>`).join("")}</div><button class="study-known-button" data-action="known">认识，划掉</button>${message ? `<div class="new-learning-message">${escapeHtml(message)}</div>` : ""}</section><div class="study-footnote">今日已完成 ${queue.completed} 个 · 当前单词进度 ${correctStage}/3</div></main>`;
      };
      renderNew();

      root.addEventListener("click", async event => {
        const target = event.target as HTMLElement;
        const actionElement = target.closest<HTMLElement>("[data-action]");
        if (!actionElement) return;
        const action = actionElement.dataset.action;
        if (action === "known") {
          try {
            await apiRequest("/study/known-exclude", { method: "POST", body: JSON.stringify({ wordId: words[index].id, mode: "new" }) });
            index += 1;
            if (index >= total) {
              await stopSession(session.sessionId);
              window.removeEventListener("pagehide", handlePageHide);
              root.innerHTML = `<main class="study-page"><section class="study-complete"><div class="study-complete-kicker">本次学习完成</div><h2>新词学习完成</h2><p>本次处理 ${total} 个单词。</p><a href="/" class="study-home-btn">返回首页</a></section></main>`;
            } else renderNew();
          } catch { renderNew("暂时无法保存“认识”，请重试。"); }
          return;
        }
        if (action === "new-answer") {
          const current = words[index];
          const direction = newDirection(current.card || { newEcCorrect: 0, newCeCorrect: 0, knownExcluded: false, newComplete: false });
          const selected = decodeURIComponent(actionElement.dataset.option || "");
          const correctAnswer = direction === "ec" ? current.meaning : current.word;
          const correct = selected === correctAnswer;
          try {
            const result = await apiRequest<{ completed: boolean; card: NewCard }>("/study/new-answer", { method: "POST", body: JSON.stringify({ wordId: current.id, direction, correct }) });
            current.card = result.card;
            if (!correct) {
              renderNew("再试一次");
              return;
            }
            if (!result.completed) {
              renderNew();
              return;
            }
            const fsrsResult = await review(current, Rating.Good as Grade);
            const reviewRows = await store.getReviews(current.id);
            const saved = reviewRows.find(row => row.id === fsrsResult.reviewId);
            if (!saved) throw new Error("学习记录保存失败，请重试");
            saved.reviewType = "new";
            await submitReviewToServer(saved);
            await store.markReviewSynced(saved.id);
            index += 1;
            if (index >= total) {
              await stopSession(session.sessionId);
              window.removeEventListener("pagehide", handlePageHide);
              root.innerHTML = `<main class="study-page"><section class="study-complete"><div class="study-complete-kicker">本次学习完成</div><h2>新词学习完成</h2><p>本次完成 ${total} 个单词。</p><a href="/" class="study-home-btn">返回首页</a></section></main>`;
            } else renderNew();
          } catch (error) { renderNew(error instanceof Error ? error.message : "提交失败，请重试"); }
        }
      });
      return;
    }

    const { items, total } = await loadItems(mode);
    if (!total) {
      root.innerHTML = `<main class="study-page"><section class="study-complete"><div class="study-complete-kicker">本次学习</div><h2>没有可学习的单词</h2><p>当前没有需要处理的卡片。</p><a href="/" class="study-home-btn">返回首页</a></section></main>`;
      return;
    }
    let index = 0;
    let answerVisible = false;
    const session = await apiRequest<{ sessionId: string }>("/study/session/start", { method: "POST", body: JSON.stringify({ mode }) });
    const handlePageHide = () => { void stopSession(session.sessionId); };
    window.addEventListener("pagehide", handlePageHide, { once: true });
    const render = () => renderStudyShell(root, mode, items[index], index, total, answerVisible);
    render();
    root.addEventListener("click", async event => {
      const target = event.target as HTMLElement;
      const actionElement = target.closest<HTMLElement>("[data-action]");
      if (actionElement?.dataset.action === "known") {
        try {
          await apiRequest("/study/known-exclude", { method: "POST", body: JSON.stringify({ wordId: items[index].word.id, mode }) });
          index += 1;
          if (index >= total) {
            await stopSession(session.sessionId);
            window.removeEventListener("pagehide", handlePageHide);
            renderStudyShell(root, mode, undefined, total, total, false);
          } else { answerVisible = false; render(); }
        } catch { window.alert("无法保存“认识”，请重试"); }
        return;
      }
      if (target.closest("#study-reveal")) { answerVisible = !answerVisible; render(); return; }
      if (actionElement?.dataset.action === "rating") {
        const button = actionElement as HTMLButtonElement;
        try {
          const value = Number(button.dataset.rating);
          const rating = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy][value - 1] as Grade;
          const item = items[index];
          const result = await review(item.word, rating);
          const reviewRows = await store.getReviews(item.word.id);
          const saved = reviewRows.find(row => row.id === result.reviewId);
          if (!saved) throw new Error("学习记录保存失败，请重试");
          saved.reviewType = mode === "mandatory" ? "mandatory" : "self";
          await submitReviewToServer(saved);
          await store.markReviewSynced(saved.id);
          index += 1;
          answerVisible = false;
          if (index >= total) { await stopSession(session.sessionId); window.removeEventListener("pagehide", handlePageHide); renderStudyShell(root, mode, undefined, total, total, false); }
          else render();
        } catch (error) { window.alert(error instanceof Error ? error.message : "提交失败，请重试"); }
      }
    });
  } catch (error) {
    root.innerHTML = `<main class="study-page"><section class="study-error"><h2>学习内容加载失败</h2><p>${escapeHtml(error instanceof Error ? error.message : "请刷新页面后重试")}</p><a href="/">返回首页</a></section></main>`;
  }
}
