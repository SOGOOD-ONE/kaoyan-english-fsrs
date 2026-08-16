import { getNewRecommendations, getMandatoryRecommendations, getSelfReviewRecommendations, type Recommendation } from './recommend';

export type StudyMode = 'new' | 'mandatory' | 'self';

export async function getStudyQueue(mode: StudyMode, quota: number): Promise<Recommendation[]> {
  if (mode === 'mandatory') return getMandatoryRecommendations();
  if (mode === 'self') return getSelfReviewRecommendations();
  return getNewRecommendations(quota);
}

export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
