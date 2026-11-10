import { valueLabel, vocabulary } from "publiccode-schema";
import { parse } from "yaml";

// Lettura del publiccode.yml per get_software, e i vocabolari dello standard
// (ambiti e categorie, con le etichette in italiano) da publiccode-schema.

export const SCOPES = vocabulary("intendedAudience.scope").map((v) => v.value) as [string, ...string[]];
export const CATEGORIES = vocabulary("categories").map((v) => v.value) as [string, ...string[]];
export const STATUSES = vocabulary("developmentStatus").map((v) => v.value) as [string, ...string[]];
export const PLATFORMS = vocabulary("platforms").map((v) => v.value) as [string, ...string[]];

export const scopeLabel = (v: string) => valueLabel("intendedAudience.scope", v, "it");
export const categoryLabel = (v: string) => valueLabel("categories", v, "it");

type Data = Record<string, unknown>;
const obj = (v: unknown): Data => (v && typeof v === "object" && !Array.isArray(v) ? (v as Data) : {});
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter((s): s is string => s !== null) : []);
const date = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : str(v));

/** Testo lungo tagliato: le descrizioni possono arrivare a 10.000 caratteri. */
const clip = (s: string | null, max: number) => (s && s.length > max ? `${s.slice(0, max)}…` : s);

export function declaredIpa(pc: Data): string | null {
  const uri = str(obj(pc.organisation).uri);
  if (uri?.startsWith("urn:x-italian-pa:")) return uri.slice("urn:x-italian-pa:".length).toLowerCase();
  return (str(obj(obj(pc.IT).riuso).codiceIPA) ?? str(obj(obj(pc.it).riuso).codiceIPA))?.toLowerCase() ?? null;
}

function description(pc: Data) {
  const all = obj(pc.description);
  const langs = Object.keys(all);
  const pick = ["it", "en"].find((l) => l in all) ?? langs[0];
  const d = pick ? obj(all[pick]) : {};
  return {
    language: pick ?? null,
    availableLanguages: langs,
    localisedName: str(d.localisedName),
    shortDescription: str(d.shortDescription),
    longDescription: clip(str(d.longDescription), 4000),
    features: strs(d.features).slice(0, 30),
    documentation: str(d.documentation),
    apiDocumentation: str(d.apiDocumentation),
  };
}

/** I campi del publiccode.yml utili a valutare il riuso; null se il YAML non è leggibile. */
export function summarizePubliccode(yml: string) {
  let pc: Data;
  try {
    const doc = parse(yml);
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
    pc = doc as Data;
  } catch {
    return null;
  }
  const maintenance = obj(pc.maintenance);
  const legal = obj(pc.legal);
  const dependsOn = obj(pc.dependsOn);
  const deps = (k: string) =>
    (Array.isArray(dependsOn[k]) ? (dependsOn[k] as unknown[]) : []).map((d) => str(obj(d).name)).filter(Boolean);
  const usedBy = strs(pc.usedBy);
  const scopes = strs(obj(pc.intendedAudience).scope);
  const categories = strs(pc.categories);
  const ipa = declaredIpa(pc);
  return {
    name: str(pc.name),
    publiccodeYmlVersion: str(String(pc.publiccodeYmlVersion ?? "")),
    description: description(pc),
    url: str(pc.url),
    landingURL: str(pc.landingURL),
    roadmap: str(pc.roadmap),
    softwareVersion: str(String(pc.softwareVersion ?? "")),
    releaseDate: date(pc.releaseDate),
    developmentStatus: str(pc.developmentStatus),
    softwareType: str(pc.softwareType),
    platforms: strs(pc.platforms),
    scopes: scopes.map((value) => ({ value, label: scopeLabel(value) })),
    categories: categories.map((value) => ({ value, label: categoryLabel(value) })),
    reuse: ipa !== null,
    declaredIpa: ipa,
    organisation: str(obj(pc.organisation).name) ?? str(legal.repoOwner),
    license: str(legal.license),
    mainCopyrightOwner: str(legal.mainCopyrightOwner),
    maintenance: {
      type: str(maintenance.type),
      contractors: (Array.isArray(maintenance.contractors) ? maintenance.contractors : []).map((c) => ({
        name: str(obj(c).name),
        until: date(obj(c).until),
        website: str(obj(c).website),
      })),
      contacts: (Array.isArray(maintenance.contacts) ? maintenance.contacts : []).map((c) => ({
        name: str(obj(c).name),
        email: str(obj(c).email),
        affiliation: str(obj(c).affiliation),
      })),
    },
    localisation: {
      ready: obj(pc.localisation).localisationReady === true,
      languages: strs(obj(pc.localisation).availableLanguages),
    },
    dependsOn: { open: deps("open"), proprietary: deps("proprietary"), hardware: deps("hardware") },
    supports: (Array.isArray(pc.supports) ? pc.supports : []).map((s) => str(obj(s).id)).filter(Boolean),
    usedBy: { count: usedBy.length, first: usedBy.slice(0, 20) },
  };
}
