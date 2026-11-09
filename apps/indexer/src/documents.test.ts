import { describe, expect, test } from "bun:test";
import { absoluteUrl } from "./documents.ts";

describe("absoluteUrl (porting da get-software.js)", () => {
  test.each([
    ["logo.svg", "https://github.com/Ente/Repo.git", "https://raw.githubusercontent.com/ente/repo/HEAD/logo.svg"],
    ["img/s.png", "https://bitbucket.org/ente/repo.git", "https://bitbucket.org/ente/repo/raw/HEAD/img/s.png"],
    ["logo.png", "https://gitlab.example.it/g/sub/repo.git", "https://gitlab.example.it/g/sub/repo/-/raw/HEAD/logo.png"],
    ["https://cdn.example.it/logo.png", "https://github.com/ente/repo", "https://cdn.example.it/logo.png"],
  ])("%s in %s", (url, repo, expected) => {
    expect(absoluteUrl(url, repo)).toBe(expected);
  });

  test("valore assente", () => {
    expect(absoluteUrl(undefined, "https://github.com/ente/repo")).toBeUndefined();
  });
});
