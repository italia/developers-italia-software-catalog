import { fetchWithRetry, getJson } from "../http.ts";
import type { Emit, Publisher, Scanner } from "../types.ts";

interface BbRepo {
  slug: string;
  full_name: string;
  is_private: boolean;
  mainbranch?: { name: string } | null;
}

const API = "https://api.bitbucket.org/2.0";

/** GET e non HEAD: l'endpoint `src` di Bitbucket non risponde alle HEAD. */
async function hasPubliccode(owner: string, slug: string, ref: string): Promise<boolean> {
  const res = await fetchWithRetry(`${API}/repositories/${owner}/${slug}/src/${encodeURIComponent(ref)}/publiccode.yml`);
  await res.body?.cancel();
  return res.ok;
}

async function emitRepo(owner: string, repo: BbRepo, foundUrl: string | null, publisher: Publisher, emit: Emit) {
  const branch = repo.mainbranch?.name;
  if (repo.is_private || !branch) return;
  if (!(await hasPubliccode(owner, repo.slug, branch))) return;

  const canonicalUrl = `https://bitbucket.org/${owner}/${repo.slug}.git`;
  await emit({
    name: repo.full_name,
    url: foundUrl ?? canonicalUrl,
    canonicalUrl,
    fileRawUrl: `https://bitbucket.org/${owner}/${repo.slug}/raw/${branch}/publiccode.yml`,
    branch,
    publisher,
  });
}

export const bitbucket: Scanner = {
  async list(url, publisher, emit) {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (parts.length !== 1) throw new Error(`non sembra un account Bitbucket: ${url}`);
    const owner = parts[0]!;

    let next: string | null = `${API}/repositories/${owner}?pagelen=100`;
    while (next) {
      const { status, data }: { status: number; data: { values: BbRepo[]; next?: string } | null } = await getJson(next);
      if (!data) throw new Error(`impossibile elencare i repository di ${url} (HTTP ${status})`);
      for (const repo of data.values) await emitRepo(owner, repo, null, publisher, emit);
      next = data.next ?? null;
    }
  },

  async scan(url, publisher, emit) {
    const parts = new URL(url).pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length !== 2) throw new Error(`non sembra un repository Bitbucket: ${url}`);
    const { status, data } = await getJson<BbRepo>(`${API}/repositories/${parts[0]}/${parts[1]}`);
    if (!data) throw new Error(`impossibile leggere il repository ${url} (HTTP ${status})`);
    await emitRepo(parts[0]!, data, url, publisher, emit);
  },
};
