import "./study.css";
import { apiRequest } from "../services/api";
import { Rating, review } from "../fsrs/adapter";
import type { Grade } from "../fsrs/adapter";
import { store } from "../db/db";
import { syncStudyData, uploadReview } from "../services/sync";

type Mode = "new" | "mandatory" | "self";
type ServerWord = { id: string; word: string; type?: string; meaning: string; category?: string; source?: string };
type ServerCard = { id: string; wordId: string; state: string; stability: number; difficulty: number; dueAt: string; firstLearnedAt?: string | null; lastReviewAt?: string | null; correctCount: number; wrongCount: number; reviewCount: number };
type Today = { review: ServerCard[]; newWords: ServerWord[]; newTotal: number; newCompleted: number; reviewTotal: number; reviewCompleted: number; mandatoryCompleted: number; mandatoryTotal: number; mandatoryRemaining: number; newUnlocked: boolean };
type TodayProgress = { mandatoryTotal: number; mandatoryCompleted: number; reviewRemaining?: number; newQuota: number };
type Item = { word: ServerWord; card?: ServerCard };

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]!));
}

async function loadItems(mode: Mode): Promise<{ items: Item[]; total: number }> {
  await syncStudyData().catch(() => undefined);
  const today = await apiRequest<Today>("/study/today");
  if (mode === "new" && !today.newUnlocked) {
    throw new Error(`今天还有 ${today.mandatoryRemaining} 项必做复习，请先完成复习。`);
  }
  const words = await apiRequest<ServerWord[]>("/words?selectedOnly=1&limit=500");
  const byId = new Map(words.map(word => [word.id, word]));

  if (mode === "new") {
    return { items: today.newWords.map(word => ({ word })), total: today.newTotal };
  }
  if (mode === "mandatory") {
    const items = today.review.map(card => ({ word: byId.get(card.wordId)!, card })).filter(item => item.word);
    return { items, total: items.length };
  }

  const cards = await apiRequest<ServerCard[]>("/cards");
  const learned = cards
    .filter(card => card.reviewCount > 0 && byId.has(card.wordId))
    .sort((a, b) => {
      const dueDelta = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      if (dueDelta !== 0) return dueDelta;
      return new Date(b.lastReviewAt || 0).getTime() - new Date(a.lastReviewAt || 0).getTime();
    });
  const items = learned.map(card => ({ word: byId.get(card.wordId)!, card }));
  return { items, total: items.length };
}

export async function mountStudy(root: HTMLElement, mode: Mode) {
  root.innerHTML = `<div class="study-page"><div class="study-loading">正在加载学习内容…</div></div>`;
  try {
    const progress = await apiRequest<TodayProgress>("/study/today/progress");
    const reviewRemaining = Math.max(0, progress.reviewRemaining ?? (progress.mandatoryTotal - progress.mandatoryCompleted));
    if (mode === "new" && reviewRemaining > 0) {
      root.innerHTML = `<main class="study-page"><section class="study-complete"><div class="study-complete-kicker">今日学习顺序</div><h2>请先完成今日复习</h2><p>还有 ${reviewRemaining} 项必做复习未完成。完成后才能开始学习新词。</p><a href="/study/review" class="study-home-btn">开始复习</a></section></main>`;
      return;
    }

    const { items, total } = await loadItems(mode);
    let index = 0;
    let answerVisible = false;
    const session = await apiRequest<{ sessionId: string }>("/study/session/start", { method: "POST", body: JSON.stringify({ mode }) });

    const render = () => {
      const item = items[index];
      const percent = total ? Math.min(100, Math.round((index / total) * 100)) : 100;
      const title = mode === "new" ? "学习新词" : mode === "mandatory" ? "今日复习" : "自主复习";
      const desc = mode === "new" ? "完成今天的新词学习" : mode === "mandatory" ? "完成今天必须完成的复习" : "可以自由复习已经学习过的单词";
      root.innerHTML = `<main class="study-page"><header class="study-session-head"><div><a href="/" class="study-back">← 返回首页</a><h1>${title}</h1><p>${desc}</p></div><div class="study-session-count">${Math.min(index + 1, total)} / ${total}</div></header><div class="study-session-track"><span style="width:${percent}%"></span></div>${item ? `<section class="study-word-panel"><div class="study-word-meta">${escapeHtml(item.word.category || "核心词")} ${item.word.type ? `· ${escapeHtml(item.word.type)}` : ""}</div><h2>${escapeHtml(item.word.word)}</h2><button class="study-reveal" id="study-reveal">${answerVisible ? "收起释义" : "显示释义"}</button>${answerVisible ? `<div class="study-answer"><div class="study-meaning">${escapeHtml(item.word.meaning)}</div><div class="study-source">${escapeHtml(item.word.source || "")}</div></div><div class="study-ratings"><button data-rating="1"><strong>不认识</strong><small>Again</small></button><button data-rating="2"><strong>模糊</strong><small>Hard</small></button><button data-rating="3"><strong>认识</strong><small>Good</small></button><button data-rating="4"><strong>很熟</strong><small>Easy</small></button></div>` : ""}</section>` : `<section class="study-complete"><div class="study-complete-kicker">本次学习完成</div><h2>${title}完成</h2><p>本次完成 ${total} 个单词。</p><a href="/" class="study-home-btn">返回首页</a></section>`}<div class="study-footnote">已学习 ${Math.min(index, total)} 个 · 本次进度会同步到你的账号</div></main>`;

      document.getElementById("study-reveal")?.addEventListener("click", () => { answerVisible = !answerVisible; render(); });
      root.querySelectorAll<HTMLButtonElement>("[data-rating]").forEach(button => button.addEventListener("click", async () => {
        button.disabled = true;
        const value = Number(button.dataset.rating);
        const rating = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy][value - 1] as Grade;
        const reviewType = mode === "new" ? "new" : mode === "mandatory" ? "mandatory" : "self";
        try {
          const result = await review(item.word, rating);
          const reviewRows = await store.getReviews(item.word.id);
          const saved = reviewRows.find(row => row.id === result.reviewId);
          if (saved) {
            saved.reviewType = reviewType;
            await uploadReview(saved);
          }
          await apiRequest("/study/today/progress", { method: "POST", body: JSON.stringify({ mode: reviewType }) });
          index += 1;
          answerVisible = false;
          render();
        } catch (error) {
          button.disabled = false;
          window.alert(error instanceof Error ? error.message : "提交失败，请重试");
        }
      }));
    };

    window.addEventListener("beforeunload", () => { void apiRequest(`/study/session/${session.sessionId}/stop`, { method: "POST" }); }, { once: true });
    render();
  } catch (error) {
    root.innerHTML = `<main class="study-page"><section class="study-error"><h2>学习内容加载失败</h2><p>${escapeHtml(error instanceof Error ? error.message : "请刷新页面后重试")}</p><a href="/">返回首页</a></section></main>`;
  }
}
