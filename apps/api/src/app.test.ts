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

describe("autorizzazioni (senza database)", () => {
  test("le scritture senza sessione né token rispondono 401", async () => {
    for (const [method, path] of [
      ["DELETE", "/v2/software/x"],
      ["DELETE", "/v2/publishers/x"],
      ["POST", "/v2/software/third-party"],
    ] as const) {
      const res = await app.request(path, { method, headers: { "Content-Type": "application/json" }, body: "{}" });
      expect(res.status).toBe(401);
    }
  });

  test("un token sconosciuto viene rifiutato", async () => {
    process.env.API_TOKENS = "segreto";
    const res = await app.request("/v2/publishers/x", { method: "DELETE", headers: { Authorization: "Bearer altro" } });
    expect(res.status).toBe(401);
    delete process.env.API_TOKENS;
  });

  test("cruscotto ed esecuzioni dei job sono riservati", async () => {
    for (const path of ["/v2/stats", "/v2/health", "/v2/job-runs"]) expect((await app.request(path)).status).toBe(401);
    const post = await app.request("/v2/job-runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"job":"crawler"}' });
    expect(post.status).toBe(401);
    const patch = await app.request("/v2/job-runs/x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: '{"status":"SUCCEEDED"}' });
    expect(patch.status).toBe(401);
  });

  test("le liste delle richieste sono riservate", async () => {
    expect((await app.request("/v2/onboarding-requests")).status).toBe(401);
    expect((await app.request("/v2/third-party-requests")).status).toBe(401);
  });

  test("/v2/auth/me senza cookie restituisce user null", async () => {
    expect(await (await app.request("/v2/auth/me")).json()).toEqual({ user: null });
  });
});
