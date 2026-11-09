// Ricava l'URL del repository da un URL qualsiasi al suo interno (pagina, file raw, clone),
// come vcsurl.GetRepo del crawler Go. Restituisce `host/owner/repo` senza schema, o null.
export function repoOf(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.host.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "raw.githubusercontent.com" || host === "github.com" || host === "bitbucket.org") {
    if (parts.length < 2) return null;
    const repoHost = host === "raw.githubusercontent.com" ? "github.com" : host;
    return `${repoHost}/${parts[0]}/${stripGit(parts[1]!)}`;
  }

  // GitLab (/group/sub/repo/-/raw/…, /group/repo/raw/…) e Gitea/Forgejo (/owner/repo/raw/branch/…):
  // il repository è tutto ciò che precede "-" o "raw".
  const stop = parts.findIndex((p) => p === "-" || p === "raw" || p === "blob" || p === "tree");
  const repoParts = stop === -1 ? parts : parts.slice(0, stop);
  if (repoParts.length < 2) return null;
  const last = repoParts.length - 1;
  repoParts[last] = stripGit(repoParts[last]!);
  return `${host}/${repoParts.join("/")}`;
}

const stripGit = (s: string) => s.replace(/\.git$/i, "");

export const sameRepo = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
