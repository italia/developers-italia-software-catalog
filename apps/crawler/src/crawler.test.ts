// Regole di aggiornamento del crawler (porting di ProcessRepo/upsertSoftware del Go).
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SoftwareDto } from "@sw-catalog/shared";

const calls: { method: string; args: unknown[] }[] = [];
let existing: SoftwareDto | null = null;

mock.module("./api.ts", () => ({
  api: {
    softwareByUrl: async () => existing,
    createSoftware: async (body: unknown) => {
      calls.push({ method: "create", args: [body] });
      return { ...sw(), id: "new" };
    },
    updateSoftware: async (id: string, body: unknown) => {
      calls.push({ method: "update", args: [id, body] });
      return sw();
    },
    softwareLog: async () => calls.push({ method: "softwareLog", args: [] }),
    log: async () => calls.push({ method: "log", args: [] }),
  },
}));

const { Crawler } = await import("./crawler.ts");

const VALID = `publiccodeYmlVersion: "0"
name: Prova
url: https://github.com/ente/prova
platforms: [web]
developmentStatus: stable
softwareType: standalone/web
organisation:
  uri: urn:x-italian-pa:c_h501
description:
  it:
    shortDescription: Software di prova per i test del crawler
    longDescription: >
      Descrizione lunga del software di prova, abbastanza lunga da superare il minimo di
      centocinquanta caratteri richiesto dallo standard publiccode.yml per questo campo.
    features: [Una funzionalità]
legal:
  license: AGPL-3.0-or-later
maintenance:
  type: none
localisation:
  localisationReady: true
  availableLanguages: [it]
`;
const INVALID = VALID.replace("license: AGPL-3.0-or-later", "license: non-una-licenza");
const UNREADABLE = "name: [non chiuso";

function sw(over: Partial<SoftwareDto> = {}): SoftwareDto {
  return {
    id: "sw1",
    url: "https://github.com/ente/prova.git",
    aliases: ["https://github.com/ente/prova"],
    name: "Prova",
    publiccodeYml: VALID,
    active: true,
    vitality: null,
    publisherId: null,
    publisher: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...over,
  };
}

const repo = {
  name: "ente/prova",
  url: "https://github.com/ente/prova",
  canonicalUrl: "https://github.com/ente/prova.git",
  fileRawUrl: "https://raw.githubusercontent.com/ente/prova/main/publiccode.yml",
  branch: "main",
  publisher: { id: "p1", kind: "publisher" as const, alternativeId: "c_h501", name: "Comune", sources: [] },
};

const realFetch = globalThis.fetch;
function serve(body: string, status = 200) {
  globalThis.fetch = (async () => new Response(body, { status })) as unknown as typeof fetch;
}

const quiet = mock(() => {});
beforeEach(() => {
  calls.length = 0;
  existing = null;
  console.log = quiet;
  console.warn = quiet;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const writes = () => calls.filter((c) => c.method === "create" || c.method === "update");

describe("Crawler.processRepo", () => {
  test("software nuovo con file valido: creato attivo, con il vecchio URL come alias", async () => {
    serve(VALID);
    await new Crawler().processRepo(repo);
    expect(writes()).toEqual([
      {
        method: "create",
        args: [{ url: repo.canonicalUrl, aliases: [repo.url], publiccodeYml: VALID, active: true, publisherId: "p1" }],
      },
    ]);
  });

  test("software nuovo con file non valido: creato inattivo", async () => {
    serve(INVALID);
    await new Crawler().processRepo(repo);
    expect((writes()[0]?.args[0] as { active: boolean }).active).toBe(false);
  });

  test("software attivo con file non valido: aggiornato ma resta attivo", async () => {
    existing = sw({ active: true });
    serve(INVALID);
    await new Crawler().processRepo(repo);
    expect(writes()).toHaveLength(1);
    expect((writes()[0]!.args[1] as { active: boolean }).active).toBe(true);
  });

  test("software creato inattivo (created_at = updated_at) con file ora valido: riattivato", async () => {
    existing = sw({ active: false });
    serve(VALID);
    await new Crawler().processRepo(repo);
    expect((writes()[0]!.args[1] as { active: boolean }).active).toBe(true);
  });

  test("software creato inattivo con file ancora non valido: non toccato", async () => {
    existing = sw({ active: false });
    serve(INVALID);
    await new Crawler().processRepo(repo);
    expect(writes()).toEqual([]);
  });

  test("software disattivato a mano (created_at ≠ updated_at): non toccato", async () => {
    existing = sw({ active: false, updatedAt: "2025-06-01T00:00:00.000Z" });
    serve(VALID);
    const crawler = new Crawler();
    await crawler.processRepo(repo);
    expect(writes()).toEqual([]);
    expect(crawler.stats.skipped).toBe(1);
  });

  test("YAML illeggibile su software esistente: il publiccode.yml salvato non viene sostituito", async () => {
    existing = sw();
    serve(UNREADABLE);
    await new Crawler().processRepo(repo);
    expect(writes()).toEqual([]);
  });

  test("file assente (404): nessuna scrittura, contato come non trovato", async () => {
    serve("not found", 404);
    const crawler = new Crawler();
    await crawler.processRepo(repo);
    expect(writes()).toEqual([]);
    expect(crawler.stats.notFound).toBe(1);
  });

  test("publisher_id: impostato se il software non ce l'ha", async () => {
    existing = sw({ publisherId: null });
    serve(VALID);
    await new Crawler().processRepo(repo);
    expect((writes()[0]!.args[1] as { publisherId?: string }).publisherId).toBe("p1");
  });

  test("publisher_id: un valore diverso già impostato non viene sovrascritto", async () => {
    existing = sw({ publisherId: "altro" });
    serve(VALID);
    await new Crawler().processRepo(repo);
    expect((writes()[0]!.args[1] as { publisherId?: string }).publisherId).toBeUndefined();
  });

  test("flusso a cataloghi: nessun publisher_id", async () => {
    serve(VALID);
    await new Crawler().processRepo({ ...repo, publisher: { ...repo.publisher, kind: "catalog" } });
    expect((writes()[0]!.args[0] as { publisherId?: string }).publisherId).toBeUndefined();
  });

  test("--dry-run: nessuna scrittura né log", async () => {
    serve(VALID);
    await new Crawler(true).processRepo(repo);
    expect(calls).toEqual([]);
  });
});
