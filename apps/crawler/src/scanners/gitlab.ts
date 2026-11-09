import { config } from "../config.ts";
import { getJson } from "../http.ts";
import type { Emit, Publisher, Scanner } from "../types.ts";

interface GlProject {
  path_with_namespace: string;
  web_url: string;
  http_url_to_repo: string;
  default_branch?: string | null;
}

const headers = (): Record<string, string> => (config.gitlabToken ? { "PRIVATE-TOKEN": config.gitlabToken } : {});
const api = (url: URL) => `${url.origin}/api/v4`;

/** Come il Go: niente controllo preventivo del file, il 404 emerge quando si scarica il raw. */
async function emitProject(project: GlProject, foundUrl: string | null, publisher: Publisher, emit: Emit) {
  if (!project.default_branch) return;
  await emit({
    name: project.path_with_namespace,
    url: foundUrl ?? project.http_url_to_repo,
    canonicalUrl: project.http_url_to_repo,
    fileRawUrl: `${project.web_url.replace(/\/$/, "")}/raw/${project.default_branch}/publiccode.yml`,
    branch: project.default_branch,
    publisher,
  });
}

/** Tutte le pagine di un endpoint GitLab (header x-next-page). */
async function* pages<T>(firstUrl: string): AsyncGenerator<T> {
  let url: string | null = firstUrl;
  while (url) {
    const page: { status: number; data: T[] | null; res: Response } = await getJson<T[]>(url, { headers: headers() });
    if (!page.data) throw new Error(`GET ${url}: HTTP ${page.status}`);
    yield* page.data;
    const next: string | null = page.res.headers.get("x-next-page");
    url = next ? `${firstUrl.split("&page=")[0]}&page=${next}` : null;
  }
}

async function emitGroup(base: string, groupId: number, publisher: Publisher, emit: Emit) {
  // include_subgroups invece della ricorsione sui descendant_groups del Go, che elencava
  // più volte gli stessi progetti.
  for await (const project of pages<GlProject>(`${base}/groups/${groupId}/projects?per_page=100&include_subgroups=true&page=1`)) {
    await emitProject(project, null, publisher, emit);
  }
}

export const gitlab: Scanner = {
  async list(url, publisher, emit) {
    const u = new URL(url);
    const base = api(u);
    const groupPath = u.pathname.replace(/^\/|\/$/g, "");

    if (u.host === "gitlab.com" || groupPath) {
      const { status, data } = await getJson<{ id: number }>(`${base}/groups/${encodeURIComponent(groupPath)}`, {
        headers: headers(),
      });
      if (!data) throw new Error(`gruppo GitLab '${groupPath}' non trovato (HTTP ${status})`);
      await emitGroup(base, data.id, publisher, emit);
      return;
    }

    // Istanza intera: tutti i gruppi di primo livello.
    for await (const group of pages<{ id: number }>(`${base}/groups?per_page=100&top_level_only=true&page=1`)) {
      await emitGroup(base, group.id, publisher, emit);
    }
  },

  async scan(url, publisher, emit) {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/|\/$/g, "").replace(/\.git$/, "");
    const { status, data } = await getJson<GlProject>(`${api(u)}/projects/${encodeURIComponent(path)}`, {
      headers: headers(),
    });
    if (!data) throw new Error(`progetto GitLab '${path}' non trovato (HTTP ${status})`);
    await emitProject(data, url, publisher, emit);
  },
};
