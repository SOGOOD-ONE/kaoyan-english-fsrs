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
              reviewCount: review.card.reps,
              correctCount: review.rating === 1 ? 0 : 1,
              wrongCount: review.rating === 1 ? 1 : 0
            }
          })
        });
        await store.markReviewSynced(review.id);
        synced += 1;
      } catch {
        // Keep the review pending. A later login, app mount, or successful review retries it.
      }
    }
    return { synced, pending: Math.max(0, pending.length - synced) };
  } finally {
    syncing = false;
  }
}
