// @ts-nocheck
import { uuid } from "../utils/uuid";
import { Rating, preview, review, stateName, type Grade } from "../fsrs/adapter";
import { getNewRecommendations, getMandatoryRecommendations, getSelfReviewRecommendations, type Recommendation } from "../services/recommend";
import { downloadJson, exportData, importVocabularyFile } from "../services/importExport";
import { getStudyHistory } from "../services/history";
import { apiRequest } from "../services/api";
import { restoreCloudStudyState } from "../services/studyRestore";
import { setStoreUser, store } from "../db/db";
import { VOCAB_DATA } from "../data/vocab";
import { studyNav } from "./studyNav";

const reviewRatings: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
const ratingNames: Record<Grade, string> = { [Rating.Again]: "不认识", [Rating.Hard]: "模糊", [Rating.Good]: "认识", [Rating.Easy]: "很熟" };
const QUOTAS = [80, 100, 150, 200] as const;
type Mode = "new" | "mandatory" | "self";
let mode: Mode = (localStorage.getItem("study-mode") as Mode) || "new";
let quota = Number(localStorage.getItem("daily-new-quota") || 100);
if (![80, 100, 150, 200].includes(quota)) quota = 100;
let current: Recommendation | undefined;
let me: { id: string; email: string; nickname: string } | null = null;
let vocabularySelections: Record<string, boolean> = {};
let vocabularies: VocabularySummary[] = [];
let selectedWordIds: Set<string> | null = null;
let answerVisible = false;
let sessionAnswered = 0;
let sessionTotal = 0;
let sessionKey = "";
let submittingReview = false;
let syncError = "";
let todayProgress: { newCompleted: number; mandatoryCompleted: number; selfCompleted: number } | null = null;

type VocabularySummary = { id: string; name: string; kind: string; priority: number; description?: string; wordCount?: number; selected?: boolean };
type ServerWord = { id: string; word: string; type?: string; meaning: string; category?: string; source?: string };
type TodayStudy = { newTotal: number; newCompleted: number; reviewTotal: number; reviewCompleted: number; mandatoryCompleted: number; selfCompleted: number };

async function api<T>(path: string, init?: RequestInit): Promise<T> { return apiRequest<T>(path, init); }

export async function mount(root: HTMLElement) {
  try { const result = await api<{ user: typeof me }>("/auth/me"); me = result.user; } catch { me = null; }
  setStoreUser(me?.id);
  if (me) {
    try { await restoreCloudStudyState(); } catch {}
  }
  const words = await store.getWords();
  if (!words.length) for (const word of VOCAB_DATA) await store.putWord({ ...word, id: word.id ?? `vocab-${uuid()}` });
  if (me) {
    await hydrateServerVocabulary();
    await loadTodayProgress();
  } else todayProgress = null;
  await loadVocabularyState();
  // The legacy TypeScript UI is retained for compatibility only. The root V3 index.html is the active UI entrypoint.
  root.innerHTML = "";
}

async function loadTodayProgress() {
  if (!me) { todayProgress = null; return; }
  try { const result = await api<TodayStudy>("/study/today"); todayProgress = { newCompleted: result.newCompleted, mandatoryCompleted: result.mandatoryCompleted, selfCompleted: result.selfCompleted }; }
  catch { todayProgress = null; }
}

async function hydrateServerVocabulary() {
  try { const result = await api<{ words: ServerWord[] }>("/study/available"); for (const word of result.words) await store.putWord({ id: word.id, word: word.word, meaning: word.meaning, type: word.type, category: word.category }); }
  catch {}
}

async function loadVocabularyState() {
  if (!me) { vocabularies = []; vocabularySelections = {}; selectedWordIds = null; return; }
  try {
    vocabularies = await api<VocabularySummary[]>("/vocabularies");
    const selections = await api<{ vocabularyId: string; enabled: boolean }[]>("/vocabularies/selections");
    vocabularySelections = Object.fromEntries(selections.map(s => [s.vocabularyId, s.enabled]));
    vocabularies = vocabularies.map(v => ({ ...v, selected: vocabularySelections[v.id] ?? false }));
    const enabled = vocabularies.filter(v => v.selected);
    if (!enabled.length) { selectedWordIds = new Set(); return; }
    const details = await Promise.all(enabled.map(v => api<{ words: { id: string }[] }>(`/vocabularies/${v.id}`)));
    selectedWordIds = new Set(details.flatMap(d => d.words.map(w => w.id)));
  } catch { vocabularies = []; vocabularySelections = {}; selectedWordIds = null; }
}
