import { config } from "../config.ts";
import { getJson } from "../http.ts";
import { PubliccodeNotFoundError, type Emit, type Publisher, type Scanner } from "../types.ts";

interface GhRepo {
  full_name: string;
  html_url: string;
  clone_url: string;
  default_branch: string;
  private: boolean;
  archived: boolean;
}

const API = "https://api.github.com";

const headers = (): Record<string, string> => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(config.githubToken && { Authorization: `Bearer ${config.githubToken}` }),
});

/** Cerca publiccode.yml nel repository; emette il repository se c'è. */
async function emitIfPubliccode(repo: GhRepo, foundUrl: string, publisher: Publisher, emit: Emit) {
  if (repo.private || repo.archived) return; // come il Go: niente privati o archiviati

  const { status, data } = await getJson<{ download_url: string | null }>(
    `${API}/repos/${repo.full_name}/contents/publiccode.yml`,
    { headers: headers() },
  );
  if (status === 404) throw new PubliccodeNotFoundError(repo.full_name);
  if (!data?.download_url) throw new Error(`[${repo.full_name}] publiccode.yml non leggibile (HTTP ${status})`);

  await emit({
    name: repo.full_name,
    url: foundUrl,
    canonicalUrl: repo.clone_url,
    fileRawUrl: data.download_url,
    branch: repo.default_branch,
    publisher,
  });
}

export const github: Scanner = {
  async list(url, publisher, emit) {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (parts.length !== 1) throw new Error(`non sembra un'organizzazione GitHub: ${url}`);
    const owner = parts[0]!;

    // Organizzazione, poi utente (compatibilità con la versione Go).
    let kind: "orgs" | "users" = "orgs";
    for (let page = 1; ; page++) {
      let res = await getJson<GhRepo[]>(`${API}/${kind}/${owner}/repos?per_page=100&page=${page}`, { headers: headers() });
      if (res.status === 404 && kind === "orgs" && page === 1) {
        kind = "users";
        res = await getJson<GhRepo[]>(`${API}/users/${owner}/repos?per_page=100&page=${page}`, { headers: headers() });
      }
      if (!res.data) throw new Error(`impossibile elencare i repository di ${url} (HTTP ${res.status})`);

      for (const repo of res.data) {
        try {
          await emitIfPubliccode(repo, repo.html_url, publisher, emit);
        } catch (e) {
          if (!(e instanceof PubliccodeNotFoundError)) console.error(`${repo.html_url}: ${(e as Error).message}`);
        }
      }
      if (res.data.length < 100) break;
    }
  },

  async scan(url, publisher, emit) {
    const parts = new URL(url).pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length !== 2) throw new Error(`non sembra un repository GitHub: ${url}`);

    const { status, data } = await getJson<GhRepo>(`${API}/repos/${parts[0]}/${parts[1]}`, { headers: headers() });
    if (!data) throw new Error(`impossibile leggere il repository ${url} (HTTP ${status})`);
    await emitIfPubliccode(data, url, publisher, emit);
  },
};
