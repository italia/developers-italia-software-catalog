import { config } from "../config.ts";
import { getJson } from "../http.ts";
import type { Emit, Publisher, Scanner } from "../types.ts";

// Gitea e Forgejo hanno la stessa API.
interface GtRepo {
  full_name: string;
  private: boolean;
  archived: boolean;
  empty: boolean;
  default_branch: string;
  html_url: string;
  clone_url: string;
}

const headers = (): Record<string, string> => (config.giteaToken ? { Authorization: `token ${config.giteaToken}` } : {});
const LIMIT = 50;

async function emitRepo(repo: GtRepo, foundUrl: string | null, publisher: Publisher, emit: Emit) {
  if (repo.private || repo.archived || repo.empty || !repo.default_branch) return;
  await emit({
    name: repo.full_name,
    url: foundUrl ?? repo.clone_url,
    canonicalUrl: repo.clone_url,
    fileRawUrl: `${repo.html_url.replace(/\.git$/, "")}/raw/branch/${repo.default_branch}/publiccode.yml`,
    branch: repo.default_branch,
    publisher,
  });
}

async function fetchPage(origin: string, owner: string, page: number): Promise<GtRepo[]> {
  if (!owner) {
    const { status, data } = await getJson<{ data: GtRepo[] }>(`${origin}/api/v1/repos/search?limit=${LIMIT}&page=${page}`, {
      headers: headers(),
    });
    if (!data) throw new Error(`GET repos/search: HTTP ${status}`);
    return data.data;
  }
  const q = `limit=${LIMIT}&page=${page}`;
  let res = await getJson<GtRepo[]>(`${origin}/api/v1/orgs/${encodeURIComponent(owner)}/repos?${q}`, { headers: headers() });
  if (res.status === 404) {
    res = await getJson<GtRepo[]>(`${origin}/api/v1/users/${encodeURIComponent(owner)}/repos?${q}`, { headers: headers() });
  }
  if (!res.data) throw new Error(`impossibile elencare i repository di ${owner} (HTTP ${res.status})`);
  return res.data;
}

export const gitea: Scanner = {
  async list(url, publisher, emit) {
    const u = new URL(url);
    const owner = u.pathname.replace(/^\/|\/$/g, "");
    for (let page = 1; ; page++) {
      const repos = await fetchPage(u.origin, owner, page);
      for (const repo of repos) await emitRepo(repo, null, publisher, emit);
      if (repos.length < LIMIT) break;
    }
  },

  async scan(url, publisher, emit) {
    const u = new URL(url);
    const [owner, name] = u.pathname.replace(/^\/|\/$/g, "").replace(/\.git$/, "").split("/", 2);
    if (!owner || !name) throw new Error(`non sembra un repository Gitea/Forgejo: ${url}`);
    const { status, data } = await getJson<GtRepo>(`${u.origin}/api/v1/repos/${owner}/${name}`, { headers: headers() });
    if (!data) throw new Error(`impossibile leggere il repository ${url} (HTTP ${status})`);
    await emitRepo(data, url, publisher, emit);
  },
};
