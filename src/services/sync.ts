import type { Card, Rating, ReviewLog } from "ts-fsrs";
import { store } from "../db/db";
import type { StoredCard, StoredReview } from "../types";

type ServerCard = {
  id: string; wordId: string; state: string; stability: number; difficulty: number;
  dueAt: string; firstLearnedAt?: string | null; lastReviewAt?: string | null;
  correctCount: number; wrongCount: number; reviewCount: number;
};
type ServerReview = { id: string; wordId: string; rating: number; reviewedAt: string; reviewType: string };
type SyncResponse = { cards: ServerCard[]; reviews: ServerReview[] };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  if (!response.ok) throw new Error(`sync ${response.status}`);
  return response.json();
}

function localTimestamp(review: StoredReview) { return review.reviewedAt; }
function serverTimestamp(review: ServerReview) { return new Date(review.reviewedAt).getTime(); }

function serverCardToLocal(card: ServerCard): StoredCard {
  return { wordId: card.wordId, card: {
    due: new Date(card.dueAt), stability: card.stability, difficulty: card.difficulty,
    state: card.state as Card["state"], last_review: card.lastReviewAt ? new Date(card.lastReviewAt) : undefined,
    reps: card.reviewCount, lapses: card.wrongCount, learning_steps: 0
  } as Card };
}

export async function syncStudyData(): Promise<{ cards: number; reviews: number }> {
  const server = await request<SyncResponse>("/sync/study");
  const localReviews = await store.getReviews();
  const localById = new Map(localReviews.map(r => [r.id, r]));

  // Server review IDs are authoritative for already-uploaded events.
  for (const remote of server.reviews) {
    if (!localById.has(remote.id)) {
      await store.putReview({ id: remote.id, wordId: remote.wordId, reviewedAt: serverTimestamp(remote), rating: remote.rating as Rating, log: {} as ReviewLog });
    }
  }

  // For cards, choose the state attached to the most recent review. If there is no local review,
  // the server card is still safe to hydrate because it is the user's cloud state.
  const localCards = await store.getCards();
  const localCardByWord = new Map(localCards.map(c => [c.wordId, c]));
  for (const remote of server.cards) {
    const local = localCardByWord.get(remote.wordId);
    const localReviewsForWord = localReviews.filter(r => r.wordId === remote.wordId);
    const latestLocal = localReviewsForWord.reduce<number>((max, r) => Math.max(max, localTimestamp(r)), 0);
    const remoteTime = remote.lastReviewAt ? new Date(remote.lastReviewAt).getTime() : 0;
    if (!local || remoteTime >= latestLocal) await store.putCard(serverCardToLocal(remote));
  }

  return { cards: server.cards.length, reviews: server.reviews.length };
}

export async function uploadReview(review: StoredReview): Promise<void> {
  await request("/reviews", { method: "POST", body: JSON.stringify({ wordId: review.wordId, rating: review.rating, reviewType: "review", reviewedAt: new Date(review.reviewedAt).toISOString() }) });
}
