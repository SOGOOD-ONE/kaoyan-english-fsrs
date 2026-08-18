import "./style.css";
import { mountDashboard } from "./ui/dashboard";
import { mountSettings } from "./ui/settings";
import { mountVocabularies } from "./ui/vocabularies";
import { mountHistory } from "./ui/history";
import { mountAuth } from "./ui/auth";
import { apiRequest } from "./services/api";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app");
const appRoot: HTMLElement = root;

export function appPath(path = "/") {
  return path.startsWith("/") ? path : `/${path}`;
}

async function requireAuth(): Promise<boolean> {
  try {
    const result = await apiRequest<{ user: unknown }>("/auth/me");
    if (result?.user) return true;
  } catch {}
  location.href = "/login";
  return false;
}

async function bootstrap() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/login") { await mountAuth(appRoot, "login"); return; }
  if (path === "/register") { await mountAuth(appRoot, "register"); return; }
  if (path === "/settings") { if (await requireAuth()) await mountSettings(appRoot); return; }
  if (path === "/vocabularies") { if (await requireAuth()) await mountVocabularies(appRoot); return; }
  if (path === "/history") { if (await requireAuth()) await mountHistory(appRoot); return; }
  if (path === "/study/new" || path === "/study/self") {
    if (await requireAuth()) await mountDashboard(appRoot);
    return;
  }
  if (await requireAuth()) await mountDashboard(appRoot);
}

void bootstrap().catch((error) => {
  console.error(error);
  appRoot.innerHTML = `<main style="padding:24px;font-family:system-ui"><h1>应用启动失败</h1><p>请刷新页面后重试。</p></main>`;
});
