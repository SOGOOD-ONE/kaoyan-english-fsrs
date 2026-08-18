import { apiRequest } from "../services/api";
import { setStoreUser } from "../db/db";

const BASE_PATH = "/kaoyan-english-fsrs";

function appHref(path: string) {
  return `${BASE_PATH}${path === "/" ? "/" : path.startsWith("/") ? path : `/${path}`}`;
}

let logoutBound = false;

function installLogoutAction() {
  if (logoutBound) return;
  logoutBound = true;
  document.addEventListener("click", async event => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("#study-nav-logout");
    if (!button) return;
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = "退出中…";
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch {
      // Local user scope must still be cleared when the network is unavailable.
    } finally {
      setStoreUser(null);
      location.href = appHref("/login");
    }
  });
}

export function studyNav(active: "/" | "/vocabularies" | "/history" | "/settings") {
  installLogoutAction();
  const links = [
    ["/", "学习"],
    ["/vocabularies", "我的词库"],
    ["/history", "学习历史"],
    ["/settings", "设置"],
  ] as const;
  return `<nav class="study-nav">${links.map(([href, label]) => `<a href="${appHref(href)}" class="${active === href ? "active" : ""}">${label}</a>`).join("")}<button type="button" class="nav-logout" id="study-nav-logout">退出登录</button></nav>`;
}
