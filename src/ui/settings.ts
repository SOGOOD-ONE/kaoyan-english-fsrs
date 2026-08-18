import { apiRequest } from "../services/api";
import { renderNav } from "./nav";
import { store } from "../db/db";

type Settings = { dailyNewQuota: number; soundEnabled: boolean; autoPlayExample: boolean };
type ReviewQuota = { dailyReviewQuota: number };
const QUOTAS = [50, 100, 150, 200, 250, 300];

function estimateMinutes(quota: number) { return Math.max(15, Math.round(quota * 0.35)); }

export async function mountSettings(root: HTMLElement) {
  let settings: Settings;
  let reviewQuota: ReviewQuota;
  try {
    [settings, reviewQuota] = await Promise.all([
      apiRequest<Settings>("/settings"),
      apiRequest<ReviewQuota>("/settings/review-quota"),
    ]);
  } catch {
    root.innerHTML = `<main class="settings-page"><section class="panel empty"><h2>暂时无法读取设置</h2><p>请登录后再试。</p><button id="back-home">返回首页</button></section></main>`;
    document.getElementById("back-home")?.addEventListener("click", () => { location.href = "/"; });
    return;
  }

  const newQuota = QUOTAS.includes(settings.dailyNewQuota) ? settings.dailyNewQuota : 100;
  const dailyReviewQuota = QUOTAS.includes(reviewQuota.dailyReviewQuota) ? reviewQuota.dailyReviewQuota : 100;

  root.innerHTML = `<main class="shell page settings-page"><header class="page-header"><div><h1>设置</h1><p>所有学习设置保存到你的账号，换设备后仍会保留。</p></div>${renderNav("/settings")}</header>
    <section class="panel settings-section"><div class="settings-title"><strong>每日学习计划</strong><span>新词数量与自主复习数量在这里统一管理</span></div>
      <label class="setting-row"><div><strong>每日新词</strong><small>每天学习 ${newQuota} 个新词，预计约 ${estimateMinutes(newQuota)} 分钟</small></div><select id="daily-new-quota">${QUOTAS.map(v => `<option value="${v}" ${newQuota === v ? "selected" : ""}>${v} 个</option>`).join("")}</select></label>
      <label class="setting-row"><div><strong>自主复习数量</strong><small>每天由 FSRS 从已学单词中推荐 ${dailyReviewQuota} 个；06:00 的昨日新词强制复习不受此数量限制</small></div><select id="daily-review-quota">${QUOTAS.map(v => `<option value="${v}" ${dailyReviewQuota === v ? "selected" : ""}>${v} 个</option>`).join("")}</select></label>
      <div class="settings-plan-note" id="quota-note">预计今日新词学习时间：约 ${estimateMinutes(newQuota)} 分钟；自主复习数量：${dailyReviewQuota} 个</div>
      <div class="setting-row settings-fixed-row"><div><strong>时间标准</strong><small>所有学习日期、每日统计与 06:00 强制复习均统一使用北京时间（UTC+8）</small></div><strong class="settings-fixed-value">北京时间</strong></div>
    </section>
    <section class="panel settings-section"><div class="settings-title"><strong>学习体验</strong><span>复习过程中的交互偏好</span></div>
      <label class="setting-row"><div><strong>提示音</strong><small>完成一次评分后播放提示音</small></div><input id="sound-enabled" type="checkbox" ${settings.soundEnabled ? "checked" : ""}></label>
      <label class="setting-row"><div><strong>自动播放例句</strong><small>查看释义后自动播放例句</small></div><input id="auto-play-example" type="checkbox" ${settings.autoPlayExample ? "checked" : ""}></label>
    </section>
    <section class="panel settings-section"><div class="settings-title"><strong>学习数据</strong><span>谨慎操作；重置会清除当前账号的 FSRS 卡片、复习记录、学习时长和学习历史。</span></div>
      <div class="settings-actions"><button id="reset-progress" type="button">重置学习进度</button><span id="reset-status"></span></div>
    </section>
    <section class="panel settings-section"><div class="settings-actions"><button id="save-settings" type="button">保存设置</button><span id="save-status"></span></div></section></main>`;

  const newQuotaSelect = document.getElementById("daily-new-quota") as HTMLSelectElement;
  const reviewQuotaSelect = document.getElementById("daily-review-quota") as HTMLSelectElement;
  const quotaNote = document.getElementById("quota-note")!;
  const refreshQuotaNote = () => { quotaNote.textContent = `预计今日新词学习时间：约 ${estimateMinutes(Number(newQuotaSelect.value))} 分钟；自主复习数量：${Number(reviewQuotaSelect.value)} 个`; };
  newQuotaSelect.addEventListener("change", refreshQuotaNote);
  reviewQuotaSelect.addEventListener("change", refreshQuotaNote);

  document.getElementById("save-settings")?.addEventListener("click", async () => {
    const status = document.getElementById("save-status")!;
    status.textContent = "保存中…";
    const button = document.getElementById("save-settings") as HTMLButtonElement | null;
    if (button) button.disabled = true;
    try {
      await Promise.all([
        apiRequest<Settings>("/settings", {
          method: "PUT",
          body: JSON.stringify({
            dailyNewQuota: Number(newQuotaSelect.value),
            soundEnabled: (document.getElementById("sound-enabled") as HTMLInputElement).checked,
            autoPlayExample: (document.getElementById("auto-play-example") as HTMLInputElement).checked,
          }),
        }),
        apiRequest<ReviewQuota>("/settings/review-quota", {
          method: "PUT",
          body: JSON.stringify({ dailyReviewQuota: Number(reviewQuotaSelect.value) }),
        }),
      ]);
      status.textContent = "已保存";
      window.setTimeout(() => { status.textContent = ""; }, 1500);
    } catch {
      status.textContent = "保存失败，请检查网络连接";
    } finally {
      if (button) button.disabled = false;
    }
  });

  document.getElementById("reset-progress")?.addEventListener("click", async () => {
    const status = document.getElementById("reset-status")!;
    if (!window.confirm("确定重置当前账号的学习进度吗？账号、词库选择和每日数量设置不会删除，但 FSRS 卡片、复习记录、学习时长和学习历史会清除。")) return;
    status.textContent = "重置中…";
    const button = document.getElementById("reset-progress") as HTMLButtonElement | null;
    if (button) button.disabled = true;
    try {
      await apiRequest("/study/reset", { method: "POST" });
      await store.clearStudyState();
      status.textContent = "已重置";
      window.setTimeout(() => location.href = "/", 800);
    } catch {
      status.textContent = "重置失败，请稍后再试";
      if (button) button.disabled = false;
    }
  });
}
