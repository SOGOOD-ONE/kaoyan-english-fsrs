import "./style.css";
import { mount } from "./ui/app";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app");

void mount(root).then(() => {
  // Immediate UI feedback: the app state is still handled by app.ts,
  // but the selected quota/mode is reflected before the async re-render completes.
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const quotaButton = target?.closest<HTMLButtonElement>("[data-quota]");
    if (quotaButton) {
      document.querySelectorAll<HTMLButtonElement>("[data-quota]").forEach(button => {
        button.classList.toggle("active", button === quotaButton);
      });
    }
    const modeButton = target?.closest<HTMLButtonElement>("[data-mode]");
    if (modeButton) {
      document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(button => {
        button.classList.toggle("active", button === modeButton);
      });
    }
  }, true);
}).catch((error) => {
  console.error(error);
  root.innerHTML = `<main style="padding:24px;font-family:system-ui"><h1>应用启动失败</h1><p>请刷新页面后重试。</p></main>`;
});
