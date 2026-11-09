import { describe, expect, test } from "bun:test";
import { buildPublisherMatcher, declaredIpa } from "./publisher-match.ts";

const publishers = [
  { id: "bari", alternativeId: "c_a662", codeHosting: [{ url: "https://github.com/comunedibari", group: true }] },
  // org intera e, più specifico, un singolo repository della stessa org affidato a un altro ente
  { id: "regione", alternativeId: "r_puglia", codeHosting: [{ url: "https://github.com/Puglia", group: true }] },
  { id: "asl", alternativeId: "asl_ba", codeHosting: [{ url: "https://github.com/Puglia/sanita.git", group: false }] },
  // due enti che dichiarano la stessa org
  { id: "a", alternativeId: null, codeHosting: [{ url: "https://gitlab.com/condivisa", group: true }] },
  { id: "b", alternativeId: null, codeHosting: [{ url: "https://gitlab.com/condivisa/", group: true }] },
];
const match = buildPublisherMatcher(publishers);
const yaml = (extra = "") => `publiccodeYmlVersion: "0"\nname: x\n${extra}`;

describe("buildPublisherMatcher", () => {
  test("org del code hosting, anche con URL di clone e maiuscole diverse", () => {
    expect(match({ urls: ["https://GitHub.com/ComuneDiBari/SIT.git"], publiccodeYml: yaml() })).toEqual({
      kind: "hosting",
      publisherId: "bari",
    });
  });

  test("vince il code hosting più specifico (singolo repository sull'org)", () => {
    expect(match({ urls: ["https://github.com/Puglia/sanita"], publiccodeYml: yaml() })).toEqual({
      kind: "hosting",
      publisherId: "asl",
    });
    expect(match({ urls: ["https://github.com/Puglia/altro"], publiccodeYml: yaml() })).toEqual({
      kind: "hosting",
      publisherId: "regione",
    });
  });

  test("un alias basta (repository rinominato)", () => {
    expect(
      match({ urls: ["https://github.com/nuovo/nome", "https://github.com/comunedibari/vecchio"], publiccodeYml: yaml() }),
    ).toEqual({ kind: "hosting", publisherId: "bari" });
  });

  test("stessa org per due enti: ambiguo", () => {
    expect(match({ urls: ["https://gitlab.com/condivisa/repo"], publiccodeYml: yaml() })).toEqual({
      kind: "ambiguous",
      publisherIds: ["a", "b"],
    });
  });

  test("senza code hosting: codice IPA del publiccode.yml", () => {
    const viaUri = yaml("organisation:\n  uri: urn:x-italian-pa:C_A662\n");
    expect(match({ urls: ["https://example.org/x/y"], publiccodeYml: viaUri })).toEqual({ kind: "ipa", publisherId: "bari" });
    const legacy = yaml("it:\n  riuso:\n    codiceIPA: r_puglia\n");
    expect(match({ urls: ["https://example.org/x/y"], publiccodeYml: legacy })).toEqual({ kind: "ipa", publisherId: "regione" });
  });

  test("nessun riscontro", () => {
    expect(match({ urls: ["https://example.org/x/y"], publiccodeYml: yaml() })).toEqual({ kind: "none" });
  });
});

describe("declaredIpa", () => {
  test("organisation vince su IT.riuso.codiceIPA, come il parser Go", () => {
    expect(declaredIpa(yaml("organisation:\n  uri: https://ente.it\nIT:\n  riuso:\n    codiceIPA: c_a662\n"))).toBeNull();
  });
  test("YAML illeggibile", () => {
    expect(declaredIpa("name: [")).toBeNull();
  });
});
