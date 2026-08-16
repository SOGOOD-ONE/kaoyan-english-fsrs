import { renderStudyComplete } from "./studyComplete";

export function installSummaryObserver(root: HTMLElement) {
  const observer = new MutationObserver(() => {
    const empty = root.querySelector<HTMLElement>("#card .empty");
    if (!empty || empty.dataset.summaryShown === "1") return;
    if (!empty.textContent?.includes("这一组完成了")) return;
    const match = empty.textContent.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) return;
    empty.dataset.summaryShown = "1";
    const modeLabel = root.querySelector<HTMLElement>("#session-label")?.textContent || "今日学习";
    const completed = Number(match[1]);
    const total = Number(match[2]);
    void renderStudyComplete(root.querySelector<HTMLElement>("#card") || root, completed, total, modeLabel);
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true });
  return observer;
}
