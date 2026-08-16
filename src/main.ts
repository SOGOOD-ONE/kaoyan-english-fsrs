import "./style.css";
import { mount } from "./ui/app";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app");

void mount(root).catch((error) => {
  console.error(error);
  root.innerHTML = `<main style="padding:24px;font-family:system-ui"><h1>应用启动失败</h1><p>请刷新页面后重试。</p></main>`;
});
