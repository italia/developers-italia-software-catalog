import { afterEach, describe, expect, test } from "bun:test";
import { codeHostingProblem } from "../services/onboarding.ts";
import { toIpaRow } from "../services/ipa.ts";
import { isRepositoryUrl, rawFileUrls } from "../services/publiccode-check.ts";
import { thirdPartyProblems } from "../services/third-party.ts";
import { canLogin, roleFor } from "./env.ts";
import { assertPublicUrl, isPublicAddress, UnsafeUrlError } from "./safe-fetch.ts";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("accesso alla dashboard", () => {
  test("dominio esatto, niente sottodomini né suffissi", () => {
    process.env.DASHBOARD_ALLOWED_EMAIL_DOMAINS = "innovazione.gov.it, agid.gov.it";
    expect(canLogin("Mario.Rossi@Innovazione.gov.it")).toBe(true);
    expect(canLogin("a@sub.innovazione.gov.it")).toBe(false);
    expect(canLogin("a@innovazione.gov.it.evil.com")).toBe(false);
    expect(canLogin("a@evilinnovazione.gov.it")).toBe(false);
    expect(canLogin("innovazione.gov.it")).toBe(false);
  });

  test("indirizzi elencati e admin entrano anche fuori dai domini", () => {
    process.env.DASHBOARD_ALLOWED_EMAIL_DOMAINS = "agid.gov.it";
    process.env.DASHBOARD_ALLOWED_EMAILS = "ospite@example.com";
    process.env.DASHBOARD_ADMIN_EMAILS = "Capo@Example.org";
    expect(canLogin("ospite@example.com")).toBe(true);
    expect(canLogin("capo@example.org")).toBe(true);
    expect(roleFor("CAPO@example.org")).toBe("ADMIN");
    expect(roleFor("ospite@example.com")).toBe("VIEWER");
  });

  test("EMAIL_OVERRIDE_RECIPIENT non dà accesso", () => {
    process.env.DASHBOARD_ALLOWED_EMAIL_DOMAINS = "agid.gov.it";
    process.env.EMAIL_OVERRIDE_RECIPIENT = "dev@example.com";
    expect(canLogin("dev@example.com")).toBe(false);
  });
});

describe("indirizzi pubblici (SSRF)", () => {
  test.each([
    ["185.199.108.133", true],
    ["140.82.121.3", true],
    ["2606:50c0:8002::154", true],
    ["::ffff:8.8.8.8", true],
    ["127.0.0.1", false],
    ["10.1.2.3", false],
    ["172.20.0.5", false],
    ["192.168.1.1", false],
    ["169.254.169.254", false],
    ["100.64.1.1", false],
    ["0.0.0.0", false],
    ["::1", false],
    ["::ffff:127.0.0.1", false],
    ["fd00::1", false],
    ["fe80::1", false],
  ])("%s → %p", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });

  test("schema, porta e credenziali", async () => {
    for (const url of ["http://github.com/a/b", "https://github.com:8443/a/b", "https://u:p@github.com/a/b", "https://127.0.0.1/a/b", "https://[::1]/a/b"]) {
      await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(UnsafeUrlError);
    }
  });
});

describe("onboarding", () => {
  test("su GitHub, GitLab.com e Bitbucket serve l'organizzazione", () => {
    expect(codeHostingProblem("https://github.com/comune-di-reuso")).toBeNull();
    expect(codeHostingProblem("https://github.com/comune-di-reuso/")).toBeNull();
    expect(codeHostingProblem("https://github.com/org/repo")).toContain("organizzazione");
    expect(codeHostingProblem("https://gitlab.com/gruppo/progetto")).toContain("organizzazione");
    expect(codeHostingProblem("http://github.com/org")).toContain("https");
    expect(codeHostingProblem("non un url")).toBe("URL non valido");
    // GitLab su dominio proprio: istanza o gruppo annidato
    expect(codeHostingProblem("https://gitlab.comune.it/settore/sottogruppo")).toBeNull();
  });

  test("ente IndicePA: solo le email di tipo PEC, sito con schema", () => {
    const row = toIpaRow({
      Codice_IPA: " c_a662 ",
      Denominazione_ente: "Comune di Bari",
      Codice_fiscale_ente: "80015010723",
      Tipologia: "Pubbliche Amministrazioni",
      Sito_istituzionale: "www.comune.bari.it",
      Mail1: "Protocollo@PEC.comune.bari.it",
      Tipo_Mail1: "Pec",
      Mail2: "info@comune.bari.it",
      Tipo_Mail2: "Altro",
    });
    expect(row).toEqual({
      ipa: "c_a662",
      description: "Comune di Bari",
      category: "Pubbliche Amministrazioni",
      fiscalCode: "80015010723",
      website: "https://www.comune.bari.it",
      pec: ["protocollo@pec.comune.bari.it"],
    });
  });
});

describe("software di terze parti", () => {
  test("URL raw del publiccode.yml per ogni code hosting", () => {
    expect(rawFileUrls("https://github.com/org/repo.git")).toEqual(["https://raw.githubusercontent.com/org/repo/HEAD/publiccode.yml"]);
    expect(rawFileUrls("https://gitlab.com/g/sub/p/")).toEqual(["https://gitlab.com/g/sub/p/-/raw/HEAD/publiccode.yml"]);
    expect(rawFileUrls("https://bitbucket.org/o/r")).toEqual(["https://bitbucket.org/o/r/raw/HEAD/publiccode.yml"]);
    expect(rawFileUrls("https://git.example.it/o/r")).toEqual([
      "https://git.example.it/o/r/-/raw/HEAD/publiccode.yml",
      "https://git.example.it/o/r/raw/HEAD/publiccode.yml",
    ]);
  });

  test("solo repository singoli in https", () => {
    expect(isRepositoryUrl("https://github.com/org/repo")).toBe(true);
    expect(isRepositoryUrl("https://github.com/org")).toBe(false);
    expect(isRepositoryUrl("http://github.com/org/repo")).toBe(false);
  });

  test("blocchi: file assente, non valido, titolarità PA", () => {
    const base = { fileUrl: "x", found: true, valid: true, name: "x", errors: [], warnings: [], declaredIpa: null };
    expect(thirdPartyProblems(base)).toEqual([]);
    expect(thirdPartyProblems({ ...base, found: false, valid: false })[0]).toContain("non trovato");
    expect(thirdPartyProblems({ ...base, valid: false })[0]).toContain("non valido");
    expect(thirdPartyProblems({ ...base, declaredIpa: "c_a662" })[0]).toContain("titolare");
  });
});
