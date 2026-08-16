import * as XLSX from "xlsx";
import { store } from "../db/db";
import type { Word } from "../types";

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeWord(row: Record<string, unknown>, index: number): Word | null {
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return "";
  };

  const word = pick("word", "Word", "单词", "词汇", "英文", "English", "term");
  if (!word) return null;

  const explicitId = pick("id", "ID", "编号");
  const meaning = pick("meaning", "Meaning", "释义", "中文", "中文释义", "词义", "translation", "翻译");
  const example = pick("example", "Example", "例句", "真题例句", "sentence", "Sentence", "语境");
  const tagsText = pick("tags", "Tags", "标签", "分类");
  const hf = pick("hfCount", "HFCount", "词频", "frequency", "Frequency");
  const years = pick("examYears", "ExamYears", "年份", "真题年份");

  // If the source has no ID, use a stable word-based ID rather than a random ID.
  // This prevents re-importing the same vocabulary from creating duplicates and
  // preserves the existing FSRS card/review history for that word.
  const id = explicitId || `word-${normalizeKey(word)}`;

  return {
    id,
    word,
    meaning,
    example: example || undefined,
    tags: tagsText ? tagsText.split(/[,，、;；|]/).map(s => s.trim()).filter(Boolean) : undefined,
    hfCount: hf && !Number.isNaN(Number(hf)) ? Number(hf) : undefined,
    examYears: years ? years.split(/[,，、;；|]/).map(s => Number(s.trim())).filter(Number.isFinite) : undefined
  };
}

function parseCsv(text: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quoted && next === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = (rows[0] ?? []).map(h => h.trim().replace(/^\uFEFF/, ""));
  return rows.slice(1).filter(r => r.some(Boolean)).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

export async function importVocabularyFile(file: File) {
  const name = file.name.toLowerCase();
  let rows: Record<string, unknown>[] = [];
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  } else if (name.endsWith(".csv")) {
    rows = parseCsv(await file.text());
  } else if (name.endsWith(".json")) {
    const data = JSON.parse(await file.text());
    rows = Array.isArray(data) ? data : data.words ?? [];
  } else {
    throw new Error("只支持 .xlsx、.xls、.csv、.json");
  }

  const normalized = rows.map(normalizeWord).filter((x): x is Word => Boolean(x));
  const unique = new Map<string, Word>();
  for (const word of normalized) unique.set(word.id, word);

  if (!unique.size) throw new Error("没有识别到词汇，请确认存在“单词/word”列。");
  for (const word of unique.values()) await store.putWord(word);

  return {
    imported: unique.size,
    sourceRows: rows.length,
    skipped: rows.length - normalized.length,
    duplicates: normalized.length - unique.size
  };
}

export async function importWords(words: Word[]) {
  for (const word of words) await store.putWord(word);
}

export async function exportData() {
  const [words, cards, reviews] = await Promise.all([store.getWords(), store.getCards(), store.getReviews()]);
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), words, cards, reviews };
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}