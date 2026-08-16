import * as XLSX from "xlsx";
import { store } from "../db/db";
import type { Word } from "../types";
import { apiRequest } from "./api";

function normalizeKey(value: string) { return value.trim().toLowerCase().replace(/\s+/g, " "); }
function mergeWord(oldWord: Word | undefined, incoming: Word): Word {
  if (!oldWord) return incoming;
  return { ...oldWord, ...incoming, id: oldWord.id, meaning: incoming.meaning || oldWord.meaning, example: incoming.example || oldWord.example, type: incoming.type || oldWord.type, category: incoming.category || oldWord.category, tags: Array.from(new Set([...(oldWord.tags ?? []), ...(incoming.tags ?? [])])), examYears: Array.from(new Set([...(oldWord.examYears ?? []), ...(incoming.examYears ?? [])])).sort((a,b)=>a-b), hfCount: incoming.hfCount ?? oldWord.hfCount };
}
function normalizeWord(row: Record<string, unknown>): Word | null {
  const pick=(...keys:string[])=>{for(const key of keys){const value=row[key];if(value!==undefined&&value!==null&&String(value).trim())return String(value).trim();}return "";};
  const word=pick("word","Word","单词","词汇","英文","English","term");if(!word)return null;
  const explicitId=pick("id","ID","编号"), meaning=pick("meaning","Meaning","释义","中文","中文释义","词义","translation","翻译"), example=pick("example","Example","例句","真题例句","sentence","Sentence","语境"), tagsText=pick("tags","Tags","标签","分类"), type=pick("type","Type","词性","词性/短语","part of speech","POS"), category=pick("category","Category","分类","类别"), hf=pick("hfCount","HFCount","词频","frequency","Frequency"), years=pick("examYears","ExamYears","年份","真题年份");
  return {id:explicitId||`word-${normalizeKey(word)}`,word,meaning,example:example||undefined,type:type||undefined,category:category||undefined,tags:tagsText?tagsText.split(/[,，、;；|]/).map(s=>s.trim()).filter(Boolean):undefined,hfCount:hf&&!Number.isNaN(Number(hf))?Number(hf):undefined,examYears:years?years.split(/[,，、;；|]/).map(s=>Number(s.trim())).filter(Number.isFinite):undefined};
}
function parseCsv(text:string):Record<string,unknown>[] { const rows:string[][]=[];let row:string[]=[],cell="",quoted=false;for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];if(ch==='"'&&quoted&&next==='"'){cell+='"';i++;}else if(ch==='"')quoted=!quoted;else if(ch===','&&!quoted){row.push(cell);cell="";}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell);rows.push(row);row=[];cell="";}else cell+=ch;}if(cell||row.length){row.push(cell);rows.push(row);}const headers=(rows[0]??[]).map(h=>h.trim().replace(/^\uFEFF/,""));return rows.slice(1).filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??""]))); }

export async function importVocabularyFile(file:File){
  const name=file.name.toLowerCase();let rows:Record<string,unknown>[]=[];
  if(name.endsWith(".xlsx")||name.endsWith(".xls")){const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]],{defval:""});}
  else if(name.endsWith(".csv"))rows=parseCsv(await file.text());
  else if(name.endsWith(".json")){const data=JSON.parse(await file.text());rows=Array.isArray(data)?data:data.words??[];}
  else throw new Error("只支持 .xlsx、.xls、.csv、.json");
  const normalized=rows.map(normalizeWord).filter((x):x is Word=>Boolean(x));
  const unique=new Map<string,Word>(); for(const word of normalized){const key=normalizeKey(word.word);unique.set(key,mergeWord(unique.get(key),word));}
  if(!unique.size)throw new Error("没有识别到词汇，请确认存在“单词/word”列。");

  const words=Array.from(unique.values());
  try {
    const remote = await apiRequest<{ id:string; name:string; inserted:number; updated:number; linked:number; words:Word[] }>("/vocabularies/import", { method:"POST", body:JSON.stringify({ name:file.name.replace(/\.(xlsx|xls|csv|json)$/i,"") || "我的词库", words }) });
    const byLocal = new Map(words.map(w=>[normalizeKey(w.word),w]));
    for(const remoteWord of remote.words){ const incoming=byLocal.get(normalizeKey(remoteWord.word)); await store.putWord(mergeWord(incoming,remoteWord)); }
    return { imported: remote.linked, inserted: remote.inserted, updated: remote.updated, sourceRows: rows.length, skipped: rows.length-normalized.length, duplicates: normalized.length-unique.size, serverVocabularyId: remote.id, serverSynchronized: true };
  } catch (error) {
    // Logged-out/offline mode keeps the import local; the canonical cloud copy is created after login/retry.
    const existing=await store.getWords(); const byWord=new Map(existing.map(w=>[normalizeKey(w.word),w])); const byId=new Map(existing.filter(w=>w.id).map(w=>[w.id!,w])); let inserted=0,updated=0;
    for(const incoming of words){ const oldByWord=byWord.get(normalizeKey(incoming.word)); let word=mergeWord(oldByWord,incoming); const idOwner=word.id?byId.get(word.id):undefined; if(idOwner&&normalizeKey(idOwner.word)!==normalizeKey(word.word))word={...word,id:`word-${normalizeKey(word.word)}`}; await store.putWord(word); if(oldByWord)updated++;else inserted++; byWord.set(normalizeKey(word.word),word);if(word.id)byId.set(word.id,word); }
    return { imported:words.length, inserted, updated, sourceRows:rows.length, skipped:rows.length-normalized.length, duplicates:normalized.length-unique.size, serverSynchronized:false, serverError:error instanceof Error?error.message:"unavailable" };
  }
}

export async function importWords(words:Word[]){for(const word of words)await store.putWord(word);}
export async function exportData(){const [words,cards,reviews]=await Promise.all([store.getWords(),store.getCards(),store.getReviews()]);return{schemaVersion:1,exportedAt:new Date().toISOString(),words,cards,reviews};}
export function downloadJson(data:unknown,filename:string){const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);}
