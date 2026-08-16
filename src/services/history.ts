export type HistoryDay = {
  date: string;
  totalReviews: number;
  learnedWords: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
  accuracy: number;
};

export type HistoryResponse = {
  days: HistoryDay[];
  streak: number;
  activeDays: number;
  totalReviews: number;
};

export async function getStudyHistory(days = 30): Promise<HistoryResponse> {
  const response = await fetch(`/api/history?days=${Math.max(1, Math.min(days, 365))}`, { credentials: "include" });
  if (!response.ok) throw new Error("history_unavailable");
  return response.json();
}
