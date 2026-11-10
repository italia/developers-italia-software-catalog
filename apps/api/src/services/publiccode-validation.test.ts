import { describe, expect, test } from "bun:test";
import { parse } from "yaml";
import { upgradePubliccode, validatePubliccode } from "./publiccode-validation.ts";

const old = `
publiccodeYmlVersion: "0.2"
name: Medusa
url: https://github.com/italia/developers.italia.it.git
releaseDate: "2024-01-01"
platforms: [web]
categories: [document-management]
developmentStatus: stable
softwareType: standalone/web
organisation:
  uri: urn:x-italian-pa:pcm
description:
  it:
    genericName: Gestionale
    shortDescription: Un software di esempio per i test del validatore
    longDescription: >
      Descrizione lunga del software di esempio, abbastanza lunga da superare il minimo di
      centocinquanta caratteri richiesto dallo standard publiccode.yml per questo campo.
    features: [Una funzionalità]
legal:
  license: AGPL-3.0-or-later
  repoOwner: Presidenza del Consiglio dei Ministri
maintenance:
  type: none
localisation:
  localisationReady: true
  availableLanguages: [it]
`;

describe("validazione per versione", () => {
  test("regole del parser e versioni selezionabili", async () => {
    const r = await validatePubliccode(old, {});
    expect(r).toMatchObject({ readable: true, valid: true, schema: "v0", declaredVersion: "0.2", checkedVersion: "0.2.0" });
    expect(r.versions[0]).toEqual({ version: "0.8.0", supportedByParser: false });
    expect(r).toMatchObject({ latestSupported: "0.8.0", parserLatest: "0.7.0" });
    expect(r.versions.find((v) => v.version === "0.7.0")?.supportedByParser).toBe(true);
  });

  test("strict sulla versione dichiarata: organisation non esiste nella 0.2", async () => {
    const r = await validatePubliccode(old, { strict: true });
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.key)).toEqual(["organisation"]);
  });

  test("deprecazioni in italiano, con la versione", async () => {
    const r = await validatePubliccode(old, { version: "0.7.0" });
    const repoOwner = r.deprecations.find((d) => d.key === "legal.repoOwner");
    expect(repoOwner?.message).toContain("DEPRECATA");
    expect(repoOwner?.message).toContain("0.5.0");
    expect(repoOwner?.fixable).toBe(true);
  });

  test("YAML illeggibile", async () => {
    const r = await validatePubliccode("name: [aperta", {});
    expect(r.readable).toBe(false);
    expect(r.errors[0]?.description).toContain("YAML illeggibile");
  });
});

describe("aggiornamento", () => {
  test("all'ultima versione dello standard (0.8.0), valido e con le date tra virgolette", async () => {
    const u = await upgradePubliccode(old);
    expect(u).toMatchObject({ from: "0.2", to: "0.8.0" });
    expect(u.validation.valid).toBe(true);
    expect(u.applied.map((a) => a.key)).toContain("legal.repoOwner");
    expect(u.yaml).toContain('releaseDate: "2024-01-01"');
    const data = parse(u.yaml) as { legal: Record<string, unknown>; organisation: Record<string, unknown> };
    expect(data.legal.repoOwner).toBeUndefined();
    expect(data.organisation.name).toBe("Presidenza del Consiglio dei Ministri");
  });

  test("all'ultima versione del parser Go (0.7.0), se il file deve passare anche da lui", async () => {
    const u = await upgradePubliccode(old, "0.7.0");
    expect(u).toMatchObject({ to: "0.7.0" });
    expect(u.validation.valid).toBe(true);
  });

  test("versione sconosciuta", async () => {
    await expect(upgradePubliccode(old, "0.6.0")).rejects.toThrow("Versione sconosciuta");
  });
});
