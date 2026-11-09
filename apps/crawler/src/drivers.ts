import { knownVcsDriver } from "@sw-catalog/shared";
import { fetchWithRetry } from "./http.ts";
import type { Driver } from "./types.ts";

// Riconoscimento del code hosting come go-vcsurl: host noti, poi richieste di prova per
// GitLab (cookie _gitlab_session su /api) e Gitea/Forgejo (/swagger.v1.json). Il risultato
// è messo in cache per host.
const cache = new Map<string, Promise<Driver | "">>();

export function detectDriver(raw: string): Promise<Driver | ""> {
  const known = knownVcsDriver(raw);
  if (known) return Promise.resolve(known);

  let origin: string;
  try {
    origin = new URL(raw).origin;
  } catch {
    return Promise.resolve("");
  }

  let pending = cache.get(origin);
  if (!pending) {
    pending = probe(origin);
    cache.set(origin, pending);
  }
  return pending;
}

async function probe(origin: string): Promise<Driver | ""> {
  try {
    const res = await fetchWithRetry(`${origin}/api`, { retries: 1, redirect: "manual" });
    if (res.headers.getSetCookie().some((c) => c.startsWith("_gitlab_session="))) return "gitlab";
  } catch {
    // host irraggiungibile: proviamo comunque Gitea
  }

  try {
    const res = await fetchWithRetry(`${origin}/swagger.v1.json`, { retries: 1, headers: { Range: "bytes=0-511" } });
    const head = (await res.text()).slice(0, 512);
    if (head.includes('"Forgejo API"') || head.includes('"Gitea API"')) return "gitea";
  } catch {
    // niente
  }
  return "";
}
