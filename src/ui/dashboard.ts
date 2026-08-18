import { apiRequest } from "../services/api";

type Overview = { totalWords: number; learnedWords: number; reviewedWords: number; masteredWords: number; remainingWords: number; progressPercent: number };
type StudyTime = { todaySeconds: number; totalSeconds: number; activeSessionId?: string | null };
type TodayProgress = { mandatoryTotal: number; mandatoryCompleted: number; selfTotal: number; selfCompleted: number; newQuota: number; newCompleted: number };
type History = { activeDays: number };
type User = { id: string; email: string; nickname: string };

function formatDuration(seconds: number) { const totalMinutes = Math.max(0, Math.floor(seconds / 60)); if (totalMinutes < 60) return `${totalMinutes} 分钟`; const hours = Math.floor(totalMinutes / 60); const minutes = totalMinutes % 60; return minutes ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`; }
function stat(label: string, value: number, muted = false) { return `<div class="overview-stat${muted ? " muted" : ""}"><strong>${value.toLocaleString()}</strong><span>${label}</span></div>`; }
function formatDate() { const now = new Date(); return `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`; }

async function loadDashboard() {
  const [overview, time, today, history, me] = await Promise.all([
    apiRequest<Overview>("/study/overview"),
    apiRequest<StudyTime>("/study/time"),
    apiRequest<TodayProgress>("/study/today/progress"),
    apiRequest<History>("/history?days=3650"),
    apiRequest<{ user: User }>("/auth/me"),
  ]);
  return { overview, time, today, activeDays: history.activeDays, user: me.user };
}

export async function mountDashboard(root: HTMLElement) {
  root.innerHTML = `<div class="dashboard-shell"><div class="dashboard-loading">正在加载你的学习数据…</div></div>`;
  try {
    const { overview, time, today, activeDays, user } = await loadDashboard();
    const reviewRequired = today.mandatoryTotal > today.mandatoryCompleted;
    root.innerHTML = `
      <div class="dashboard-shell">
        <header class="dashboard-header">
          <div><div class="dashboard-date">${formatDate()}</div><div class="dashboard-brand">考研英语核心词</div><div class="dashboard-subtitle">FSRS-6 智能学习系统</div></div>
          <div class="dashboard-account"><span class="dashboard-user">${user.nickname}</span><a href="/settings">设置</a><button id="dashboard-logout" type="button">退出登录</button></div>
        </header>
        <main>
          <section class="dashboard-progress-card">
            <div class="section-title">总进度</div>
            <div class="progress-track"><span style="width:${Math.min(100, Math.max(0, overview.progressPercent))}%"></span></div>
            <div class="overview-stats">
              ${stat("总词数", overview.totalWords)}${stat("已背", overview.learnedWords)}${stat("已复习", overview.reviewedWords)}${stat("已掌握", overview.masteredWords)}${stat("剩余", overview.remainingWords, true)}
            </div>
          </section>
          <section class="dashboard-time-grid"><div class="dashboard-time-card"><span>今日学习时长</span><strong>${formatDuration(time.todaySeconds)}</strong></div><div class="dashboard-time-card"><span>总学习时长</span><strong>${formatDuration(time.totalSeconds)}</strong></div><div class="dashboard-time-card"><span>活跃天数</span><strong>${activeDays}</strong></div></section>
          <section class="dashboard-actions">
            <a class="study-action review-required" href="/study/review"><span class="study-action-title">${reviewRequired ? "先完成今日复习" : "开始复习"}</span><span class="study-action-desc">${reviewRequired ? `还有 ${Math.max(0, today.mandatoryTotal - today.mandatoryCompleted)} 项今日必做复习` : "今日必做复习已经完成"}</span><span class="study-action-arrow">→</span></a>
            <a class="study-action ${reviewRequired ? "locked" : ""}" ${reviewRequired ? `href="/study/review" aria-disabled="true" data-locked="1"` : `href="/study/new"`}><span class="study-action-title">学习新词</span><span class="study-action-desc">${reviewRequired ? "完成今日复习后解锁" : `今天可学习 ${today.newQuota} 个新词`}</span><span class="study-action-arrow">${reviewRequired ? "🔒" : "→"}</span></a>
            <a class="study-action" href="/study/self"><span class="study-action-title">自主复习</span><span class="study-action-desc">按照 FSRS 当前到期状态复习已经学习过的单词</span><span class="study-action-arrow">→</span></a>
          </section>
        </main>
      </div>`;
    document.getElementById("dashboard-logout")?.addEventListener("click", async () => { const button = document.getElementById("dashboard-logout") as HTMLButtonElement | null; if (button) { button.disabled = true; button.textContent = "退出中…"; } try { await apiRequest("/auth/logout", { method: "POST" }); } finally { location.href = "/login"; } });
  } catch (error) {
    root.innerHTML = `<div class="dashboard-shell"><div class="dashboard-error"><h2>学习数据加载失败</h2><p>${error instanceof Error ? error.message : "请刷新页面后重试。"}</p></div></div>`;
  }
}
