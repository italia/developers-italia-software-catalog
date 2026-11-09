import { describe, expect, test } from "bun:test";
import { knownVcsDriver, normalizeUrl } from "./url.ts";

describe("normalizeUrl (come purell nell'API Go)", () => {
  test.each([
    ["HTTPS://WWW.GitHub.com/Ente/Repo/", "https://github.com/Ente/Repo"],
    ["https://gitlab.com:443/g/r.git", "https://gitlab.com/g/r.git"],
    ["https://example.it/a/./b/../c?", "https://example.it/a/c"],
    ["https://example.it/x?y=1", "https://example.it/x?y=1"],
    ["non un url", "non un url"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });
});

describe("knownVcsDriver", () => {
  test.each([
    ["https://github.com/ente", "github"],
    ["https://gitlab.com/ente", "gitlab"],
    ["https://bitbucket.org/ente", "bitbucket"],
    ["https://gitlab.comune.it/ente", ""],
  ])("%s → %p", (input, expected) => {
    expect(knownVcsDriver(input)).toBe(expected as never);
  });
});
