import type { Card } from "ts-fsrs";
import { getCard, getRetrievability, isDue } from "../fsrs/adapter";
import { store } from "../db/db";
import type { Word } from "../types";

export type Recommendation = { word: Word; card: Card; retrievability: number };
function startOfDay(date = new Date()) { const d = new Date(date); d.setHours(0,0,0,0); return d.getTime(); }
function endOfDay(date = new Date()) { const d = new Date(date); d.setHours(23,59,59,999); return d.getTime(); }

/** 今日新词计划：按 24:00 切日，已经在今天首次学习过的词会计入今日数量。 */
export async function getNewRecommendations(dailyQuota: number, now = new Date()) {
  const today = startOfDay(now);
  const words = await store.getWords();
  const rows: Recommendation[] = [];
  let learnedToday = 0;
  for (const word of words) {
    if (!word.id) continue;
    const reviews = await store.getReviews(word.id);
    const first = reviews.length ? reviews.reduce((a,b) => a.reviewedAt < b.reviewedAt ? a : b) : undefined;
    if (first && first.reviewedAt >= today) learnedToday++;
    if (reviews.length > 0) continue;
    const card = await getCard(word.id);
    rows.push({ word, card, retrievability: getRetrievability(card, now) });
  }
  const remaining = Math.max(0, dailyQuota - learnedToday);
  rows.sort((a,b) => (a.word.hfCount ?? Number.MAX_SAFE_INTEGER) - (b.word.hfCount ?? Number.MAX_SAFE_INTEGER) || a.word.word.localeCompare(b.word.word));
  return rows.slice(0, remaining);
}

/** 强制复习：前一天首次背诵的词；按本地时间 24:00 切日。今天已经复习过的不重复。 */
export async function getMandatoryRecommendations(now = new Date()) {
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const from = startOfDay(yesterday), to = endOfDay(yesterday), todayFrom = startOfDay(now);
  const reviews = await store.getReviews();
  const byWord = new Map<string, typeof reviews>();
  for (const r of reviews) { const list = byWord.get(r.wordId) ?? []; list.push(r); byWord.set(r.wordId, list); }
  const rows: Recommendation[] = [];
  for (const [wordId, wordReviews] of byWord) {
    const first = wordReviews.reduce((a,b) => a.reviewedAt < b.reviewedAt ? a : b);
    if (first.reviewedAt < from || first.reviewedAt > to) continue;
    if (wordReviews.some(r => r.reviewedAt >= todayFrom)) continue;
    const word = await store.getWord(wordId); if (!word) continue;
    const card = await getCard(wordId);
    rows.push({ word, card, retrievability: getRetrievability(card, now) });
  }
  rows.sort((a,b) => a.word.word.localeCompare(b.word.word));
  return rows;
}

/** 自主复习：当天所有 FSRS 已到期卡片，不设固定 20 个上限。 */
export async function getSelfReviewRecommendations(now = new Date()) {
  const words = await store.getWords(); const rows: Recommendation[] = [];
  for (const word of words) { if (!word.id) continue; const card = await getCard(word.id); if (isDue(card, now)) rows.push({ word, card, retrievability: getRetrievability(card, now) }); }
  rows.sort((a,b) => a.card.due.getTime() - b.card.due.getTime()); return rows;
}
export async function getDueRecommendations(limit?: number) { const rows = await getSelfReviewRecommendations(); return limit === undefined ? rows : rows.slice(0, limit); }
