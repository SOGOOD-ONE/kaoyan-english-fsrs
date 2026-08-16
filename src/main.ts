import "./style.css";
import { mount } from "./ui/app";
import { mountSettings } from "./ui/settings";
import { mountVocabularies } from "./ui/vocabularies";
import { mountHistory } from "./ui/history";
import { mountAuth } from "./ui/auth";
import { syncStudyData } from "./services/sync";
import { apiRequest } from "./services/api";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app");
const appRoot: HTMLElement = root;
const BASE_PATH = "/kaoyan-english-fsrs";

export function appPath(path = "/") { return `${BASE_PATH}${path === "/" ? "/" : path.startsWith("/") ? path : `/${path}`}`; }

function installAuthNavigation() {
  document.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-requires-auth]");
    if (!target) return;
    event.preventDefault(); event.stopPropagation(); location.href = appPath("/login");
  }, true);
}

async function bootstrap() {
  installAuthNavigation();
  let path = window.location.pathname;
  if (path.startsWith(BASE_PATH)) path = path.slice(BASE_PATH.length) || "/";
  path = path.replace(/\/+$/, "") || "/";
  if (path === "/login") { await mountAuth(appRoot, "login"); return; }
  if (path === "/register") { await mountAuth(appRoot, "register"); return; }
  if (path === "/settings") { await mountSettings(appRoot); return; }
  if (path === "/vocabularies") { await mountVocabularies(appRoot); return; }
  if (path === "/history") { await mountHistory(appRoot); return; }
  try {
    const me = await apiRequest<{ user: unknown }>("/auth/me");
    if (me?.user) { try { await syncStudyData(); } catch (error) { console.warn("Cloud sync skipped:", error); } }
  } catch (error) { console.warn("Auth check skipped:", error); }
  await mount(appRoot);
}

void bootstrap().catch((error) => {
  console.error(error);
  appRoot.innerHTML = `<main style="padding:24px;font-family:system-ui"><h1>应用启动失败</h1><p>请刷新页面后重试。</p></main>`;
});