import { parse } from "yaml";

// Conversione dei vecchi _data/*.yml di developers.italia.it nelle liste editoriali
// (tabelle vocabularies e vocabulary_terms). I file sono in seed/vocabularies/.
// Non sono qui le FAQ (faq.yml), che vanno nel CMS del nuovo sito developers.italia.it, e
// le tipologie di PA (software_pa_types.yml): codici di un campo delle prime bozze dello
// standard, che non esiste più e che nessun publiccode.yml usa.

export interface SeedTerm {
  key: string;
  labelIt: string | null;
  labelEn: string | null;
}

export interface SeedVocabulary {
  id: string;
  name: string;
  description: string;
  file: string;
  terms: (yml: string) => SeedTerm[];
}

// "failsafe": tutti i valori restano stringhe, così la chiave 1.1 non diventa il numero 1.1.
const load = (yml: string): unknown => parse(yml, { schema: "failsafe" });
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const map = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Le voci "Tutte"/"Tutti" erano l'opzione "nessun filtro" dei menu, non valori. */
const ALL = new Set(["Tutte", "Tutti"]);

export const SEED_VOCABULARIES: SeedVocabulary[] = [
  {
    id: "pnrr-measures",
    name: "Misure PNRR",
    description:
      "Filtro \"Misure PNRR\" del catalogo. La chiave è il numero della misura, cercato nei features del publiccode.yml come PNRR/Misura/<chiave>.",
    file: "pnrr_measures.yml",
    terms: (yml) =>
      Object.entries(map(load(yml)))
        .filter(([k]) => !ALL.has(k))
        .map(([key, label]) => ({ key, labelIt: text(label), labelEn: null })),
  },
  {
    id: "pnrr-targets",
    name: "Beneficiari PNRR",
    description:
      "Filtro \"Beneficiari PNRR\" del catalogo. La chiave è cercata nei features del publiccode.yml come PNRR/Beneficiari/<chiave>.",
    file: "pnrr_targets.yml",
    terms: (yml) => {
      const list = load(yml);
      return (Array.isArray(list) ? list : [])
        .map(text)
        .filter((k): k is string => k !== null && !ALL.has(k))
        .map((key) => ({ key, labelIt: key, labelEn: null }));
    },
  },
];
