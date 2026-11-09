import { config } from "./config.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchOptions extends RequestInit {
  /** Tentativi in caso di errori di rete, 5xx o 429 (default 4) */
  retries?: number;
}

/**
 * fetch con retry e backoff esponenziale su errori di rete, 5xx e 429, e rispetto dei
 * rate limit di GitHub (primario: attende x-ratelimit-reset; secondario: retry-after).
 */
export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { retries = 4, ...init } = opts;
  const headers = new Headers(init.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", config.userAgent);

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(2 ** attempt * 1000);
      continue;
    }

    const wait = rateLimitWait(res);
    if (wait !== null && attempt < retries) {
      console.warn(`rate limit su ${new URL(url).host}: attendo ${Math.ceil(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    if ((res.status >= 500 || res.status === 429) && attempt < retries) {
      await sleep(2 ** attempt * 1000);
      continue;
    }
    return res;
  }
}

function rateLimitWait(res: Response): number | null {
  if (res.status !== 403 && res.status !== 429) return null;

  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) return Number(retryAfter) * 1000;

  if (res.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
    return Math.max(reset - Date.now(), 0) + 1000;
  }
  return null;
}

export async function getJson<T>(url: string, init: FetchOptions = {}): Promise<{ status: number; data: T | null; res: Response }> {
  const res = await fetchWithRetry(url, init);
  if (!res.ok) return { status: res.status, data: null, res };
  return { status: res.status, data: (await res.json()) as T, res };
}
