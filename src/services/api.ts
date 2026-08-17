export const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

// crypto.randomUUID() is unavailable on some non-secure HTTP origins.
// Install a local fallback once this module is loaded so the existing UI
// can keep using crypto.randomUUID() without changing the page implementation.
function ensureRandomUUID() {
  if (typeof globalThis.crypto === "undefined") return;
  if (typeof globalThis.crypto.randomUUID === "function") return;
  const cryptoLike = globalThis.crypto as Crypto & { randomUUID?: () => string };
  try {
    cryptoLike.randomUUID = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  } catch {
    // The caller can still handle environments where Crypto is not extensible.
  }
}
ensureRandomUUID();

type ReviewIdentity = { id: string; wordId: string; reviewedAt: number };

function alignReviewIdentity(path: string, init?: RequestInit): RequestInit | undefined {
  if (!init?.body || path !== "/reviews" || typeof init.body !== "string") return init;
  try {
    const payload = JSON.parse(init.body) as { wordId?: string; reviewedAt?: string; reviewId?: string };
    if (!payload.wordId || !payload.reviewedAt) return init;
    const rows = JSON.parse(localStorage.getItem("fsrs-review-identities") || "[]") as ReviewIdentity[];
    const target = new Date(payload.reviewedAt).getTime();
    const match = rows
      .filter(row => row.wordId === payload.wordId && Number.isFinite(row.reviewedAt))
      .map(row => ({ row, distance: Math.abs(row.reviewedAt - target) }))
      .filter(item => item.distance <= 5000)
      .sort((a, b) => a.distance - b.distance)[0];
    if (!match) return init;
    return { ...init, body: JSON.stringify({ ...payload, reviewId: match.row.id }) };
  } catch {
    return init;
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const requestInit = alignReviewIdentity(normalizedPath, init);
  const response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
    credentials: "include",
    ...requestInit,
    headers: { "Content-Type": "application/json", ...(requestInit?.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({} as Record<string, unknown>));
    throw new Error(String(body.error || `API ${response.status}`));
  }
  return response.json() as Promise<T>;
}
