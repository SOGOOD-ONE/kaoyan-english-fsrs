import { getStudyHistory } from "../services/history";

export async function renderStudyComplete(container: HTMLElement, completed: number, total: number, modeLabel: string) {
  let today = { again: 0, hard: 0, good: 0, easy: 0, totalReviews: 0, learnedWords: 0 };
  try {
    const history = await getStudyHistory(1);
    const day = history.days[history.days.length - 1];
    if (day) today = day;
  } catch { /* completion view still works offline */ }

  const mastered = today.good + today.easy;
  const masteryRate = today.totalReviews ? Math.round((mastered / today.totalReviews) * 100) : 0;
  const html = `<div class="study-complete"><div class="complete-mark">✓</div><div class="summary-kicker">${escapeHtml(modeLabel)}完成</div><h2>今天的学习完成了</h2><p class="complete-total">${completed} <span>/ ${total}</span></p><div class="summary-grid"><div><strong>${today.good}</strong><span>认识</span></div><div><strong>${today.hard}</strong><span>模糊</span></div><div><strong>${today.again}</strong><span>不认识</span></div><div><strong>${today.easy}</strong><span>很熟</span></div></div><div class="summary-lines"><div class="summary-line"><span>今日复习</span><strong>${today.totalReviews} 次</strong></div><div class="summary-line"><span>掌握率</span><strong>${masteryRate}%</strong></div><div class="summary-line"><span>已学习单词</span><strong>${today.learnedWords} 个</strong></div></div><div class="complete-actions"><button class="summary-back" data-go-home>返回学习</button><a href="/history">查看学习历史</a></div></div>`;
  container.innerHTML = html;
  container.querySelector<HTMLButtonElement>("[data-go-home]")?.addEventListener("click", () => { location.reload(); });
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[ch]!)); }
