import { store } from "../db/db";
import { Rating } from "../fsrs/adapter";

type Summary = { totalReviews: number; again: number; hard: number; good: number; easy: number };

export async function showStudySummary(root: HTMLElement, sessionTotal: number) {
  const reviews = await store.getReviews();
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const end = start + 86400000;
  const todayReviews = reviews.filter(r => r.reviewedAt >= start && r.reviewedAt < end);
  const summary: Summary = {
    totalReviews: todayReviews.length,
    again: todayReviews.filter(r => r.rating === Rating.Again).length,
    hard: todayReviews.filter(r => r.rating === Rating.Hard).length,
    good: todayReviews.filter(r => r.rating === Rating.Good).length,
    easy: todayReviews.filter(r => r.rating === Rating.Easy).length,
  };
  const first = todayReviews.reduce<number | null>((min, r) => min === null ? r.reviewedAt : Math.min(min, r.reviewedAt), null);
  const last = todayReviews.reduce<number | null>((max, r) => max === null ? r.reviewedAt : Math.max(max, r.reviewedAt), null);
  const minutes = first !== null && last !== null ? Math.max(1, Math.round((last - first) / 60000)) : 0;
  const correctness = summary.totalReviews ? Math.round((summary.good + summary.easy) / summary.totalReviews * 100) : 0;

  const card = root.querySelector<HTMLElement>("#card");
  if (!card) return;
  card.innerHTML = `<div class="study-summary"><div class="summary-kicker">今日学习完成</div><h2>${sessionTotal} / ${sessionTotal}</h2><div class="summary-grid"><div><strong>${summary.good + summary.easy}</strong><span>认识</span></div><div><strong>${summary.hard}</strong><span>模糊</span></div><div><strong>${summary.again}</strong><span>不认识</span></div><div><strong>${summary.easy}</strong><span>很熟</span></div></div><div class="summary-line"><span>学习记录</span><strong>${summary.totalReviews} 次</strong></div><div class="summary-line"><span>正确掌握率</span><strong>${correctness}%</strong></div><div class="summary-line"><span>学习时段</span><strong>${minutes ? `${minutes} 分钟` : "—"}</strong></div><button id="summary-back" class="summary-back">返回首页</button></div>`;
  document.getElementById("summary-back")?.addEventListener("click", () => location.reload());
}
