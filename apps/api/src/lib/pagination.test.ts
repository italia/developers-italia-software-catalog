import { describe, expect, test } from "bun:test";
import { decodeCursor, encodeCursor, pageLink, parseSort } from "./pagination.ts";

describe("cursore", () => {
  test("andata e ritorno", () => {
    const c = { createdAt: new Date("2024-05-01T10:00:00.123Z"), id: "abc" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  test("cursore non valido", () => {
    expect(decodeCursor("spazzatura")).toBeUndefined();
  });
});

describe("parseSort", () => {
  const allowed = ["createdAt", "updatedAt"] as const;
  test("discendente", () => expect(parseSort("-createdAt", allowed, "-updatedAt")).toEqual({ field: "createdAt", direction: "desc" }));
  test("campo non ammesso → default", () =>
    expect(parseSort("password", allowed, "-updatedAt")).toEqual({ field: "updatedAt", direction: "desc" }));
});

test("pageLink sostituisce i parametri di pagina e tiene gli altri", () => {
  expect(pageLink("http://x/v2/software?q=a&page%5Bnumber%5D=2", { "page[number]": "3" })).toBe(
    "/v2/software?q=a&page%5Bnumber%5D=3",
  );
});
