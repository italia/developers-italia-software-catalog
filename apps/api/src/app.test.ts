import { describe, expect, test } from "bun:test";
import { app } from "./app";

describe("GET /v2/status", () => {
  test("risponde 200 con la versione", async () => {
    const res = await app.request("/v2/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", version: "2" });
  });
});

describe("GET /v1/status (compatibilità)", () => {
  test("risponde 204 come l'API Go", async () => {
    const res = await app.request("/v1/status");
    expect(res.status).toBe(204);
  });
});
