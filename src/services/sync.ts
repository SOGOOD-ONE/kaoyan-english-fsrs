import type { Card, Rating, ReviewLog } from "ts-fsrs";
import { store } from "../db/db";
import type { StoredCard, StoredReview } from "../types";
import { apiRequest } from "./api";

type ServerCard = { id: string; wordId: string; state: string; stability: number; difficulty: number; dueAt: string; firstLearnedAt?: string | null; lastReviewAt?: string | null; correctCount: number; wrongCount: number; reviewCount: number };
type ServerReview = { id: string; wordId: string; rating: number; reviewedAt: string; reviewType: string };
type SyncResponse = { cards: ServerCard[]; reviews: ServerReview[] };

function serverCardToLocal(card: ServerCard): StoredCard {
  return { wordId: card.wordId, card: { due: new Date(card.dueAt), stability: card.stability, difficulty: card.difficulty, state: card.state as Card["state"], last_review: card.lastReviewAt ? new Date(card.lastReviewAt) : undefined, reps: card.reviewCount, lapses: card.wrongCount, learning_steps: 0 } as Card };
}

/** Upload every local review first. The review UUID makes the endpoint idempotent. */
export async function pushPendingReviews(): Promise<number> {
  const localReviews = await store.getReviews();
  let uploaded = 0;
  for (const review of localReviews) {
    try {
      await uploadReview(review);
      uploaded++;
    } catch {
      break;
    }
  }
  return uploaded;
}

export async function syncStudyData(): Promise<{ cards: number; reviews: number; uploaded: number }> {
  const uploaded = await pushPendingReviews();
  const server = await apiRequest<SyncResponse>("/sync/study");
  const localReviews = await store.getReviews();
  const localById = new Map(localReviews.map(r => [r.id, r]));

  for (const remote of server.reviews) {
    if (!localById.has(remote.id)) {
      await store.putReview({ id: remote.id, wordId: remote.wordId, reviewedAt: new Date(remote.reviewedAt).getTime(), rating: remote.rating as Rating, log: {} as ReviewLog });
    }
  }

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
  await apiRequest("/reviews", { method: "POST", body: JSON.stringify({ reviewId: review.id, wordId: review.wordId, rating: review.rating, reviewType: "review", reviewedAt: new Date(review.reviewedAt).toISOString() }) });
}
