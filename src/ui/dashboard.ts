import "./dashboard-overrides.css";
import { apiRequest } from "../services/api";
import { renderNav } from "./nav";

type Overview = { totalWords: number; learnedWords: number; reviewedWords: number; masteredWords: number; remainingWords: number; progressPercent: number };
type StudyTime = { todaySeconds: number; totalSeconds: number; activeSessionId?: string | null };
type TodayProgress = { mandatoryTotal: number; mandatoryCompleted: number; mandatorySourceDate?: string | null; selfTotal: number; selfCompleted: number; newQuota: number; newCompleted: number; reviewRemaining?: number };
type DashboardSummary = { overview: Overview; time: StudyTime; today: TodayProgress; activeDays: number };
type User = { id: string; email: string; nickname: string };

function formatDuration(seconds: number) { const totalMinutes = Math.max(0, Math.floor(seconds / 60)); if (totalMinutes < 60) return `${totalMinutes} 分钟`; const hours = Math.floor(totalMinutes / 60); const minutes = totalMinutes % 60; return minutes ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`; }
function stat(label: string, value: number, muted = false) { return `<div class="overview-stat${muted ? " muted" : ""}"><strong>${value.toLocaleString()}</strong><span>${label}</span></div>`; }
function formatDate() { const now = new Date(); return `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`; }

async function loadDashboard() {
  const [summary, me] = await Promise.all([
    apiRequest<DashboardSummary>("/study/dashboard-summary"),
    apiRequest<{ user: User }>("/auth/me"),
  ]);
  return { ...summary, user: me.user };
}

export async function mountDashboard(root: HTMLElement) {
  root.innerHTML = `<div class="dashboard-shell"><div class="dashboard-loading">正在加载你的学习数据…</div></div>`;
  try {
    const { overview, time, today, activeDays, user } = await loadDashboard();
    const reviewRemaining = Math.max(0, today.reviewRemaining ?? (today.mandatoryTotal - today.mandatoryCompleted));
    const reviewRequired = reviewRemaining > 0;
    const newCompleted = Math.min(today.newCompleted, today.newQuota);
    const newRemaining = Math.max(0, today.newQuota - newCompleted);
    root.innerHTML = `
      <div class="dashboard-shell">
        <header class="dashboard-header">
          <div><div class="dashboard-date">${formatDate()}</div><div class="dashboard-brand">考研英语核心词</div><div class="dashboard-subtitle">FSRS-6 智能学习系统</div></div>
          <div class="dashboard-account"><span class="dashboard-user">${user.nickname}</span>${renderNav("/")}</div>
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
            <a class="study-action review-required" href="/study/review"><span class="study-action-title">复习昨日新词</span><span class="study-action-arrow">→</span></a>
            ${reviewRequired || newRemaining === 0
              ? `<div class="study-action locked" aria-disabled="true"><span class="study-action-title">学习新词</span><span class="study-action-arrow">${reviewRequired ? "🔒" : "✓"}</span></div>`
              : `<a class="study-action" href="/study/new"><span class="study-action-title">学习新词</span><span class="study-action-arrow">→</span></a>`}
            <a class="study-action" href="/study/self"><span class="study-action-title">自主复习</span><span class="study-action-arrow">→</span></a>
          </section>
        </main>
      </div>`;
  } catch (error) {
    root.innerHTML = `<div class="dashboard-shell"><div class="dashboard-error"><h2>学习数据加载失败</h2><p>${error instanceof Error ? error.message : "请刷新页面后重试。"}</p></div></div>`;
  }
}
