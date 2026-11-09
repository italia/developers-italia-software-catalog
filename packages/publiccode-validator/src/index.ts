// Validazione dei publiccode.yml per il catalogo.
//
// Le regole dello standard stanno in `publiccode-schema` (publiccode-schema-v0 + formati e
// controlli del parser, vedi Fase 1c di new-plan.md). Qui ci sono solo:
// - la lettura del YAML;
// - le regole del catalogo (ex `validateFile` del crawler Go);
// - il formato dei problemi per i log dell'API e la dashboard.
// I controlli di rete (URL raggiungibili, esistenza del logo…) non sono ancora implementati.
import { validate } from "publiccode-schema/validator";
import { parse } from "yaml";
import { repoOf, sameRepo } from "./repo.ts";

export { repoOf, sameRepo } from "./repo.ts";

export interface Problem {
  key: string;
  message: string;
  level: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  /** Il documento letto dal YAML, se leggibile */
  data: Record<string, unknown> | null;
  problems: Problem[];
}

export interface CatalogContext {
  /** URL raw da cui è stato scaricato il file */
  fileRawUrl: string;
  /** alternativeId del publisher (es. codice IPA), per il controllo di organisation.uri */
  publisherAlternativeId?: string | null;
  /** Prefisso per organisation.uri, es. "urn:x-italian-pa:" */
  publishersNamespace?: string;
  /** Il publisher principale può descrivere repository di altri: niente controlli del catalogo */
  isMainPublisher?: boolean;
}

/** Regole dello standard (senza rete). */
export function validatePubliccode(yaml: string): ValidationResult {
  let doc: unknown;
  try {
    doc = parse(yaml);
  } catch (e) {
    return { valid: false, data: null, problems: [{ key: "", message: `YAML non valido: ${(e as Error).message}`, level: "error" }] };
  }

  const result = validate(doc);
  const problems: Problem[] = [
    ...result.errors.map((e) => ({ key: e.key, message: e.description, level: "error" as const })),
    ...result.warnings.map((w) => ({ key: w.key, message: w.description, level: "warning" as const })),
  ];

  return {
    valid: result.errors.length === 0,
    data: (doc && typeof doc === "object" ? doc : null) as Record<string, unknown> | null,
    problems,
  };
}

/**
 * Regole del catalogo, valide solo se il file rispetta già lo standard:
 * - l'`url` dichiarato deve essere lo stesso repository da cui viene il file;
 * - se il publisher ha un alternativeId, `organisation.uri` deve valere publishersNamespace + alternativeId.
 */
export function catalogProblems(data: Record<string, unknown>, ctx: CatalogContext): Problem[] {
  if (ctx.isMainPublisher) return [];
  const problems: Problem[] = [];

  const declared = typeof data.url === "string" ? data.url : "";
  const actual = repoOf(ctx.fileRawUrl);
  const declaredRepo = repoOf(declared);
  if (actual && declaredRepo && !sameRepo(actual, declaredRepo)) {
    problems.push({
      key: "url",
      level: "error",
      message: `declared url (${declared}) and actual publiccode.yml location URL (${ctx.fileRawUrl}) are not in the same repo: '${declaredRepo}' vs '${actual}'`,
    });
  }

  if (ctx.publisherAlternativeId) {
    const uri = effectiveOrganisationUri(data);
    const expected = `${ctx.publishersNamespace ?? ""}${ctx.publisherAlternativeId}`.trim();
    if (uri.toLowerCase() !== expected.toLowerCase()) {
      problems.push({
        key: "organisation.uri",
        level: "error",
        message: `organisation is '${uri}', but '${expected}' was expected`,
      });
    }
  }

  return problems;
}

/**
 * organisation.uri come lo vede publiccode-parser-go (parser.go): se `organisation` manca,
 * viene ricavato dal campo deprecato IT.riuso.codiceIPA (o it.riuso.codiceIPA) come
 * "urn:x-italian-pa:" + codice.
 */
export function effectiveOrganisationUri(data: Record<string, unknown>): string {
  const organisation = data.organisation as { uri?: unknown } | undefined;
  if (organisation) return typeof organisation.uri === "string" ? organisation.uri.trim() : "";

  const it = (data.IT ?? data.it) as { riuso?: { codiceIPA?: unknown } } | undefined;
  const code = it?.riuso?.codiceIPA;
  return typeof code === "string" && code ? `urn:x-italian-pa:${code}` : "";
}

/** Standard + regole del catalogo. */
export function validateForCatalog(yaml: string, ctx: CatalogContext): ValidationResult {
  const result = validatePubliccode(yaml);
  if (!result.valid || !result.data) return result;

  const extra = catalogProblems(result.data, ctx);
  return {
    ...result,
    valid: !extra.some((p) => p.level === "error"),
    problems: [...result.problems, ...extra],
  };
}
