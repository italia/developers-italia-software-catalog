import path from "node:path";
import type { PublisherDto, SoftwareDto } from "@sw-catalog/shared";
import { parse } from "yaml";

// Documenti dell'indice, nella stessa forma prodotta da scripts/get-software.js e
// scripts/get-publishers.js di developers.italia.it, più i campi nuovi (vitalityScore,
// aliases, name).

type Publiccode = Record<string, unknown> & {
  logo?: string;
  description?: Record<string, { screenshots?: string[] } & Record<string, unknown>>;
};

const normalizeRepoUrl = (url: string) => url.toLowerCase().replace(/\.git$/, "");

/** Rende assoluti logo e screenshot relativi al repository (porting di absoluteUrl). */
export function absoluteUrl(url: string | undefined, repo: string): string | undefined {
  if (!url || /^https?:\/\//i.test(url)) return url;

  const repoUrl = new URL(normalizeRepoUrl(repo));
  switch (repoUrl.host) {
    case "github.com":
      return `https://raw.githubusercontent.com${path.posix.join(repoUrl.pathname, "HEAD", url)}`;
    case "bitbucket.org":
      return `https://bitbucket.org${path.posix.join(repoUrl.pathname, "raw/HEAD", url)}`;
    default: // GitLab
      return `${repoUrl.protocol}//${repoUrl.hostname}${path.posix.join(repoUrl.pathname, "-/raw/HEAD", url)}`;
  }
}

export interface SoftwareDoc {
  slug: string;
  crawltime: string;
  publiccode: Publiccode;
  type: "software";
  name: string | null;
  aliases: string[];
  /** Publisher del software (novità v2): per le pagine PA e i filtri per amministrazione */
  publisherId: string | null;
  publisher: { name: string; ipa: string | null } | null;
  vitalityScore?: number;
}

/** null se il publiccode.yml non è leggibile come oggetto YAML. */
export function softwareDoc(s: SoftwareDto): SoftwareDoc | null {
  let publiccode: Publiccode;
  try {
    const doc = parse(s.publiccodeYml);
    if (!doc || typeof doc !== "object") return null;
    publiccode = doc as Publiccode;
  } catch {
    return null;
  }

  publiccode.logo = absoluteUrl(publiccode.logo, s.url);
  for (const desc of Object.values(publiccode.description ?? {})) {
    if (Array.isArray(desc?.screenshots)) {
      desc.screenshots = desc.screenshots.map((ss) => absoluteUrl(ss, s.url) ?? ss);
    }
  }

  const vitality = s.vitality !== null ? Number(s.vitality) : Number.NaN;
  return {
    slug: s.id,
    crawltime: s.updatedAt,
    publiccode,
    type: "software",
    name: s.name,
    aliases: [s.url, ...s.aliases],
    publisherId: s.publisherId,
    publisher: s.publisher ? { name: s.publisher.description, ipa: s.publisher.alternativeId } : null,
    ...(Number.isFinite(vitality) && { vitalityScore: vitality }),
  };
}

export function administrationDoc(p: PublisherDto) {
  return {
    "it-riuso-codiceIPA-label": p.description,
    "it-riuso-codiceIPA": p.alternativeId,
    type: "administration" as const,
  };
}
