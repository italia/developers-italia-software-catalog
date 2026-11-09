// Abbinamento software → publisher, senza accesso al database (testabile e riusabile).
//
// Regole, nell'ordine:
//   1. code hosting: il publishers_code_hosting più specifico (URL più lungo) che contiene
//      uno degli URL del software; stesso repository se group=false, prefisso dell'org o
//      del gruppo se group=true;
//   2. codice IPA: organisation.uri (o il vecchio IT.riuso.codiceIPA) del publiccode.yml,
//      confrontato con publishers.alternative_id.
// Se più publisher diversi corrispondono allo stesso livello il risultato è "ambiguous".
import { normalizeUrl } from "@sw-catalog/shared";
import { parse } from "yaml";

export interface MatchPublisher {
  id: string;
  alternativeId: string | null;
  codeHosting: { url: string; group: boolean }[];
}

export interface MatchSoftware {
  urls: string[];
  publiccodeYml: string;
}

export type MatchResult =
  | { kind: "hosting"; publisherId: string }
  | { kind: "ipa"; publisherId: string }
  | { kind: "ambiguous"; publisherIds: string[] }
  | { kind: "none" };

/** Forma confrontabile di un URL: normalizzato, minuscolo, senza ".git". */
export const urlKey = (url: string) => normalizeUrl(url).toLowerCase().replace(/\.git$/, "");

/** Codice IPA dichiarato nel publiccode.yml, in minuscolo, o null. */
export function declaredIpa(yaml: string): string | null {
  try {
    const doc = parse(yaml) as Record<string, unknown> | null;
    const organisation = doc?.organisation as { uri?: unknown } | undefined;
    if (organisation) {
      const m = typeof organisation.uri === "string" ? organisation.uri.trim().match(/^urn:x-italian-pa:(.+)$/i) : null;
      return m ? m[1]!.toLowerCase() : null;
    }
    const it = (doc?.IT ?? doc?.it) as { riuso?: { codiceIPA?: unknown } } | undefined;
    const code = it?.riuso?.codiceIPA;
    return typeof code === "string" && code ? code.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Prepara gli indici una volta sola e restituisce la funzione di abbinamento. */
export function buildPublisherMatcher(publishers: MatchPublisher[]) {
  const hosting = publishers.flatMap((p) =>
    p.codeHosting.map((ch) => ({ publisherId: p.id, url: urlKey(ch.url), group: ch.group })),
  );
  const byIpa = new Map(
    publishers.filter((p) => p.alternativeId).map((p) => [p.alternativeId!.toLowerCase(), p.id] as const),
  );

  return function match(software: MatchSoftware): MatchResult {
    const urls = software.urls.map(urlKey);

    let bestLen = 0;
    let best = new Set<string>();
    for (const h of hosting) {
      const hit = urls.some((u) => (h.group ? u.startsWith(`${h.url}/`) : u === h.url));
      if (!hit) continue;
      if (h.url.length > bestLen) {
        bestLen = h.url.length;
        best = new Set([h.publisherId]);
      } else if (h.url.length === bestLen) {
        best.add(h.publisherId);
      }
    }
    if (best.size === 1) return { kind: "hosting", publisherId: [...best][0]! };
    if (best.size > 1) return { kind: "ambiguous", publisherIds: [...best] };

    const ipa = declaredIpa(software.publiccodeYml);
    const byCode = ipa ? byIpa.get(ipa) : undefined;
    return byCode ? { kind: "ipa", publisherId: byCode } : { kind: "none" };
  };
}
