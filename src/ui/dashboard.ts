import { apiRequest } from "../services/api";

type Overview = {
  totalWords: number;
  learnedWords: number;
  reviewedWords: number;
  masteredWords: number;
  remainingWords: number;
  progressPercent: number;
};

type StudyTime = { todaySeconds: number; totalSeconds: number; activeSessionId?: string | null };
type User = { id: string; email: string; nickname: string };

function formatDuration(seconds: number) {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} 分钟`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
}

function stat(label: string, value: number, muted = false) {
  return `<div class="overview-stat${muted ? " muted" : ""}"><strong>${value.toLocaleString()}</strong><span>${label}</span></div>`;
}

async function loadOverview() {
  const [overview, time, me] = await Promise.all([
    apiRequest<Overview>("/study/overview"),
    apiRequest<StudyTime>("/study/time"),
    apiRequest<{ user: User }>("/auth/me"),
  ]);
  return { overview, time, user: me.user };
}

export async function mountDashboard(root: HTMLElement) {
  root.innerHTML = `<div class="dashboard-shell"><div class="dashboard-loading">正在加载你的学习数据…</div></div>`;

  try {
    const { overview, time, user } = await loadOverview();
    root.innerHTML = `
      <div class="dashboard-shell">
        <header class="dashboard-header">
          <div>
            <div class="dashboard-brand">考研英语核心词</div>
            <div class="dashboard-subtitle">FSRS-6 智能学习系统</div>
          </div>
          <div class="dashboard-account">
            <span class="dashboard-user">${user.nickname}</span>
            <a href="/settings">设置</a>
            <button id="dashboard-logout" type="button">退出登录</button>
          </div>
        </header>

        <main>
          <section class="dashboard-progress-card">
            <div class="section-title">总进度</div>
            <div class="progress-track"><span style="width:${Math.min(100, Math.max(0, overview.progressPercent))}%"></span></div>
            <div class="progress-line"><span>${overview.progressPercent.toFixed(1)}%</span><span>${overview.learnedWords.toLocaleString()} / ${overview.totalWords.toLocaleString()}</span></div>
            <div class="overview-stats">
              ${stat("总词数", overview.totalWords)}
              ${stat("已背", overview.learnedWords)}
              ${stat("已复习", overview.reviewedWords)}
              ${stat("已掌握", overview.masteredWords)}
              ${stat("剩余", overview.remainingWords, true)}
            </div>
          </section>

          <section class="dashboard-time-grid">
            <div class="dashboard-time-card"><span>今日学习时长</span><strong>${formatDuration(time.todaySeconds)}</strong></div>
            <div class="dashboard-time-card"><span>总学习时长</span><strong>${formatDuration(time.totalSeconds)}</strong></div>
          </section>

          <section class="dashboard-actions">
            <a class="study-action primary" href="/study/new"><span class="study-action-title">学习新词</span><span class="study-action-desc">先完成今天应复习的内容，再开始新的单词</span><span class="study-action-arrow">→</span></a>
            <a class="study-action" href="/study/self"><span class="study-action-title">自主复习</span><span class="study-action-desc">按照 FSRS 当前到期状态复习已经学习过的单词</span><span class="study-action-arrow">→</span></a>
          </section>
        </main>
      </div>`;

    document.getElementById("dashboard-logout")?.addEventListener("click", async () => {
      const button = document.getElementById("dashboard-logout") as HTMLButtonElement | null;
      if (button) { button.disabled = true; button.textContent = "退出中…"; }
      try { await apiRequest("/auth/logout", { method: "POST" }); } finally { location.href = "/login"; }
    });
  } catch (error) {
    root.innerHTML = `<div class="dashboard-shell"><div class="dashboard-error"><h2>学习数据加载失败</h2><p>${error instanceof Error ? error.message : "请刷新页面后重试。"}</p></div></div>`;
  }
}
