import { apiRequest } from "../services/api";
import { renderNav } from "./nav";

type Settings = { dailyNewQuota: number; timezone: string; soundEnabled: boolean; autoPlayExample: boolean };
const QUOTAS = [50, 100, 150, 200, 250, 300];

function estimateMinutes(quota: number) { return Math.max(15, Math.round(quota * 0.35)); }

export async function mountSettings(root: HTMLElement) {
  let settings: Settings;
  try { settings = await apiRequest<Settings>("/settings"); }
  catch { root.innerHTML = `<main class="settings-page"><section class="panel empty"><h2>暂时无法读取设置</h2><p>请登录后再试。</p><button id="back-home">返回首页</button></section></main>`; document.getElementById("back-home")?.addEventListener("click", () => { location.href = "/"; }); return; }

  const quota = QUOTAS.includes(settings.dailyNewQuota) ? settings.dailyNewQuota : 100;
  root.innerHTML = `<main class="shell page settings-page"><header class="page-header"><div><h1>设置</h1><p>所有学习设置保存到你的账号，换设备后仍会保留。</p></div>${renderNav("/settings")}</header>
    <section class="panel settings-section"><div class="settings-title"><strong>每日学习计划</strong><span>新词数量设置在这里统一管理</span></div>
      <label class="setting-row"><div><strong>每日新词</strong><small>每天学习 ${quota} 个新词，预计约 ${estimateMinutes(quota)} 分钟</small></div><select id="daily-new-quota">${QUOTAS.map(v => `<option value="${v}" ${quota === v ? "selected" : ""}>${v} 个</option>`).join("")}</select></label>
      <div class="settings-plan-note" id="quota-note">预计今日新词学习时间：约 ${estimateMinutes(quota)} 分钟</div>
      <label class="setting-row"><div><strong>时区</strong><small>用于计算每日学习统计与复习日界线</small></div><select id="timezone"><option value="Asia/Shanghai">Asia/Shanghai</option><option value="Asia/Singapore">Asia/Singapore</option><option value="UTC">UTC</option></select></label>
    </section>
    <section class="panel settings-section"><div class="settings-title"><strong>学习体验</strong><span>复习过程中的交互偏好</span></div>
      <label class="setting-row"><div><strong>提示音</strong><small>完成一次评分后播放提示音</small></div><input id="sound-enabled" type="checkbox" ${settings.soundEnabled ? "checked" : ""}></label>
      <label class="setting-row"><div><strong>自动播放例句</strong><small>查看释义后自动播放例句</small></div><input id="auto-play-example" type="checkbox" ${settings.autoPlayExample ? "checked" : ""}></label>
    </section>
    <section class="panel settings-section"><div class="settings-title"><strong>学习数据</strong><span>谨慎操作；重置会清除当前账号的 FSRS 卡片和复习记录。</span></div>
      <div class="settings-actions"><button id="reset-progress" type="button">重置学习进度</button><span id="reset-status"></span></div>
    </section>
    <section class="panel settings-section"><div class="settings-actions"><button id="save-settings" type="button">保存设置</button><span id="save-status"></span></div></section></main>`;

  const timezone = document.getElementById("timezone") as HTMLSelectElement; timezone.value = settings.timezone;
  const quotaSelect = document.getElementById("daily-new-quota") as HTMLSelectElement;
  const quotaNote = document.getElementById("quota-note")!;
  quotaSelect.addEventListener("change", () => { quotaNote.textContent = `预计今日新词学习时间：约 ${estimateMinutes(Number(quotaSelect.value))} 分钟`; });

  document.getElementById("save-settings")?.addEventListener("click", async () => {
    const status = document.getElementById("save-status")!; status.textContent = "保存中…";
    try {
      await apiRequest<Settings>("/settings", { method: "PUT", body: JSON.stringify({ dailyNewQuota: Number(quotaSelect.value), timezone: timezone.value, soundEnabled: (document.getElementById("sound-enabled") as HTMLInputElement).checked, autoPlayExample: (document.getElementById("auto-play-example") as HTMLInputElement).checked }) });
      status.textContent = "已保存"; window.setTimeout(() => { status.textContent = ""; }, 1500);
    } catch { status.textContent = "保存失败，请检查网络连接"; }
  });

  document.getElementById("reset-progress")?.addEventListener("click", async () => {
    const status = document.getElementById("reset-status")!;
    if (!window.confirm("确定重置当前账号的学习进度吗？词库和账号不会删除，但 FSRS 卡片、复习记录和学习时长会被清除。")) return;
    status.textContent = "重置中…";
    try { await apiRequest("/study/reset", { method: "POST" }); status.textContent = "已重置"; window.setTimeout(() => location.href = "/", 800); }
    catch { status.textContent = "重置失败，请稍后再试"; }
  });
}
