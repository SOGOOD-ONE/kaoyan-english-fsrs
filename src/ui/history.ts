import { getStudyHistory } from "../services/history";
import { renderNav } from "./nav";

export async function mountHistory(root: HTMLElement) {
  root.innerHTML = `<main class="shell page"><header class="page-header"><div><h1>学习历史</h1><p>按天查看你的学习情况</p></div>${renderNav("/history")}</header><section class="panel" id="history-page"></section></main>`;
  await renderHistory(root.querySelector("#history-page") as HTMLElement);
}

async function renderHistory(container: HTMLElement) {
  try {
    const history = await getStudyHistory(30);
    const days = history.days.slice().reverse();
    const totalReviews = days.reduce((sum, day) => sum + day.totalReviews, 0);
    const accuracy = totalReviews ? Math.round(days.reduce((sum, day) => sum + day.accuracy * day.totalReviews, 0) / totalReviews) : 0;
    container.innerHTML = `
      <div class="history-page-head">
        <div><strong>最近 30 天</strong><span>每天只显示汇总数据</span></div>
        <div class="history-kpis">
          <div><b>${history.totalReviews}</b><small>累计复习</small></div>
          <div><b>${history.activeDays}</b><small>活跃天数</small></div>
          <div><b>${history.streak}</b><small>连续学习</small></div>
          <div><b>${accuracy}%</b><small>平均正确率</small></div>
        </div>
      </div>
      <div class="history-day-list">
        ${days.map(day => `
          <article class="history-day-row">
            <div class="history-day-date"><strong>${escapeHtml(day.date)}</strong><span>${day.learnedWords} 个单词 · ${day.totalReviews} 次复习</span></div>
            <div class="history-day-metrics">
              <span>正确率 ${day.accuracy}%</span>
              <span>Again ${day.again}</span>
              <span>Hard ${day.hard}</span>
              <span>Good ${day.good}</span>
              <span>Easy ${day.easy}</span>
            </div>
          </article>`).join("") || `<div class="empty"><h2>还没有学习记录</h2><p>完成第一轮学习后，这里会按天生成汇总。</p></div>`}
      </div>`;
  } catch {
    container.innerHTML = `<div class="empty"><h2>暂时无法读取历史</h2><p>请登录并确认网络连接正常。</p></div>`;
  }
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[ch]!)); }
