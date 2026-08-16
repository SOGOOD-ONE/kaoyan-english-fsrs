import { showStudySummary } from "./studySummary";

export function installSummaryObserver(root: HTMLElement) {
  const observer = new MutationObserver(() => {
    const empty = root.querySelector<HTMLElement>("#card .empty");
    if (!empty || empty.dataset.summaryShown === "1") return;
    if (!empty.textContent?.includes("这一组完成了")) return;
    const match = empty.textContent.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) return;
    empty.dataset.summaryShown = "1";
    void showStudySummary(root, Number(match[2]));
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true });
  return observer;
}
