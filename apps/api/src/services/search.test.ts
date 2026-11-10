import { describe, expect, test } from "bun:test";
import { buildQuery, declaredIpa, toHit } from "./search.ts";

const base = { page: 1, size: 10 };

describe("ricerca: query OpenSearch", () => {
  test("testo con pertinenza, filtri in OR dentro la stessa lista", () => {
    const q = buildQuery({ ...base, q: "protocollo informatico", scopes: ["government", "local-authorities"], categories: ["document-management"] });
    expect(q.sort).toEqual(["_score"]);
    expect(q.query.bool.must[0]).toMatchObject({ multi_match: { query: "protocollo informatico", minimum_should_match: "2<-25%" } });
    expect(q.query.bool.filter).toContainEqual({ terms: { "publiccode.intendedAudience.scope": ["government", "local-authorities"] } });
    expect(q.query.bool.filter).toContainEqual({ terms: { "publiccode.categories": ["document-management"] } });
  });

  test("senza testo: i più recenti; paginazione", () => {
    const q = buildQuery({ page: 3, size: 20 });
    expect(q.from).toBe(40);
    expect(q.sort).toEqual([{ "publiccode.releaseDate": { order: "desc", missing: "_last" } }]);
  });

  test("a riuso, PNRR e amministrazione", () => {
    const reuse = buildQuery({ ...base, reuse: true, pnrrMeasure: "1.4.1", publisher: "R_PIEMON" });
    const filters = JSON.stringify(reuse.query.bool.filter);
    expect(filters).toContain('"publiccode.organisation.uri":"urn:x-italian-pa:"');
    expect(filters).toContain('"publiccode.description.it.features.keyword":"PNRR/Misura/1.4.1"');
    expect(filters).toContain('"publisher.ipa":"r_piemon"');
    expect(buildQuery({ ...base, reuse: false }).query.bool.must_not).toHaveLength(3);
  });
});

describe("ricerca: risultati", () => {
  test("descrizione in italiano, codice IPA dichiarato, link al catalogo", () => {
    const h = toHit(
      "x",
      {
        slug: "sw1",
        publisher: { name: "Comune di Bari", ipa: "c_a662" },
        publiccode: {
          name: "Pippo",
          releaseDate: "2025-02-01",
          intendedAudience: { scope: ["local-authorities"] },
          description: { en: { shortDescription: "English" }, it: { localisedName: "Pippo IT", shortDescription: "Italiano" } },
          IT: { riuso: { codiceIPA: "C_A662" } },
        },
      },
      3.2,
      "https://catalogo.example/",
    );
    expect(h).toMatchObject({
      id: "sw1", name: "Pippo IT", shortDescription: "Italiano", descriptionLanguage: "it", reuse: true, declaredIpa: "c_a662",
      scopes: ["local-authorities"], catalogUrl: "https://catalogo.example/software/sw1", score: 3.2,
    });
  });

  test("codice IPA da organisation.uri; nessuno per l'open source di terze parti", () => {
    expect(declaredIpa({ organisation: { uri: "urn:x-italian-pa:pcm" } })).toBe("pcm");
    expect(declaredIpa({ organisation: { uri: "https://www.globaleaks.org" } })).toBeNull();
  });
});
