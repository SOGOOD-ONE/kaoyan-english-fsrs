import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { StoredCard, StoredReview, Word } from "../types";

interface Schema extends DBSchema {
  words: { key: string; value: Word };
  cards: { key: string; value: StoredCard };
  reviews: {
    key: string;
    value: StoredReview;
    indexes: { wordId: string; reviewedAt: number };
  };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | undefined;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<Schema>("kaoyan-fsrs", 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("words")) database.createObjectStore("words", { keyPath: "id" });
        if (!database.objectStoreNames.contains("cards")) database.createObjectStore("cards", { keyPath: "wordId" });
        if (!database.objectStoreNames.contains("reviews")) {
          const reviews = database.createObjectStore("reviews", { keyPath: "id" });
          reviews.createIndex("wordId", "wordId");
          reviews.createIndex("reviewedAt", "reviewedAt");
        }
      }
    });
  }
  return dbPromise;
}

export const store = {
  async putWord(word: Word) { return (await db()).put("words", word); },
  async getWord(id: string) { return (await db()).get("words", id); },
  async getWords() { return (await db()).getAll("words"); },
  async putCard(card: StoredCard) { return (await db()).put("cards", card); },
  async getCard(wordId: string) { return (await db()).get("cards", wordId); },
  async getCards() { return (await db()).getAll("cards"); },
  async putReview(review: StoredReview) { return (await db()).put("reviews", review); },
  async getReviews(wordId?: string) {
    const database = await db();
    return wordId ? database.getAllFromIndex("reviews", "wordId", wordId) : database.getAll("reviews");
  }
};
