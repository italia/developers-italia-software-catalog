import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEED_VOCABULARIES } from "./vocabulary-seed.ts";

const seed = (id: string, yml?: string) => {
  const v = SEED_VOCABULARIES.find((x) => x.id === id)!;
  return v.terms(yml ?? readFileSync(join(import.meta.dir, "..", "seed", "vocabularies", v.file), "utf8"));
};

describe("seed delle liste editoriali", () => {
  test("misure PNRR: chiavi come stringhe, senza 'Tutte'", () => {
    const terms = seed("pnrr-measures");
    expect(terms).toHaveLength(14);
    expect(terms[0]).toEqual({ key: "1.1", labelIt: "Infrastrutture digitali", labelEn: null });
    expect(terms.some((t) => t.key === "Tutte")).toBe(false);
    // 1.10 non diventa 1.1
    expect(seed("pnrr-measures", "1.10: Dieci\n1.1: Uno")).toEqual([
      { key: "1.10", labelIt: "Dieci", labelEn: null },
      { key: "1.1", labelIt: "Uno", labelEn: null },
    ]);
  });

  test("beneficiari PNRR: la chiave è l'etichetta, senza 'Tutti'", () => {
    const terms = seed("pnrr-targets");
    expect(terms).toHaveLength(9);
    expect(terms[0]).toEqual({ key: "Comuni", labelIt: "Comuni", labelEn: null });
  });

  test("tipologie di PA: etichette vuote → null", () => {
    const terms = seed("software-pa-types");
    expect(terms).toHaveLength(40);
    expect(terms.find((t) => t.key === "it-ag-turismo")).toEqual({ key: "it-ag-turismo", labelIt: null, labelEn: null });
    expect(terms.find((t) => t.key === "school")?.labelEn).toBe("School");
  });

  test("niente FAQ: vanno nel CMS del nuovo sito", () => {
    expect(SEED_VOCABULARIES.map((v) => v.id)).toEqual(["pnrr-measures", "pnrr-targets", "software-pa-types"]);
  });
});
