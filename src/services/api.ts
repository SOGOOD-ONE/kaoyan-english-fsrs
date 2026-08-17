export const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

function ensureRandomUUID() {
  if (typeof globalThis.crypto === "undefined") return;
  if (typeof globalThis.crypto.randomUUID === "function") return;
  const fallback = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
  const cryptoLike = globalThis.crypto as Crypto & { randomUUID?: () => string };
  try { cryptoLike.randomUUID = fallback; }
  catch { try { Object.defineProperty(cryptoLike, "randomUUID", { configurable: true, value: fallback }); } catch {} }
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
    const match = rows.filter(row => row.wordId === payload.wordId && Number.isFinite(row.reviewedAt))
      .map(row => ({ row, distance: Math.abs(row.reviewedAt - target) }))
      .filter(item => item.distance <= 5000).sort((a, b) => a.distance - b.distance)[0];
    return match ? { ...init, body: JSON.stringify({ ...payload, reviewId: match.row.id }) } : init;
  } catch { return init; }
}

async function afterAuthenticatedReview(path: string, payload: unknown) {
  if (path !== "/reviews" || !payload || typeof payload !== "object") return;
  const reviewPayload = payload as { reviewType?: string };
  const mode = reviewPayload.reviewType;
  if (mode !== "new" && mode !== "mandatory" && mode !== "self") return;
  try {
    await fetch(`${API_BASE_URL}/study/today/progress`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode })
    });
  } catch {
    // Review itself is already persisted; progress can be reconciled on the next request.
  }
}

async function afterAuthMe(user: unknown) {
  if (!user || typeof user !== "object") return;
  try {
    const response = await fetch(`${API_BASE_URL}/settings`, { credentials: "include" });
    if (response.ok) {
      const settings = await response.json() as { dailyNewQuota?: number };
      if (Number.isFinite(settings.dailyNewQuota)) localStorage.setItem("daily-new-quota", String(settings.dailyNewQuota));
    }
  } catch {}

  try {
    const { restoreCloudStudyState } = await import("./studyRestore");
    await restoreCloudStudyState();
  } catch {}
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
  const result = await response.json() as T;
  if (normalizedPath === "/auth/me") {
    const user = (result as { user?: unknown }).user;
    if (user) void afterAuthMe(user);
  }
  if (normalizedPath === "/reviews") void afterAuthenticatedReview(normalizedPath, requestInit?.body ? JSON.parse(String(requestInit.body)) : undefined);
  return result;
}
