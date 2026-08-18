import "./history.css";
import { getStudyHistory } from "../services/history";
import { renderNav } from "./nav";

export async function mountHistory(root: HTMLElement) {
  root.innerHTML = `<main class="shell page history-page"><header class="page-header"><div><h1>学习历史</h1><p>只显示已经发生学习的日期</p></div>${renderNav("/history")}</header><section class="panel" id="history-page"></section></main>`;
  await renderHistory(root.querySelector("#history-page") as HTMLElement);
}

async function renderHistory(container: HTMLElement) {
  try {
    const history = await getStudyHistory(30);
    const days = history.days
      .filter(day => Number((day as any).reviews ?? (day as any).totalReviews ?? 0) > 0 || Number((day as any).words ?? (day as any).learnedWords ?? 0) > 0)
      .slice()
      .reverse();

    container.innerHTML = `
      <div class="history-overview">
        <div class="history-overview-title">
          <strong>最近 30 天</strong>
          <span>${days.length ? `共 ${days.length} 个学习日` : "暂时还没有学习记录"}</span>
        </div>
        <div class="history-overview-stats">
          <div><b>${history.activeDays}</b><small>活跃天数</small></div>
          <div><b>${history.totalReviews}</b><small>累计复习</small></div>
          <div><b>${history.streak}</b><small>连续学习</small></div>
        </div>
      </div>
      <div class="history-day-list">
        ${days.map(day => {
          const studiedWords = Number((day as any).words ?? (day as any).learnedWords ?? 0);
          const reviews = Number((day as any).reviews ?? (day as any).totalReviews ?? 0);
          return `
            <article class="history-day-card">
              <div class="history-day-date">${escapeHtml(formatDate(day.date))}</div>
              <div class="history-day-summary"><strong>${studiedWords} 个单词</strong><span>${reviews} 次复习</span></div>
              <div class="history-rating-summary">
                <span>Again <b>${day.again}</b></span>
                <span>Hard <b>${day.hard}</b></span>
                <span>Good <b>${day.good}</b></span>
                <span>Easy <b>${day.easy}</b></span>
              </div>
              <div class="history-day-accuracy">正确率 <strong>${Number(day.accuracy ?? 0)}%</strong></div>
            </article>`;
        }).join("") || `<div class="history-empty"><h2>还没有学习记录</h2><p>开始第一次学习后，这里会按天显示你的学习数据。</p></div>`}
      </div>`;
  } catch {
    container.innerHTML = `<div class="history-empty"><h2>暂时无法读取历史</h2><p>请登录并确认网络连接正常。</p></div>`;
  }
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}/${month}/${day}`;
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[ch]!)); }
