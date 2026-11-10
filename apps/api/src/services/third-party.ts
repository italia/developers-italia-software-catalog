import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@sw-catalog/db";
import { normalizeUrl, type PubliccodeCheck, type SoftwareDto } from "@sw-catalog/shared";
import { type AuditInput, audit } from "../lib/audit.ts";
import { HttpError } from "../lib/problem.ts";
import { UnsafeUrlError } from "../lib/safe-fetch.ts";
import { checkRepository, withoutYaml } from "./publiccode-check.ts";
import { softwareInclude, toSoftwareDto } from "./software.ts";

// Aggiunta di un software di terze parti: il repository diventa un code hosting
// "singolo repository" (group=false) di un publisher non PA, come i software di terze
// parti già nel catalogo (es. Opencontent, DXC Technology). Se il publiccode.yml c'è,
// il software viene creato subito, invece di aspettare il crawler della notte.

export interface ThirdPartyInput {
  url: string;
  /** Publisher esistente… */
  publisherId?: string;
  /** …oppure una nuova organizzazione */
  newPublisher?: { description: string; email?: string | null };
  /** Aggiunge il repository anche se il publiccode.yml manca o non è valido */
  force?: boolean;
}

export interface ThirdPartyResult {
  publisherId: string;
  software: SoftwareDto | null;
  check: PubliccodeCheck;
}

type Actor = Pick<AuditInput, "actorType" | "actorId">;

/** Errori bloccanti per un software di terze parti, oltre a quelli del file. */
export function thirdPartyProblems(check: PubliccodeCheck): string[] {
  const problems: string[] = [];
  if (!check.found) problems.push("publiccode.yml non trovato nel branch predefinito del repository");
  else if (!check.valid) problems.push("publiccode.yml non valido");
  if (check.declaredIpa) {
    problems.push(`il publiccode.yml dichiara un'amministrazione titolare (${check.declaredIpa}): non è un software di terze parti, deve fare l'onboarding l'ente`);
  }
  return problems;
}

export async function addThirdPartySoftware(db: PrismaClient, input: ThirdPartyInput, actor: Actor): Promise<ThirdPartyResult> {
  const url = normalizeUrl(input.url).replace(/\/+$/, "");
  if (!input.publisherId === !input.newPublisher) {
    throw new HttpError(422, "Unprocessable Entity", "Indica un publisher esistente oppure una nuova organizzazione");
  }

  const taken = await db.softwareUrl.findFirst({
    where: { url: { in: [url, `${url}.git`], mode: "insensitive" } },
    select: { softwareId: true },
  });
  if (taken) throw new HttpError(409, "Conflict", `Il repository è già nel catalogo (software ${taken.softwareId})`);

  const checked = await checkRepository(url).catch((e) => {
    if (e instanceof UnsafeUrlError) throw new HttpError(422, "Unprocessable Entity", `URL non accettato: ${e.message}`);
    throw e;
  });
  const check = withoutYaml(checked);
  const problems = thirdPartyProblems(check);
  if (problems.length && !input.force) {
    throw new HttpError(422, "Unprocessable Entity", problems.join("; "));
  }

  const result = await db.$transaction(async (tx) => {
    let publisherId = input.publisherId;
    if (input.newPublisher) {
      publisherId = randomUUID();
      await tx.publisher.create({
        data: { id: publisherId, description: input.newPublisher.description, email: input.newPublisher.email ?? null, active: true },
      });
      await audit(tx, { entityType: "publishers", entityId: publisherId, action: "created", ...actor, data: { via: "third_party" } });
    } else if (!(await tx.publisher.findUnique({ where: { id: publisherId }, select: { id: true } }))) {
      throw new HttpError(422, "Unprocessable Entity", "Publisher non trovato");
    }

    const hosting = await tx.codeHosting.findFirst({ where: { url: { equals: url, mode: "insensitive" } } });
    if (!hosting) {
      await tx.codeHosting.create({ data: { id: randomUUID(), url, group: false, publisherId: publisherId! } });
    }

    let softwareId: string | null = null;
    if (checked.yaml !== null && check.valid) {
      softwareId = randomUUID();
      const urlId = randomUUID();
      await tx.softwareUrl.create({ data: { id: urlId, url, softwareId } });
      await tx.software.create({
        data: { id: softwareId, softwareUrlId: urlId, publiccodeYml: checked.yaml, active: true, publisherId },
      });
      await audit(tx, { entityType: "software", entityId: softwareId, action: "created", ...actor, data: { via: "third_party", url } });
    }
    await audit(tx, {
      entityType: "publishers",
      entityId: publisherId!,
      action: "code_hosting_added",
      ...actor,
      data: { url, group: false, forced: Boolean(input.force && problems.length) },
    });

    const software = softwareId ? await tx.software.findUniqueOrThrow({ where: { id: softwareId }, include: softwareInclude }) : null;
    return { publisherId: publisherId!, software };
  });

  return { publisherId: result.publisherId, software: result.software ? toSoftwareDto(result.software) : null, check };
}
