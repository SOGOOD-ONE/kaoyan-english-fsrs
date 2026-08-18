import "./study.css";
import { apiRequest } from "../services/api";
import { Rating, review } from "../fsrs/adapter";
import { store } from "../db/db";
import { syncStudyData, uploadReview } from "../services/sync";

type Mode = "new" | "self";
type ServerWord = { id: string; word: string; type?: string; meaning: string; category?: string; source?: string };
type Today = { review: { wordId: string; state: string; stability: number; difficulty: number; dueAt: string; reviewCount: number }[]; newWords: ServerWord[]; newTotal: number; newCompleted: number; reviewTotal: number; reviewCompleted: number };
type Item = { word: ServerWord; card?: Today["review"][number] };

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]!));
}

async function loadItems(mode: Mode): Promise<{ items: Item[]; total: number; done: number }> {
  await syncStudyData().catch(() => undefined);
  const today = await apiRequest<Today>("/study/today");
  const words = await apiRequest<ServerWord[]>("/words?selectedOnly=1&limit=500");
  const byId = new Map(words.map(word => [word.id, word]));
  if (mode === "new") return { items: today.newWords.map(word => ({ word })), total: today.newTotal, done: today.newCompleted };
  const items = today.review.map(card => ({ word: byId.get(card.wordId)!, card })).filter(item => item.word);
  return { items, total: today.reviewTotal, done: today.reviewCompleted };
}

export async function mountStudy(root: HTMLElement, mode: Mode) {
  root.innerHTML = `<div class="study-page"><div class="study-loading">正在加载学习内容…</div></div>`;
  try {
    const { items, total } = await loadItems(mode);
    let index = 0;
    let answerVisible = false;
    const session = await apiRequest<{ sessionId: string }>("/study/session/start", { method: "POST", body: JSON.stringify({ mode }) });

    const render = () => {
      const item = items[index];
      const percent = total ? Math.min(100, Math.round((index / total) * 100)) : 100;
      root.innerHTML = `<main class="study-page"><header class="study-session-head"><div><a href="/" class="study-back">← 返回首页</a><h1>${mode === "new" ? "学习新词" : "自主复习"}</h1><p>${mode === "new" ? "完成今天的新词学习" : "复习当前已经到期的单词"}</p></div><div class="study-session-count">${Math.min(index + 1, total)} / ${total}</div></header><div class="study-session-track"><span style="width:${percent}%"></span></div>${item ? `<section class="study-word-panel"><div class="study-word-meta">${escapeHtml(item.word.category || "核心词")} ${item.word.type ? `· ${escapeHtml(item.word.type)}` : ""}</div><h2>${escapeHtml(item.word.word)}</h2><button class="study-reveal" id="study-reveal">${answerVisible ? "收起释义" : "显示释义"}</button>${answerVisible ? `<div class="study-answer"><div class="study-meaning">${escapeHtml(item.word.meaning)}</div><div class="study-source">${escapeHtml(item.word.source || "")}</div></div><div class="study-ratings"><button data-rating="1"><strong>不认识</strong><small>Again</small></button><button data-rating="2"><strong>模糊</strong><small>Hard</small></button><button data-rating="3"><strong>认识</strong><small>Good</small></button><button data-rating="4"><strong>很熟</strong><small>Easy</small></button></div>` : ""}</section>` : `<section class="study-complete"><div class="study-complete-kicker">本次学习完成</div><h2>${mode === "new" ? "新词学习完成" : "复习完成"}</h2><p>本次完成 ${total} 个单词。</p><a href="/" class="study-home-btn">返回首页</a></section>`}<div class="study-footnote">已学习 ${Math.min(index, total)} 个 · 本次进度会同步到你的账号</div></main>`;

      document.getElementById("study-reveal")?.addEventListener("click", () => { answerVisible = !answerVisible; render(); });
      root.querySelectorAll<HTMLButtonElement>("[data-rating]").forEach(button => button.addEventListener("click", async () => {
        button.disabled = true;
        const value = Number(button.dataset.rating);
        const rating = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy][value - 1];
        try {
          const result = await review(item.word, rating);
          const reviewRows = await store.getReviews(item.word.id);
          const saved = reviewRows.find(row => row.id === result.reviewId);
          if (saved) await uploadReview(saved);
          await apiRequest("/study/today/progress", { method: "POST", body: JSON.stringify({ mode }) });
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
