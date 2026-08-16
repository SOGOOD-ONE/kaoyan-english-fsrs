import type { Card } from "ts-fsrs";
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

/** 今天还没有任何学习记录的新词，用于“今日背诵”数量控制。 */
export async function getNewRecommendations(limit: number) {
  const words = await store.getWords();
  const rows: Recommendation[] = [];
  for (const word of words) {
    if (!word.id) continue;
    const reviews = await store.getReviews(word.id);
    if (reviews.length > 0) continue;
    const card = await getCard(word.id);
    rows.push({ word, card, retrievability: getRetrievability(card) });
  }
  rows.sort((a, b) => {
    const af = a.word.hfCount ?? Number.MAX_SAFE_INTEGER;
    const bf = b.word.hfCount ?? Number.MAX_SAFE_INTEGER;
    return af - bf || a.word.word.localeCompare(b.word.word);
  });
  return rows.slice(0, Math.max(0, limit));
}

/**
 * 强制复习：前一天首次背诵/学习的单词。
 * “前一天”严格按用户设备本地时间 00:00 切日。
 * 今天已经完成过复习的单词不重复进入强制队列。
 */
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
    const first = wordReviews.reduce((a, b) => a.reviewedAt < b.reviewedAt ? a : b);
    if (first.reviewedAt < from || first.reviewedAt > to) continue;
    if (wordReviews.some(r => r.reviewedAt >= todayFrom)) continue;
    const word = await store.getWord(wordId);
    if (!word) continue;
    const card = await getCard(wordId);
    rows.push({ word, card, retrievability: getRetrievability(card) });
  }

  rows.sort((a, b) => a.word.word.localeCompare(b.word.word));
  return rows;
}

/** 自主复习：当前所有真正到期的 FSRS 卡片，不再固定截取 20 个。 */
export async function getSelfReviewRecommendations(now = new Date()) {
  const words = await store.getWords();
  const rows: Recommendation[] = [];
  for (const word of words) {
    if (!word.id) continue;
    const card = await getCard(word.id);
    if (isDue(card, now)) rows.push({ word, card, retrievability: getRetrievability(card, now) });
  }
  rows.sort((a, b) => a.card.due.getTime() - b.card.due.getTime());
  return rows;
}

/** 兼容旧调用：现在返回全部到期卡，limit 仅作为可选上限。 */
export async function getDueRecommendations(limit?: number) {
  const rows = await getSelfReviewRecommendations();
  return limit === undefined ? rows : rows.slice(0, limit);
}
