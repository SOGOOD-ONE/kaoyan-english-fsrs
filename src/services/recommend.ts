import { createEmptyCard, State, type Card } from "ts-fsrs";
import { getCard, getRetrievability, isDue } from "../fsrs/adapter";
import { store } from "../db/db";
import type { Word } from "../types";

export type Recommendation = { word: Word; card: Card; retrievability: number };

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export async function getNewRecommendations(dailyQuota: number, now = new Date()) {
  const today = startOfDay(now);
  const words = await store.getWords();
  const reviews = await store.getReviews();
  const firstReviewByWord = new Map<string, number>();

  for (const review of reviews) {
    const current = firstReviewByWord.get(review.wordId);
    if (current === undefined || review.reviewedAt < current) {
      firstReviewByWord.set(review.wordId, review.reviewedAt);
    }
  }

  let learnedToday = 0;
  for (const reviewedAt of firstReviewByWord.values()) {
    if (reviewedAt >= today) learnedToday++;
  }

  const remaining = Math.max(0, dailyQuota - learnedToday);
  if (remaining === 0) return [];

  const rows: Recommendation[] = [];
  for (const word of words) {
    if (!word.id || firstReviewByWord.has(word.id)) continue;
    const card = createEmptyCard(now);
    rows.push({ word, card, retrievability: getRetrievability(card, now) });
  }

  rows.sort(
    (a, b) =>
      (a.word.hfCount ?? Number.MAX_SAFE_INTEGER) - (b.word.hfCount ?? Number.MAX_SAFE_INTEGER) ||
      a.word.word.localeCompare(b.word.word),
  );
  return rows.slice(0, remaining);
}

export async function getMandatoryRecommendations(now = new Date()) {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const from = startOfDay(yesterday);
  const to = endOfDay(yesterday);
  const todayFrom = startOfDay(now);
  const reviews = await store.getReviews();

  const byWord = new Map<string, typeof reviews>();
  for (const review of reviews) {
    const list = byWord.get(review.wordId) ?? [];
    list.push(review);
    byWord.set(review.wordId, list);
  }

  const rows: Recommendation[] = [];
  for (const [wordId, wordReviews] of byWord) {
    const first = wordReviews.reduce((a, b) => (a.reviewedAt < b.reviewedAt ? a : b));
    if (first.reviewedAt < from || first.reviewedAt > to) continue;
    if (wordReviews.some((review) => review.reviewedAt >= todayFrom)) continue;

    const word = await store.getWord(wordId);
    if (!word) continue;
    const card = await getCard(wordId);
    rows.push({ word, card, retrievability: getRetrievability(card, now) });
  }

  rows.sort((a, b) => a.word.word.localeCompare(b.word.word));
  return rows;
}

export async function getSelfReviewRecommendations(now = new Date()) {
  const words = await store.getWords();
  const mandatory = await getMandatoryRecommendations(now);
  const mandatoryIds = new Set(mandatory.map((row) => row.word.id).filter(Boolean));
  const rows: Recommendation[] = [];

  for (const word of words) {
    if (!word.id || mandatoryIds.has(word.id)) continue;
    const saved = await store.getCard(word.id);
    if (!saved) continue;

    const card = saved.card;
    if (card.state === State.New) continue;
    if (isDue(card, now)) {
      rows.push({ word, card, retrievability: getRetrievability(card, now) });
    }
  }

  rows.sort((a, b) => a.card.due.getTime() - b.card.due.getTime());
  return rows;
}

export async function getDueRecommendations(limit?: number) {
  const rows = await getSelfReviewRecommendations();
  return limit === undefined ? rows : rows.slice(0, limit);
}
