import { createEmptyCard, type Card } from "ts-fsrs";
import { apiRequest } from "./api";
import { store } from "../db/db";

interface ServerCard {
  wordId: string;
  state: string | number;
  stability: number;
  difficulty: number;
  dueAt: string;
  lastReviewAt?: string | null;
  reviewCount: number;
  correctCount: number;
  wrongCount: number;
}

function restoreCard(row: ServerCard): Card {
  const card = createEmptyCard();
  card.state = typeof row.state === "number" ? row.state : Number(row.state);
  card.stability = Number(row.stability || 0);
  card.difficulty = Number(row.difficulty || 0);
  card.due = new Date(row.dueAt);
  card.reps = Number(row.reviewCount || 0);
  card.lapses = Number(row.wrongCount || 0);
  card.last_review = row.lastReviewAt ? new Date(row.lastReviewAt) : undefined;
  return card;
}

export async function restoreCloudStudyState() {
  const result = await apiRequest<{ cards: ServerCard[] }>("/sync/study");
  let restored = 0;
  for (const row of result.cards) {
    if (!row.wordId || !row.dueAt) continue;
    const card = restoreCard(row);
    await store.putCard({ wordId: row.wordId, card });
    restored += 1;
  }
  return restored;
}
