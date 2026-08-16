import { State, type Card, type Rating, type ReviewLog } from "ts-fsrs";
import { store } from "../db/db";
import type { StoredCard, StoredReview } from "../types";
import { apiRequest } from "./api";

type ServerCard = { id: string; wordId: string; state: string; stability: number; difficulty: number; dueAt: string; firstLearnedAt?: string | null; lastReviewAt?: string | null; correctCount: number; wrongCount: number; reviewCount: number };
type ServerReview = { id: string; wordId: string; rating: number; reviewedAt: string; reviewType: string };
type SyncResponse = { cards: ServerCard[]; reviews: ServerReview[] };

function serverStateToLocal(state: string): Card["state"] {
  const normalized = String(state).toLowerCase();
  if (normalized === "learning") return State.Learning;
  if (normalized === "review") return State.Review;
  if (normalized === "relearning") return State.Relearning;
  return State.New;
}

function localStateToServer(state: Card["state"]): string {
  if (state === State.Learning) return "learning";
  if (state === State.Review) return "review";
  if (state === State.Relearning) return "relearning";
  return "new";
}

function serverCardToLocal(card: ServerCard): StoredCard {
  return {
    wordId: card.wordId,
    card: {
      due: new Date(card.dueAt), stability: card.stability, difficulty: card.difficulty,
      state: serverStateToLocal(card.state), last_review: card.lastReviewAt ? new Date(card.lastReviewAt) : undefined,
      reps: card.reviewCount, lapses: card.wrongCount, learning_steps: 0,
    } as Card,
  };
}

function remoteReviewToStored(remote: ServerReview, card: ServerCard | undefined): StoredReview {
  const snapshot = card ? serverCardToLocal(card).card : ({ due: new Date(remote.reviewedAt), stability: 0, difficulty: 0, state: State.New, reps: 0, lapses: 0, learning_steps: 0 } as Card);
  return { id: remote.id, wordId: remote.wordId, reviewedAt: new Date(remote.reviewedAt).getTime(), rating: remote.rating as Rating, log: {} as ReviewLog, card: snapshot, reviewType: remote.reviewType, syncedAt: Date.now() };
}

export async function pushPendingReviews(): Promise<number> {
  const localReviews = await store.getPendingReviews();
  let uploaded = 0;
  for (const review of localReviews) {
    try { await uploadReview(review); await store.markReviewSynced(review.id); uploaded++; }
    catch { break; }
  }
  return uploaded;
}

export async function syncStudyData(): Promise<{ cards: number; reviews: number; uploaded: number }> {
  const uploaded = await pushPendingReviews();
  const server = await apiRequest<SyncResponse>("/sync/study");
  const localReviews = await store.getReviews();
  const localById = new Map(localReviews.map(r => [r.id, r]));
  const remoteCardByWord = new Map(server.cards.map(card => [card.wordId, card]));
  for (const remote of server.reviews) if (!localById.has(remote.id)) await store.putReview(remoteReviewToStored(remote, remoteCardByWord.get(remote.wordId)));

  const localCards = await store.getCards();
  const localCardByWord = new Map(localCards.map(c => [c.wordId, c]));
  for (const remote of server.cards) {
    const local = localCardByWord.get(remote.wordId);
    const localReviewsForWord = localReviews.filter(r => r.wordId === remote.wordId);
    const latestLocal = localReviewsForWord.reduce<number>((max, r) => Math.max(max, r.reviewedAt), 0);
    const remoteTime = remote.lastReviewAt ? new Date(remote.lastReviewAt).getTime() : 0;
    if (!local || remoteTime >= latestLocal) await store.putCard(serverCardToLocal(remote));
  }
  return { cards: server.cards.length, reviews: server.reviews.length, uploaded };
}

export async function uploadReview(review: StoredReview): Promise<void> {
  const localCard = review.card;
  await apiRequest("/reviews", { method: "POST", body: JSON.stringify({ reviewId: review.id, wordId: review.wordId, rating: review.rating, reviewType: review.reviewType || "review", reviewedAt: new Date(review.reviewedAt).toISOString(), card: localCard ? { state: localStateToServer(localCard.state), stability: localCard.stability, difficulty: localCard.difficulty, dueAt: localCard.due.toISOString(), reviewCount: localCard.reps, wrongCount: localCard.lapses, correctCount: Math.max(0, localCard.reps - localCard.lapses) } : undefined }) });
}