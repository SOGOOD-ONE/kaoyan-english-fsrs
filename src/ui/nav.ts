import { apiRequest } from "../services/api";
import { setStoreUser } from "../db/db";

const items = [
  ["/", "学习"],
  ["/vocabularies", "我的词库"],
  ["/history", "学习历史"],
  ["/settings", "设置"],
] as const;

export function renderNav(currentPath: string) {
  return `<nav class="product-nav">${items.map(([href, label]) => `<a href="${href}" class="${currentPath === href ? "active" : ""}">${label}</a>`).join("")}<button type="button" class="nav-logout" id="nav-logout">退出登录</button></nav>`;
}

let logoutBound = false;

export function installNavActions() {
  if (logoutBound) return;
  logoutBound = true;
  document.addEventListener("click", async event => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("#nav-logout");
    if (!button) return;
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = "退出中…";
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch {
      // Even if the network request fails, never leave the previous user's local scope active.
    } finally {
      setStoreUser(null);
      location.href = "/kaoyan-english-fsrs/login";
    }
  });
}
