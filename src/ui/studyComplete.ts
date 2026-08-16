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
  const html = `<style>
    .study-complete{width:min(100%,720px);margin:0 auto;padding:42px 30px 34px;text-align:center}
    .study-complete .complete-mark{width:52px;height:52px;margin:0 auto 16px;border:1px solid #171717;border-radius:50%;display:grid;place-items:center;font-size:24px}
    .study-complete .summary-kicker{color:#808080;font-size:13px;margin-bottom:8px}
    .study-complete h2{font-size:34px;letter-spacing:-.04em;margin:0 0 10px}
    .study-complete .complete-total{font-size:54px;font-weight:750;letter-spacing:-.05em;margin:0 0 28px}
    .study-complete .complete-total span{font-size:20px;color:#999;font-weight:500;letter-spacing:-.02em}
    .study-complete .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #ededed;border-radius:10px;overflow:hidden;text-align:left}
    .study-complete .summary-grid div{padding:17px 16px;border-right:1px solid #ededed}
    .study-complete .summary-grid div:last-child{border-right:0}
    .study-complete .summary-grid strong{display:block;font-size:25px;font-weight:700}
    .study-complete .summary-grid span{display:block;margin-top:4px;color:#898989;font-size:12px}
    .study-complete .summary-lines{margin:20px auto 0;max-width:560px}
    .study-complete .summary-line{display:flex;justify-content:space-between;border-bottom:1px solid #f0f0f0;padding:15px 2px;color:#777}
    .study-complete .summary-line:last-child{border-bottom:0}
    .study-complete .summary-line strong{color:#171717}
    .study-complete .complete-actions{display:flex;justify-content:center;align-items:center;gap:10px;margin-top:22px}
    .study-complete .complete-actions .summary-back{min-width:150px;font-weight:650}
    .study-complete .complete-actions a{font-size:12px;color:#666;text-decoration:none;padding:10px}
    .study-complete .complete-actions a:hover{text-decoration:underline}
    @media(max-width:760px){.study-complete{padding:30px 16px 26px}.study-complete h2{font-size:28px}.study-complete .complete-total{font-size:44px}.study-complete .summary-grid{grid-template-columns:repeat(2,1fr)}.study-complete .summary-grid div:nth-child(2){border-right:0}.study-complete .summary-grid div:nth-child(-n+2){border-bottom:1px solid #ededed}.study-complete .complete-actions{flex-direction:column}}
  </style>
  <div class="study-complete"><div class="complete-mark">✓</div><div class="summary-kicker">${escapeHtml(modeLabel)}完成</div><h2>今天的学习完成了</h2><p class="complete-total">${completed} <span>/ ${total}</span></p><div class="summary-grid"><div><strong>${today.good}</strong><span>认识</span></div><div><strong>${today.hard}</strong><span>模糊</span></div><div><strong>${today.again}</strong><span>不认识</span></div><div><strong>${today.easy}</strong><span>很熟</span></div></div><div class="summary-lines"><div class="summary-line"><span>今日复习</span><strong>${today.totalReviews} 次</strong></div><div class="summary-line"><span>掌握率</span><strong>${masteryRate}%</strong></div><div class="summary-line"><span>已学习单词</span><strong>${today.learnedWords} 个</strong></div></div><div class="complete-actions"><button class="summary-back" data-go-home>返回学习</button><a href="/history">查看学习历史</a></div></div>`;
  container.innerHTML = html;
  container.querySelector<HTMLButtonElement>("[data-go-home]")?.addEventListener("click", () => { location.reload(); });
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[ch]!)); }
