import "./study.css";
import { apiRequest } from "../services/api";
import { Rating, review } from "../fsrs/adapter";
import type { Grade } from "../fsrs/adapter";
import { store } from "../db/db";
import { submitReviewToServer } from "../services/sync";

type Direction = "ec" | "ce";
type ServerWord = { id: string; word: string; type?: string; meaning: string; category?: string; source?: string };
type NewCard = { id?: string; wordId?: string; newEcCorrect: number; newCeCorrect: number; newAttempts: number; knownExcluded: boolean; newComplete: boolean };
type NewQueueWord = ServerWord & { card: NewCard };
type NewQueue = { newUnlocked: boolean; mandatoryRemaining: number; quota: number; completed: number; words: NewQueueWord[] };
type Scheduled = { word: NewQueueWord; dueStep: number };

function escapeHtml(value: string) {
  return value.replace(/[&<>'\"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;" }[ch]!));
}
function shuffle<T>(values: T[]) { return [...values].sort(() => Math.random() - 0.5); }
function randomGap() { return 5 + Math.floor(Math.random() * 4); }
function newDirection(card: NewCard): Direction { return card.newAttempts >= 2 ? "ce" : "ec"; }
function speakEnglish(text: string) {
  if (!text.trim() || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.75;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  } catch {}
}
function wait(ms: number) { return new Promise<void>(resolve => window.setTimeout(resolve, ms)); }

function buildOptions(items: NewQueueWord[], current: NewQueueWord, direction: Direction) {
  const correct = direction === "ec" ? current.meaning : current.word;
  const pool = [...new Set(items.filter(item => item.id !== current.id).map(item => direction === "ec" ? item.meaning : item.word).filter(Boolean).filter(value => value !== correct))];
  const options = [correct, ...shuffle(pool).slice(0, 3)];
  while (options.length < 4) options.push(correct);
  return shuffle(options.slice(0, 4));
}

type Feedback = { selected: string; correct: string };
function render(root: HTMLElement, current: NewQueueWord | null, completed: number, total: number, submitting: boolean, feedback?: Feedback, message = "") {
  if (!current) {
    root.innerHTML = `<main class="study-page"><section class="study-complete"><div class="study-complete-kicker">本次学习完成</div><h2>新词学习完成</h2><p>本次完成 ${completed} 个单词。</p><a href="/" class="study-home-btn">返回首页</a></section></main>`;
    return;
  }
  const card = current.card || { newEcCorrect: 0, newCeCorrect: 0, newAttempts: 0, knownExcluded: false, newComplete: false };
  const direction = newDirection(card);
  const prompt = direction === "ec" ? current.word : current.meaning;
  const options = buildOptions(window.__NEW_WORDS__ || [], current, direction);
  const percent = total ? Math.min(100, Math.round(completed * 100 / total)) : 0;
  const optionButtons = options.map(option => {
    let cls = "new-learning-option";
    if (feedback) {
      if (option === feedback.correct) cls += " new-learning-option-correct";
      else if (option === feedback.selected) cls += " new-learning-option-wrong";
      else cls += " new-learning-option-muted";
    }
    return `<button class="${cls}" data-action="new-answer" data-option="${encodeURIComponent(option)}" ${submitting || !!feedback ? "disabled" : ""}>${escapeHtml(option)}</button>`;
  }).join("");
  root.innerHTML = `<main class="study-page"><header class="study-session-head"><div><a href="/" class="study-back">← 返回首页</a><h1>学习新词</h1></div><div class="study-session-count">${completed} / ${total}</div></header><div class="study-session-track"><span style="width:${percent}%"></span></div><section class="study-word-panel new-learning-panel"><div class="study-word-meta">${escapeHtml(current.category || "核心词")} ${current.type ? `· ${escapeHtml(current.type)}` : ""}</div><div class="new-learning-prompt">${escapeHtml(prompt)}</div><div class="new-learning-options">${optionButtons}</div><button class="study-known-button" data-action="known" ${submitting || !!feedback ? "disabled" : ""}>斩</button>${message ? `<div class="new-learning-message">${escapeHtml(message)}</div>` : ""}</section></main>`;
}

declare global { interface Window { __NEW_WORDS__?: NewQueueWord[]; } }

export async function mountNewStudy(root: HTMLElement) {
  root.innerHTML = `<div class="study-page"><div class="study-loading">正在加载学习内容…</div></div>`;
  try {
    const progress = await apiRequest<{ reviewRemaining?: number; mandatoryTotal: number; mandatoryCompleted: number }>("/study/today/progress");
    const reviewRemaining = Math.max(0, progress.reviewRemaining ?? (progress.mandatoryTotal - progress.mandatoryCompleted));
    if (reviewRemaining > 0) {
      root.innerHTML = `<main class="study-page"><section class="study-complete"><div class="study-complete-kicker">今日学习顺序</div><h2>请先完成昨日新词复习</h2><p>还有 ${reviewRemaining} 个昨日新词需要复习。</p><a href="/study/review" class="study-home-btn">开始复习</a></section></main>`;
      return;
    }
    const queue = await apiRequest<NewQueue>("/study/new-queue");
    if (!queue.newUnlocked) throw new Error(`今天还有 ${queue.mandatoryRemaining} 个昨日新词需要复习。`);
    const words = shuffle(queue.words);
    const total = words.length;
    if (!total) {
      root.innerHTML = `<main class="study-page"><section class="study-complete"><div class="study-complete-kicker">今日新词</div><h2>今天的新词已经完成</h2><p>当前启用词库没有更多需要学习的新词。</p><a href="/" class="study-home-btn">返回首页</a></section></main>`;
      return;
    }

    window.__NEW_WORDS__ = words;
    const unseen = [...words];
    const scheduled: Scheduled[] = [];
    let step = 0;
    let completed = 0;
    let current: NewQueueWord | null = null;
    let submitting = false;
    let lastId: string | null = null;

    const pickNext = (): NewQueueWord | null => {
      const due = scheduled.filter(entry => entry.dueStep <= step && entry.word.id !== lastId && !entry.word.card.newComplete);
      if (due.length) {
        const picked = due[Math.floor(Math.random() * due.length)];
        scheduled.splice(scheduled.indexOf(picked), 1);
        return picked.word;
      }
      const fresh = unseen.filter(word => word.id !== lastId && !word.card.newComplete);
      if (fresh.length) {
        const picked = fresh[Math.floor(Math.random() * fresh.length)];
        unseen.splice(unseen.findIndex(word => word.id === picked.id), 1);
        return picked;
      }
      const waiting = scheduled.filter(entry => entry.word.id !== lastId && !entry.word.card.newComplete).sort((a, b) => a.dueStep - b.dueStep);
      if (waiting.length) return scheduled.splice(scheduled.indexOf(waiting[0]), 1)[0].word;
      return null;
    };

    current = pickNext();
    const session = await apiRequest<{ sessionId: string }>("/study/session/start", { method: "POST", body: JSON.stringify({ mode: "new" }) });
    const stopSession = async () => { try { await fetch(`/api/study/session/${encodeURIComponent(session.sessionId)}/stop`, { method: "POST", credentials: "include", keepalive: true }); } catch {} };
    const onHide = () => { void stopSession(); };
    window.addEventListener("pagehide", onHide, { once: true });
    const rerender = (feedback?: Feedback, message = "") => render(root, current, completed, total, submitting, feedback, message);
    rerender();

    root.addEventListener("click", async event => {
      const target = event.target as HTMLElement;
      const actionElement = target.closest<HTMLElement>("[data-action]");
      if (!actionElement || submitting || !current) return;
      const selectedWord = current;
      const action = actionElement.dataset.action;

      if (action === "known") {
        submitting = true;
        rerender();
        try {
          await apiRequest("/study/known-exclude", { method: "POST", body: JSON.stringify({ wordId: selectedWord.id, mode: "new" }) });
          selectedWord.card.knownExcluded = true;
          selectedWord.card.newComplete = true;
          completed += 1;
          lastId = selectedWord.id;
          step += 1;
          current = pickNext();
          submitting = false;
          if (!current) { await stopSession(); window.removeEventListener("pagehide", onHide); render(root, null, completed, total, false); }
          else rerender();
        } catch { submitting = false; rerender(undefined, "暂时无法保存，请重试。"); }
        return;
      }

      if (action === "new-answer") {
        submitting = true;
        rerender();
        const card = selectedWord.card;
        const direction = newDirection(card);
        const selected = decodeURIComponent(actionElement.dataset.option || "");
        const correctAnswer = direction === "ec" ? selectedWord.meaning : selectedWord.word;
        const correct = selected === correctAnswer;
        try {
          if (direction === "ce") speakEnglish(selected);
          if (direction === "ec" && correct) speakEnglish(selectedWord.word);
          const result = await apiRequest<{ completed: boolean; card: NewCard }>("/study/new-answer", { method: "POST", body: JSON.stringify({ wordId: selectedWord.id, direction, correct }) });
          selectedWord.card = result.card;
          step += 1;

          if (!correct) {
            if (direction === "ce") speakEnglish(correctAnswer);
            submitting = false;
            rerender({ selected, correct: correctAnswer });
            await wait(1200);
            submitting = true;
          }

          if (result.completed) {
            const fsrsResult = await review(selectedWord, Rating.Good as Grade);
            const reviewRows = await store.getReviews(selectedWord.id);
            const saved = reviewRows.find(row => row.id === fsrsResult.reviewId);
            if (!saved) throw new Error("学习记录保存失败，请重试");
            saved.reviewType = "new";
            await submitReviewToServer(saved);
            await store.markReviewSynced(saved.id);
            completed += 1;
            selectedWord.card.newComplete = true;
          } else {
            scheduled.push({ word: selectedWord, dueStep: step + randomGap() });
          }

          lastId = selectedWord.id;
          current = pickNext();
          submitting = false;
          if (!current) { await stopSession(); window.removeEventListener("pagehide", onHide); render(root, null, completed, total, false); }
          else rerender();
        } catch (error) {
          submitting = false;
          rerender(undefined, error instanceof Error ? error.message : "提交失败，请重试");
        }
      }
    });
  } catch (error) {
    root.innerHTML = `<main class="study-page"><section class="study-error"><h2>学习内容加载失败</h2><p>${escapeHtml(error instanceof Error ? error.message : "请刷新页面后重试。")}</p></section></main>`;
  }
}
