import "./style.css";
import { mount } from "./ui/app";
import { syncStudyData } from "./services/sync";
import { installSummaryObserver } from "./ui/summaryObserver";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app");

async function bootstrap() {
  try {
    const me = await fetch("/api/auth/me", { credentials: "include" }).then(r => r.ok ? r.json() : null);
    if (me?.user) {
      try { await syncStudyData(); } catch (error) { console.warn("Cloud sync skipped:", error); }
    }
  } catch (error) {
    console.warn("Auth check skipped:", error);
  }

  installSummaryObserver(root);
  await mount(root);
}

void bootstrap().catch((error) => {
  console.error(error);
  root.innerHTML = `<main style="padding:24px;font-family:system-ui"><h1>应用启动失败</h1><p>请刷新页面后重试。</p></main>`;
});
