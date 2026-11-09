/**
 * Normalizza un URL come l'API Go (purell FlagsUsuallySafeGreedy | FlagRemoveWWW):
 * schema e host in minuscolo, niente `www.`, niente porta di default, niente `?` vuoto,
 * niente slash finale, segmenti `.`/`..` risolti. Non tocca il suffisso `.git`.
 * Se l'URL non è valido lo restituisce invariato, come la versione Go.
 */
export function normalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw;
  }

  // `URL` mette già in minuscolo schema e host, toglie la porta di default e risolve i dot segment.
  url.hostname = url.hostname.replace(/^www\./, "");

  let out = `${url.protocol}//${url.username ? `${url.username}${url.password ? `:${url.password}` : ""}@` : ""}${url.host}`;
  out += url.pathname.replace(/\/+$/, "");
  if (url.search && url.search !== "?") out += url.search;
  if (url.hash) out += url.hash;
  return out;
}

/**
 * Driver per gli host noti (github.com, gitlab.com, bitbucket.org), come go-vcsurl.
 * Restituisce "" per gli altri host: GitLab, Gitea e Forgejo su domini propri si
 * riconoscono solo con una richiesta di rete, che fa il crawler (`detectDriver`).
 */
export function knownVcsDriver(raw: string): "github" | "gitlab" | "bitbucket" | "" {
  let host: string;
  try {
    host = new URL(raw).host.toLowerCase();
  } catch {
    return "";
  }
  if (host === "github.com" || host === "raw.githubusercontent.com") return "github";
  if (host === "bitbucket.org") return "bitbucket";
  if (host === "gitlab.com") return "gitlab";
  return "";
}
