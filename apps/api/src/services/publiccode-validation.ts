import type {
  PubliccodeDeprecationDto,
  PubliccodeUpgradeDto,
  PubliccodeValidationDto,
  PubliccodeVersionOptionDto,
} from "@sw-catalog/shared";
import {
  countries,
  DEPRECATION_SINCE_KEY,
  deprecationKeys,
  type Finding,
  isSupportedByParser,
  LATEST_KNOWN,
  LATEST_SUPPORTED,
  locales,
  PARSER_LATEST,
  SCHEMA_VERSIONS,
  upgrade,
} from "publiccode-schema";
import { validateVersion } from "publiccode-schema/validator";
import { parse, stringify } from "yaml";
import { HttpError } from "../lib/problem.ts";

// Validazione di un publiccode.yml contro una versione dello standard e aggiornamento
// all'ultima versione, per la scheda del software in dashboard (publiccode-schema 0.2).

const IT = locales("it");

function lookup(bundle: unknown, key: string): string | undefined {
  const v = key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), bundle);
  return typeof v === "string" ? v : undefined;
}
const interpolate = (s: string, params: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => params[k] ?? "");

/** Messaggio della deprecazione in italiano, con la versione che l'ha introdotta. */
export function deprecationMessage(f: Finding): string {
  const template = deprecationKeys(f).map((k) => lookup(IT, k)).find(Boolean);
  const message = template ? interpolate(template, f.params ?? {}) : f.message;
  const since = lookup(IT, DEPRECATION_SINCE_KEY);
  return since ? interpolate(since, { message, since: f.since }) : message;
}

const toDeprecation = (f: Finding): PubliccodeDeprecationDto => ({
  id: f.id,
  key: f.key,
  since: f.since,
  message: deprecationMessage(f),
  fixable: f.fixable,
  lossy: f.lossy,
});

const issue = (e: { key: string; description: string }) => ({ key: e.key, description: e.description });

const VERSIONS: PubliccodeVersionOptionDto[] = [...SCHEMA_VERSIONS].reverse().map((version) => ({
  version,
  supportedByParser: isSupportedByParser(version),
}));

export const isSchemaVersion = (v: string) => (SCHEMA_VERSIONS as readonly string[]).includes(v);

function load(yml: string): { data: unknown } | { error: string } {
  try {
    const data = parse(yml);
    if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "il file non è un oggetto YAML" };
    return { data };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function validatePubliccode(
  yml: string,
  options: { version?: string; strict?: boolean },
): Promise<PubliccodeValidationDto> {
  const loaded = load(yml);
  const base = { versions: VERSIONS, latestSupported: LATEST_SUPPORTED, parserLatest: PARSER_LATEST };
  if ("error" in loaded) {
    return {
      ...base,
      readable: false,
      declaredVersion: null,
      checkedVersion: options.version ?? LATEST_SUPPORTED,
      schema: "v0",
      strict: options.strict ?? false,
      valid: false,
      errors: [{ key: "", description: `YAML illeggibile: ${loaded.error}` }],
      warnings: [],
      deprecations: [],
    };
  }
  const r = await validateVersion(loaded.data, { version: options.version, strict: options.strict, countries });
  return {
    ...base,
    readable: true,
    declaredVersion: r.declaredVersion,
    checkedVersion: r.checkedVersion,
    schema: r.schema,
    strict: r.strict,
    valid: r.valid,
    errors: r.errors.map(issue),
    warnings: r.warnings.map(issue),
    deprecations: r.deprecations.map(toDeprecation),
  };
}

/** Il file aggiornato a `to` (default: l'ultima versione dello standard, 0.8.0), in YAML. */
export async function upgradePubliccode(yml: string, to: string = LATEST_SUPPORTED): Promise<PubliccodeUpgradeDto> {
  if (!isSchemaVersion(to)) throw new HttpError(422, "Unprocessable Entity", `Versione sconosciuta: ${to} (ultima: ${LATEST_KNOWN})`);
  const loaded = load(yml);
  if ("error" in loaded) throw new HttpError(422, "Unprocessable Entity", `YAML illeggibile: ${loaded.error}`);
  const declared = (loaded.data as { publiccodeYmlVersion?: unknown }).publiccodeYmlVersion;
  const u = upgrade(loaded.data, { to, countries });
  const after = await validateVersion(u.data, { version: to, strict: true, countries });
  return {
    from: typeof declared === "string" ? declared : null,
    to,
    // yaml-1.1: virgolette ai valori che un decoder YAML 1.1 (come quello del parser Go)
    // leggerebbe come date o booleani (releaseDate: "2026-04-20", "yes"); liste allineate
    // alla chiave, come nella maggior parte dei publiccode.yml.
    yaml: stringify(u.data, { lineWidth: 0, indentSeq: false, schema: "yaml-1.1" }),
    applied: u.applied.map(toDeprecation),
    remaining: u.remaining.map(toDeprecation),
    validation: { valid: after.valid, errors: after.errors.map(issue), warnings: after.warnings.map(issue) },
  };
}
