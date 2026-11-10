import { describe, expect, test } from "bun:test";
import type { JobRun } from "@sw-catalog/db";
import { formatDuration, indexTimestamp, JOBS, jobCheck, worst } from "./health.ts";
import { periodLabel, publiccodeFacts, toMatrix } from "./stats.ts";

const HOUR = 3_600_000;
const run = (over: Partial<JobRun>): JobRun => ({
  id: "r1",
  job: "crawler",
  status: "SUCCEEDED",
  trigger: "nightly",
  startedAt: new Date(Date.now() - 2 * HOUR),
  finishedAt: new Date(Date.now() - HOUR),
  stats: null,
  error: null,
  ...over,
});

describe("publiccodeFacts", () => {
  test("legge i campi usati dal cruscotto e normalizza", () => {
    const f = publiccodeFacts(`
publiccodeYmlVersion: "0.2.0"
name: Prova
developmentStatus: Stable
softwareType: standalone/web
releaseDate: 2024-05-01
platforms: [Web, linux, web]
categories: [data-collection]
legal: { license: EUPL-1.2 }
maintenance: { type: internal }
intendedAudience: { scope: [government] }
`);
    expect(f).toMatchObject({
      name: "Prova",
      version: "0.2",
      developmentStatus: "stable",
      license: "EUPL-1.2",
      maintenance: "internal",
      categories: ["data-collection"],
      scope: ["government"],
      releaseDate: "2024-05-01",
    });
    expect(f?.platforms).toEqual(["web", "linux", "web"]);
  });

  test("versione numerica e YAML illeggibile", () => {
    expect(publiccodeFacts("publiccodeYmlVersion: 0.4\nname: x")?.version).toBe("0.4");
    expect(publiccodeFacts("name: [aperta")).toBeNull();
    expect(publiccodeFacts("- solo\n- lista")).toBeNull();
  });
});

describe("toMatrix", () => {
  const counts = new Map([
    ["a", 5],
    ["b", 9],
    ["c", 1],
    ["d", 1],
  ]);
  test("ordina, raccoglie il resto in 'altro' e traduce le etichette", () => {
    expect(toMatrix(counts, ["K", "N"], 2, { b: "bi" })).toEqual([["K", "N"], ["bi", 9], ["a", 5], ["altro", 2]]);
  });
  test("senza 'altro' per i campi con più valori", () => {
    expect(toMatrix(counts, ["K", "N"], 2, undefined, false)).toEqual([["K", "N"], ["b", 9], ["a", 5]]);
  });
});

test("etichette dei periodi in italiano", () => {
  const p = new Date(Date.UTC(2026, 10, 9));
  expect(periodLabel(p, "month")).toBe("nov 2026");
  expect(periodLabel(p, "year")).toBe("2026");
  expect(periodLabel(p, "week")).toBe("9 nov 26");
});

describe("stato degli strumenti", () => {
  test("data dell'indice dal nome", () => {
    expect(indexTimestamp("developers_italia_it_catalog-20261109163210")?.toISOString()).toBe("2026-11-09T16:32:10.000Z");
    expect(indexTimestamp("developers_italia_it")).toBeNull();
  });

  test("il peggiore, con unknown come warn", () => {
    expect(worst(["ok", "ok"])).toBe("ok");
    expect(worst(["ok", "unknown"])).toBe("warn");
    expect(worst(["warn", "error", "unknown"])).toBe("error");
  });

  test("durate leggibili", () => {
    expect(formatDuration(42_000)).toBe("42 s");
    expect(formatDuration(125_000)).toBe("2 min 5 s");
    expect(formatDuration(3 * HOUR + 60_000)).toBe("3 h 1 min");
  });

  test("job: nessuna esecuzione, riuscita, in ritardo, fallita", () => {
    expect(jobCheck(JOBS.crawler, null, null).level).toBe("unknown");
    expect(jobCheck(JOBS.crawler, run({}), null).level).toBe("ok");
    const old = run({ startedAt: new Date(Date.now() - 50 * HOUR), finishedAt: new Date(Date.now() - 49 * HOUR) });
    expect(jobCheck(JOBS.crawler, old, old).level).toBe("warn");
    const failed = run({ id: "r2", status: "FAILED", error: "rete" });
    const r = jobCheck(JOBS.crawler, failed, run({}));
    expect(r.level).toBe("error");
    expect(r.summary).toContain("rete");
    expect(r.details.some((d) => d.label === "Ultima riuscita")).toBe(true);
  });

  test("job: in corso o interrotto, avvisi dai contatori", () => {
    const running = run({ status: "RUNNING", finishedAt: null, startedAt: new Date(Date.now() - HOUR) });
    expect(jobCheck(JOBS.crawler, running, null).level).toBe("ok");
    const stuck = run({ status: "RUNNING", finishedAt: null, startedAt: new Date(Date.now() - 20 * HOUR) });
    expect(jobCheck(JOBS.crawler, stuck, null).level).toBe("error");
    const partial = run({ stats: { processed: 10, fetchFailed: 3 } });
    const r = jobCheck(JOBS.crawler, partial, partial);
    expect(r.level).toBe("warn");
    expect(r.details.map((d) => d.label).slice(2)).toEqual(["Repository elaborati", "File non scaricabili"]);
  });
});
