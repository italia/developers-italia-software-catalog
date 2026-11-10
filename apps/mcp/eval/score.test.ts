import { expect, test } from "bun:test";
import { score } from "./run.ts";

const c = {
  id: "x", request: "", search: {}, k: 3, minHits: 1,
  expected: [{ name: "PiTre", ipa: "p_tn" }, { name: "Città Facile", ipa: null }],
};
const hit = (name: string, ipa: string | null = null) => ({ name, administration: { ipa } });

test("punteggio: nome senza accenti e maiuscole, IPA se indicato, solo i primi k", () => {
  const r = score(c, [hit("Altro"), hit("pitre", "p_tn"), hit("Citta facile", "csi_piem"), hit("Oltre k")]);
  expect(r).toMatchObject({ passed: true, hits: 2, recall: 1, reciprocalRank: 0.5, missing: [] });
  // IPA diverso: non è lo stesso software
  expect(score(c, [hit("PiTre", "altro")]).hits).toBe(0);
  expect(score({ ...c, k: 1 }, [hit("Altro"), hit("PiTre", "p_tn")]).passed).toBe(false);
});
