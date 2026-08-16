import "./style.css";
import { mount } from "./ui/app";
import { mountSettings } from "./ui/settings";
import { mountVocabularies } from "./ui/vocabularies";
import { mountHistory } from "./ui/history";
import { mountAuth } from "./ui/auth";
import { syncStudyData } from "./services/sync";
import { installSummaryObserver } from "./ui/summaryObserver";
import { apiRequest } from "./services/api";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app");

async function bootstrap() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/login" || path === "/register") { await mountAuth(root); return; }
  if (path === "/settings") { await mountSettings(root); return; }
  if (path === "/vocabularies") { await mountVocabularies(root); return; }
  if (path === "/history") { await mountHistory(root); return; }

  try {
    const me = await apiRequest<{ user: unknown }>("/auth/me");
    if (me?.user) {
      try { await syncStudyData(); } catch (error) { console.warn("Cloud sync skipped:", error); }
    }
  } catch (error) { console.warn("Auth check skipped:", error); }

  installSummaryObserver(root);
  await mount(root);
}

void bootstrap().catch((error) => {
  console.error(error);
  root.innerHTML = `<main style="padding:24px;font-family:system-ui"><h1>应用启动失败</h1><p>请刷新页面后重试。</p></main>`;
});
