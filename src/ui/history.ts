import { getStudyHistory } from "../services/history";
import { renderNav } from "./nav";

export async function mountHistory(root: HTMLElement) {
  root.innerHTML = `<main class="shell page history-page"><header class="page-header"><div><h1>学习历史</h1><p>按天查看你的学习情况，不展示单词明细</p></div>${renderNav("/history")}</header><section class="panel" id="history-page"></section></main>`;
  await renderHistory(root.querySelector("#history-page") as HTMLElement);
}

async function renderHistory(container: HTMLElement) {
  try {
    const history = await getStudyHistory(30);
    const days = history.days.slice().reverse();
    const totalReviews = history.totalReviews;

    container.innerHTML = `
      <div class="history-overview">
        <div class="history-overview-title">
          <strong>最近 30 天</strong>
          <span>每天只显示整体学习表现</span>
        </div>
        <div class="history-overview-stats">
          <div><b>${history.activeDays}</b><small>活跃天数</small></div>
          <div><b>${totalReviews}</b><small>累计复习</small></div>
          <div><b>${history.streak}</b><small>连续学习</small></div>
        </div>
      </div>
      <div class="history-day-list">
        ${days.map(day => {
          const studiedWords = Number((day as any).words ?? (day as any).learnedWords ?? 0);
          const reviews = Number((day as any).reviews ?? (day as any).totalReviews ?? 0);
          const accuracy = Number(day.accuracy ?? 0);
          const hasStudy = reviews > 0 || studiedWords > 0;
          return `
            <article class="history-day-card ${hasStudy ? "has-study" : "empty-day"}">
              <div class="history-day-main">
                <div class="history-day-date">${escapeHtml(formatDate(day.date))}</div>
                <div class="history-day-summary">
                  <strong>${studiedWords} 个单词</strong>
                  <span>${reviews} 次复习</span>
                  ${hasStudy ? `<span>正确率 ${accuracy}%</span>` : `<span>当天未学习</span>`}
                </div>
              </div>
              <div class="history-day-progress">
                <div class="history-day-track"><span style="width:${Math.min(100, Math.max(0, accuracy))}%"></span></div>
                <div class="history-day-caption"><span>学习表现</span><b>${accuracy}%</b></div>
              </div>
            </article>`;
        }).join("") || `<div class="empty"><h2>还没有学习记录</h2><p>完成第一轮学习后，这里会显示每天的学习汇总。</p></div>`}
      </div>`;
  } catch {
    container.innerHTML = `<div class="empty"><h2>暂时无法读取历史</h2><p>请登录并确认网络连接正常。</p></div>`;
  }
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}/${month}/${day}`;
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[ch]!)); }
