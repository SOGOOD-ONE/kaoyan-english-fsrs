import { apiRequest } from "../services/api";
import { renderNav } from "./nav";

type Settings = {
  dailyNewQuota: number;
  timezone: string;
  soundEnabled: boolean;
  autoPlayExample: boolean;
};

export async function mountSettings(root: HTMLElement) {
  let settings: Settings;
  try {
    settings = await apiRequest<Settings>("/settings");
  } catch {
    root.innerHTML = `<main class="settings-page"><section class="panel empty"><h2>暂时无法读取设置</h2><p>请登录后再试。</p><button id="back-home">返回首页</button></section></main>`;
    document.getElementById("back-home")?.addEventListener("click", () => { location.href = "/"; });
    return;
  }

  root.innerHTML = `<main class="shell page settings-page"><header class="page-header"><div><h1>设置</h1><p>管理你的学习偏好</p></div>${renderNav("/settings")}</header><section class="panel settings-section"><div class="settings-title"><strong>学习计划</strong><span>这些设置会影响每日学习任务</span></div><label class="setting-row"><div><strong>每日新词</strong><small>每天默认安排的新词数量</small></div><select id="daily-new-quota">${[80,100,150,200].map(v => `<option value="${v}" ${settings.dailyNewQuota === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label class="setting-row"><div><strong>时区</strong><small>用于计算每日学习统计</small></div><select id="timezone"><option value="Asia/Shanghai">Asia/Shanghai</option><option value="Asia/Singapore">Asia/Singapore</option><option value="UTC">UTC</option></select></label></section><section class="panel settings-section"><div class="settings-title"><strong>学习体验</strong><span>复习时的声音与例句设置</span></div><label class="setting-row"><div><strong>提示音</strong><small>完成一次评分后播放提示音</small></div><input id="sound-enabled" type="checkbox" ${settings.soundEnabled ? "checked" : ""}></label><label class="setting-row"><div><strong>自动播放例句</strong><small>查看释义后自动播放例句</small></div><input id="auto-play-example" type="checkbox" ${settings.autoPlayExample ? "checked" : ""}></label></section><section class="panel settings-section"><div class="settings-title"><strong>操作</strong><span>设置保存到你的账号</span></div><div class="settings-actions"><button id="save-settings">保存设置</button><span id="save-status"></span></div></section></main>`;

  const timezone = document.getElementById("timezone") as HTMLSelectElement;
  timezone.value = settings.timezone;
  document.getElementById("save-settings")?.addEventListener("click", async () => {
    const status = document.getElementById("save-status")!;
    status.textContent = "保存中…";
    try {
      await apiRequest("/settings", { method: "PUT", body: JSON.stringify({ dailyNewQuota: Number((document.getElementById("daily-new-quota") as HTMLSelectElement).value), timezone: timezone.value, soundEnabled: (document.getElementById("sound-enabled") as HTMLInputElement).checked, autoPlayExample: (document.getElementById("auto-play-example") as HTMLInputElement).checked }) });
      status.textContent = "已保存";
      window.setTimeout(() => { status.textContent = ""; }, 1500);
    } catch {
      status.textContent = "保存失败，请检查网络连接";
    }
  });
}
