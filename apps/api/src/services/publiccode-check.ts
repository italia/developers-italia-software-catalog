import { declaredIpa } from "@sw-catalog/db";
import { validateForCatalog } from "@sw-catalog/publiccode-validator";
import type { PubliccodeCheck } from "@sw-catalog/shared";
import { publiccodeName } from "../lib/publiccode.ts";
import { safeFetch, UnsafeUrlError } from "../lib/safe-fetch.ts";

// Legge il publiccode.yml di un singolo repository dal branch predefinito (HEAD) e lo
// valida: serve ai form di terze parti per dare subito un riscontro, prima del crawler.

/** URL raw candidati per il file, in ordine di probabilità. */
export function rawFileUrls(repoUrl: string): string[] {
  const u = new URL(repoUrl);
  const path = u.pathname.replace(/\/+$/, "").replace(/\.git$/, "");
  const base = `${u.origin}${path}`;
  const host = u.hostname.toLowerCase();
  if (host === "github.com") {
    const [, owner, repo] = path.split("/");
    return [`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/publiccode.yml`];
  }
  if (host === "bitbucket.org") return [`${base}/raw/HEAD/publiccode.yml`];
  if (host === "gitlab.com" || host.includes("gitlab")) return [`${base}/-/raw/HEAD/publiccode.yml`];
  // Altri domini: GitLab su dominio proprio o Gitea/Forgejo.
  return [`${base}/-/raw/HEAD/publiccode.yml`, `${base}/raw/HEAD/publiccode.yml`];
}

/** Un repository singolo, non un'organizzazione: almeno owner/repo nel percorso. */
export function isRepositoryUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.pathname.replace(/\/+$/, "").split("/").filter(Boolean).length >= 2;
  } catch {
    return false;
  }
}

const MAX_BYTES = 1_000_000;

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await safeFetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "developers-italia-software-catalog" },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("text/html")) return null; // pagina di login o di errore, non il file
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
    const text = await res.text();
    return text.length > MAX_BYTES ? null : text;
  } catch (e) {
    // Un URL rifiutato (host interno, porta, schema) è un errore da mostrare, non un file assente.
    if (e instanceof UnsafeUrlError) throw e;
    return null;
  }
}

/** Sostituibile nei test. */
export const publiccodeFetcher = { fetchText };

export async function checkRepository(repoUrl: string): Promise<PubliccodeCheck & { yaml: string | null }> {
  for (const fileUrl of rawFileUrls(repoUrl)) {
    const yaml = await publiccodeFetcher.fetchText(fileUrl);
    if (yaml === null) continue;
    const result = validateForCatalog(yaml, { fileRawUrl: fileUrl });
    return {
      fileUrl,
      found: true,
      valid: result.valid,
      name: publiccodeName(yaml),
      errors: result.problems.filter((p) => p.level === "error").map((p) => ({ key: p.key, description: p.message })),
      warnings: result.problems.filter((p) => p.level === "warning").map((p) => ({ key: p.key, description: p.message })),
      declaredIpa: declaredIpa(yaml),
      yaml,
    };
  }
  return { fileUrl: null, found: false, valid: false, name: null, errors: [], warnings: [], declaredIpa: null, yaml: null };
}

/** Il risultato senza il YAML, da salvare o restituire. */
export const withoutYaml = ({ yaml: _, ...check }: PubliccodeCheck & { yaml: string | null }): PubliccodeCheck => check;
