import { describe, expect, test } from "bun:test";
import { catalogProblems, repoOf, validatePubliccode } from "./index.ts";

describe("repoOf", () => {
  test.each([
    ["https://raw.githubusercontent.com/italia/foo/main/publiccode.yml", "github.com/italia/foo"],
    ["https://github.com/italia/foo.git", "github.com/italia/foo"],
    ["https://gitlab.com/group/sub/repo/-/raw/main/publiccode.yml", "gitlab.com/group/sub/repo"],
    ["https://gitlab.example.it/group/repo/raw/master/publiccode.yml", "gitlab.example.it/group/repo"],
    ["https://codeberg.org/owner/repo/raw/branch/main/publiccode.yml", "codeberg.org/owner/repo"],
    ["https://bitbucket.org/owner/repo/raw/main/publiccode.yml", "bitbucket.org/owner/repo"],
  ])("%s → %s", (input, expected) => {
    expect(repoOf(input)).toBe(expected);
  });
});

describe("catalogProblems", () => {
  const data = { url: "https://github.com/italia/foo", organisation: { uri: "urn:x-italian-pa:c_h501" } };

  test("url dichiarato e file nello stesso repository", () => {
    const fileRawUrl = "https://raw.githubusercontent.com/italia/foo/main/publiccode.yml";
    expect(catalogProblems(data, { fileRawUrl })).toEqual([]);
  });

  test("url dichiarato in un altro repository", () => {
    const fileRawUrl = "https://raw.githubusercontent.com/italia/bar/main/publiccode.yml";
    expect(catalogProblems(data, { fileRawUrl }).map((p) => p.key)).toEqual(["url"]);
  });

  test("organisation.uri deve corrispondere al publisher", () => {
    const fileRawUrl = "https://raw.githubusercontent.com/italia/foo/main/publiccode.yml";
    const ok = { fileRawUrl, publisherAlternativeId: "c_h501", publishersNamespace: "urn:x-italian-pa:" };
    expect(catalogProblems(data, ok)).toEqual([]);
    expect(catalogProblems(data, { ...ok, publisherAlternativeId: "c_a662" }).map((p) => p.key)).toEqual([
      "organisation.uri",
    ]);
  });

  test("organisation.uri ricavato da IT.riuso.codiceIPA, come il parser Go", () => {
    const fileRawUrl = "https://raw.githubusercontent.com/italia/foo/main/publiccode.yml";
    const ctx = { fileRawUrl, publisherAlternativeId: "c_a662", publishersNamespace: "urn:x-italian-pa:" };
    const legacy = { url: "https://github.com/italia/foo", it: { riuso: { codiceIPA: "c_a662" } } };
    expect(catalogProblems(legacy, ctx)).toEqual([]);
    // se organisation c'è, vince su codiceIPA
    expect(catalogProblems({ ...legacy, organisation: { uri: "x" } }, ctx).map((p) => p.key)).toEqual([
      "organisation.uri",
    ]);
  });

  test("il publisher principale è esente", () => {
    const fileRawUrl = "https://raw.githubusercontent.com/other/repo/main/publiccode.yml";
    expect(catalogProblems(data, { fileRawUrl, isMainPublisher: true })).toEqual([]);
  });
});

describe("validatePubliccode", () => {
  test("YAML illeggibile", () => {
    const r = validatePubliccode("name: [unclosed");
    expect(r.valid).toBe(false);
    expect(r.data).toBeNull();
  });
});
