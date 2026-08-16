import { apiRequest } from "./api";
import { store } from "../db/db";

let syncing = false;

export async function syncPendingReviews() {
  if (syncing) return { synced: 0, pending: 0 };
  syncing = true;
  let synced = 0;
  try {
    const pending = await store.getPendingReviews();
    for (const review of pending) {
      try {
        await apiRequest(`/reviews`, {
          method: "POST",
          body: JSON.stringify({
            wordId: review.wordId,
            rating: review.rating,
            reviewType: review.reviewType || "review",
            reviewId: review.id,
            reviewedAt: new Date(review.reviewedAt).toISOString(),
            card: {
              state: review.card.state,
              stability: review.card.stability,
              difficulty: review.card.difficulty,
              dueAt: review.card.due.toISOString(),
              reviewCount: review.card.reps
            }
          })
        });
        await store.markReviewSynced(review.id);
        synced += 1;
      } catch {
        // Keep the review pending. A later retry will send it again with the same id.
      }
    }
    return { synced, pending: Math.max(0, pending.length - synced) };
  } finally {
    syncing = false;
  }
}

export function startReviewSync() {
  if (typeof window === "undefined") return;
  void syncPendingReviews();
  window.addEventListener("online", () => void syncPendingReviews());
  window.setInterval(() => void syncPendingReviews(), 30000);
}
