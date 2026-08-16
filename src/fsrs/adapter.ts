import { createEmptyCard, Rating, State, type Card, type Grade, type ReviewLog } from "ts-fsrs";
import { scheduler } from "./config";
import { store } from "../db/db";
import { startReviewSync } from "../services/reviewSync";
import type { StoredReview, Word } from "../types";

export { Rating, State };
export type { Grade };

startReviewSync();

function reviveCard(card: Card): Card {
  const c = structuredClone(card);
  c.due = new Date(c.due);
  if (c.last_review) c.last_review = new Date(c.last_review);
  return c;
}

function rememberReviewIdentity(review: StoredReview) {
  try {
    const key = "fsrs-review-identities";
    const rows = JSON.parse(localStorage.getItem(key) || "[]") as Array<{ id: string; wordId: string; reviewedAt: number }>;
    rows.push({ id: review.id, wordId: review.wordId, reviewedAt: review.reviewedAt });
    const trimmed = rows.slice(-200);
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch {
    // Storage is optional; IndexedDB remains the source of local review data.
  }
}

export async function getCard(wordId: string): Promise<Card> {
  const saved = await store.getCard(wordId);
  if (saved) return reviveCard(saved.card);
  const card = createEmptyCard();
  await store.putCard({ wordId, card });
  return card;
}

export function preview(card: Card, now = new Date()) { return scheduler.repeat(card, now); }

export async function review(word: Word, rating: Grade, now = new Date()) {
  const wordId = word.id;
  if (!wordId) throw new Error("Word is missing id");
  const card = await getCard(wordId);
  const result = scheduler.repeat(card, now)[rating];
  const review: StoredReview = {
    id: crypto.randomUUID(),
    wordId,
    reviewedAt: now.getTime(),
    rating,
    log: result.log,
    card: result.card
  };
  await store.putCard({ wordId, card: result.card });
  await store.putReview(review);
  rememberReviewIdentity(review);
  return { ...result, reviewId: review.id, reviewedAt: now.toISOString() };
}

export function getRetrievability(card: Card, now = new Date()) { return scheduler.get_retrievability(card, now, false); }
export function isDue(card: Card, now = new Date()) { return card.due.getTime() <= now.getTime(); }
export function stateName(state: State) { return State[state] ?? String(state); }

export async function forget(wordId: string, now = new Date()) {
  const card = await getCard(wordId);
  const result = scheduler.forget(card, now);
  await store.putCard({ wordId, card: result.card });
  return result.card;
}

export async function rollback(wordId: string, reviewLog: ReviewLog) {
  const card = await getCard(wordId);
  const previous = scheduler.rollback(card, reviewLog);
  await store.putCard({ wordId, card: previous });
  return previous;
}