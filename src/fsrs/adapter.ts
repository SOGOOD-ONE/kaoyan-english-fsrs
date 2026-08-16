import { createEmptyCard, Rating, State, type Card, type Grade, type ReviewLog } from "ts-fsrs";
import { scheduler } from "./config";
import { store } from "../db/db";
import type { StoredReview, Word } from "../types";

export { Rating, State };
export type { Grade };

function reviveCard(card: Card): Card {
  const c = structuredClone(card);
  c.due = new Date(c.due);
  if (c.last_review) c.last_review = new Date(c.last_review);
  return c;
}

export async function getCard(wordId: string): Promise<Card> {
  const saved = await store.getCard(wordId);
  if (saved) return reviveCard(saved.card);
  const card = createEmptyCard();
  await store.putCard({ wordId, card });
  return card;
}

export function preview(card: Card, now = new Date()) {
  return scheduler.repeat(card, now);
}

export async function review(word: Word, rating: Grade, now = new Date()) {
  const wordId = word.id;
  if (!wordId) throw new Error("Word is missing id");
  const card = await getCard(wordId);
  const result = scheduler.repeat(card, now)[rating];
  await store.putCard({ wordId, card: result.card });
  const review: StoredReview = {
    id: crypto.randomUUID(),
    wordId,
    reviewedAt: now.getTime(),
    rating,
    log: result.log
  };
  await store.putReview(review);
  return result;
}

export function getRetrievability(card: Card, now = new Date()) {
  return scheduler.get_retrievability(card, now, false);
}

export function isDue(card: Card, now = new Date()) {
  return card.due.getTime() <= now.getTime();
}

export function stateName(state: State) {
  return State[state] ?? String(state);
}

export async function forget(wordId: string, now = new Date()) {
  const card = await getCard(wordId);
  const result = scheduler.forget(card, now);
  await store.putCard({ wordId, card: result.card });
  return result.card;
}

export async function rollback(wordId: string, reviewLog: ReviewLog) {
  const card = await getCard(wordId);
  const result = scheduler.rollback(card, reviewLog);
  await store.putCard({ wordId, card: result.card });
  return result.card;
}
