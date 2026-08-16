import { getStudyHistory } from "../services/history";

export async function mountHistory(root: HTMLElement) {
  root.innerHTML = `<main class="shell page"><header class="page-header"><div><h1>学习历史</h1><p>查看最近的学习记录与连续学习情况</p></div><nav><button data-back>学习</button><button data-vocab>我的词库</button><button data-settings>设置</button></nav></header><section class="panel" id="history-page"></section></main>`;
  root.querySelector("[data-back]")?.addEventListener("click", () => { location.href = "/"; });
  root.querySelector("[data-vocab]")?.addEventListener("click", () => { location.href = "/vocabularies"; });
  root.querySelector("[data-settings]")?.addEventListener("click", () => { location.href = "/settings"; });
  await renderHistory(root.querySelector("#history-page") as HTMLElement);
}

async function renderHistory(container: HTMLElement) {
  try {
    const history = await getStudyHistory(30);
    const days = history.days.slice().reverse();
    const totalReviews = days.reduce((sum, day) => sum + day.totalReviews, 0);
    const accuracy = totalReviews ? Math.round(days.reduce((sum, day) => sum + day.accuracy * day.totalReviews, 0) / totalReviews) : 0;
    container.innerHTML = `<div class="history-page-head"><div><strong>最近 30 天</strong><span>持续学习比单日冲刺更重要</span></div><div class="history-kpis"><div><b>${history.totalReviews}</b><small>累计复习</small></div><div><b>${history.activeDays}</b><small>活跃天数</small></div><div><b>${history.streak}</b><small>连续学习</small></div><div><b>${accuracy}%</b><small>平均正确率</small></div></div></div><div class="history-page-list">${days.map(day => `<article class="history-page-row"><div><strong>${escapeHtml(day.date)}</strong><small>${day.learnedWords} 个单词 · ${day.totalReviews} 次复习</small></div><div class="history-bar"><span style="width:${Math.min(100, day.accuracy)}%"></span></div><b>${day.accuracy}%</b><small>${day.again}/${day.hard}/${day.good}/${day.easy}</small></article>`).join("") || `<div class="empty"><h2>还没有学习记录</h2><p>完成第一轮背词后，这里会显示你的历史。</p></div>`}</div>`;
  } catch { container.innerHTML = `<div class="empty"><h2>暂时无法读取历史</h2><p>请登录并确认网络连接正常。</p></div>`; }
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[ch]!)); }
