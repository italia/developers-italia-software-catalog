import { randomUUID } from "node:crypto";
import type { OnboardingRequest, PrismaClient } from "@sw-catalog/db";
import { normalizeUrl, type OnboardingRequestDto } from "@sw-catalog/shared";
import { type AuditInput, audit } from "../lib/audit.ts";
import { env } from "../lib/env.ts";
import { mailer, mailHtml } from "../lib/mailer.ts";
import { HttpError } from "../lib/problem.ts";
import { hashToken, newToken } from "../lib/session.ts";

// Onboarding delle PA, flusso standard (sostituisce onboarding-italia, chiude S3, S4 e S5):
// form → controllo IPA/PEC su ipa_entities → richiesta PENDING → email alla PEC con un
// token monouso e una scadenza → l'ente conferma o rifiuta → publisher creato o aggiornato
// nella stessa transazione del cambio di stato. Gli ADMIN possono decidere anche dalla dashboard.

export function toOnboardingDto(r: OnboardingRequest): OnboardingRequestDto {
  return {
    id: r.id,
    ipa: r.ipa,
    administration: r.administration,
    contactName: r.contactName,
    contactPhone: r.contactPhone,
    pec: r.pec,
    codeHostingUrl: r.codeHostingUrl,
    flow: r.flow,
    status: r.status,
    publisherId: r.publisherId,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const ORG_HOSTS = new Set(["github.com", "gitlab.com", "bitbucket.org"]);

/**
 * URL di code hosting accettabile: https; su GitHub, GitLab.com e Bitbucket deve essere
 * l'organizzazione (un solo segmento), come in onboarding-italia. Altri domini: GitLab o
 * Gitea su dominio proprio, l'istanza o un gruppo.
 */
export function codeHostingProblem(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "URL non valido";
  }
  if (u.protocol !== "https:") return "L'URL deve iniziare con https://";
  if (ORG_HOSTS.has(u.hostname.toLowerCase()) && !/^\/[^/]+\/?$/.test(u.pathname)) {
    return `Su ${u.hostname} indica l'organizzazione, es. https://${u.hostname}/comune-di-reuso`;
  }
  return null;
}

export interface OnboardingInput {
  ipa: string;
  pec: string;
  contactName: string;
  contactPhone?: string | null;
  codeHostingUrl: string;
}

function confirmationMail(r: OnboardingRequest, token: string) {
  const confirm = `${env.dashboardUrl()}/onboarding/conferma?token=${encodeURIComponent(token)}`;
  const hours = env.onboardingTtlHours();
  const intro = `ci è pervenuta la richiesta di aggiungere l'URL ${r.codeHostingUrl} al portale Developers Italia come strumento di code hosting ufficiale utilizzato dalla vostra Amministrazione per pubblicare il software a riuso (Linee guida per l'acquisizione e il riuso di software per le pubbliche amministrazioni, artt. 68 e 69 del Codice dell'Amministrazione Digitale).`;
  const lines = [
    `Gentile ${r.administration},`,
    intro,
    `La richiesta è stata effettuata dal referente ${r.contactName}.`,
    `Se la richiesta è corretta, confermate la registrazione con il link qui sotto entro ${hours} ore. Dalla stessa pagina potete anche rifiutarla.`,
    "Una volta completata la procedura, lo strumento di code hosting verrà incluso nelle scansioni periodiche del catalogo di Developers Italia. Saranno presi in considerazione solo i repository con un file publiccode.yml correttamente compilato.",
  ];
  return {
    to: r.pec!,
    cc: process.env.EMAIL_ONBOARDING_CC || undefined,
    bcc: process.env.EMAIL_ONBOARDING_BCC || undefined,
    subject: `Developers Italia: conferma della registrazione di ${r.administration}`,
    text: `${lines.join("\n\n")}\n\nConferma o rifiuta: ${confirm}`,
    html: mailHtml("Conferma la registrazione del code hosting", lines, [{ label: "Conferma o rifiuta la richiesta", url: confirm }]),
  };
}

export async function createOnboardingRequest(db: PrismaClient, input: OnboardingInput): Promise<OnboardingRequestDto> {
  const entity = await db.ipaEntity.findFirst({ where: { ipa: { equals: input.ipa.trim(), mode: "insensitive" } } });
  if (!entity) throw new HttpError(422, "Unprocessable Entity", "Codice IPA non trovato in IndicePA");

  const pec = input.pec.trim().toLowerCase();
  if (!entity.pec.map((p) => p.toLowerCase()).includes(pec)) {
    throw new HttpError(422, "Unprocessable Entity", "La PEC indicata non è tra quelle dell'ente in IndicePA");
  }

  const problem = codeHostingProblem(input.codeHostingUrl);
  if (problem) throw new HttpError(422, "Unprocessable Entity", problem);
  const url = normalizeUrl(input.codeHostingUrl).replace(/\/+$/, "");

  const registered = await db.codeHosting.findFirst({
    where: { url: { in: [url, `${url}/`], mode: "insensitive" } },
    include: { publisher: { select: { alternativeId: true, description: true } } },
  });
  if (registered) {
    const owner = registered.publisher.alternativeId?.toLowerCase() === entity.ipa.toLowerCase() ? "per questo ente" : `per ${registered.publisher.description}`;
    throw new HttpError(409, "Conflict", `L'URL è già registrato ${owner}`);
  }

  const token = newToken();
  const confirmExpiresAt = new Date(Date.now() + env.onboardingTtlHours() * 3_600_000);

  // Una richiesta ancora in attesa per lo stesso ente e URL viene riusata: nuovo token, nuova email.
  const pending = await db.onboardingRequest.findFirst({ where: { ipa: entity.ipa, codeHostingUrl: url, status: "PENDING" } });
  const request = await db.$transaction(async (tx) => {
    const data = {
      administration: entity.description,
      contactName: input.contactName.trim(),
      contactPhone: input.contactPhone?.trim() || null,
      pec,
      confirmTokenHash: hashToken(token),
      confirmExpiresAt,
    };
    const r = pending
      ? await tx.onboardingRequest.update({ where: { id: pending.id }, data })
      : await tx.onboardingRequest.create({ data: { ...data, ipa: entity.ipa, codeHostingUrl: url, flow: "STANDARD" } });
    if (!pending) {
      await audit(tx, { entityType: "onboarding_requests", entityId: r.id, action: "created", actorType: "REQUESTER", actorId: r.contactName, toStatus: "PENDING" });
    }
    await audit(tx, { entityType: "onboarding_requests", entityId: r.id, action: "email_sent", data: { to: pec, resent: Boolean(pending) } });
    return r;
  });

  await mailer.send(confirmationMail(request, token));
  return toOnboardingDto(request);
}

async function byToken(db: PrismaClient, token: string) {
  const r = await db.onboardingRequest.findUnique({ where: { confirmTokenHash: hashToken(token) } });
  if (!r || r.status !== "PENDING") throw new HttpError(404, "Not Found", "Richiesta non trovata o già gestita");
  if (r.confirmExpiresAt && r.confirmExpiresAt <= new Date()) {
    throw new HttpError(410, "Gone", "Il link è scaduto: invia di nuovo la richiesta dal form di onboarding");
  }
  return r;
}

/** Dati che l'ente vede prima di confermare, dal link nella PEC. */
export async function onboardingByToken(db: PrismaClient, token: string) {
  const r = await byToken(db, token);
  return { administration: r.administration, ipa: r.ipa, codeHostingUrl: r.codeHostingUrl, contactName: r.contactName, createdAt: r.createdAt.toISOString() };
}

type Actor = Pick<AuditInput, "actorType" | "actorId">;

/**
 * Approva o rifiuta. All'approvazione, nella stessa transazione: publisher con
 * alternativeId = IPA creato, oppure aggiornato aggiungendo l'URL ai suoi code hosting.
 */
export async function decideOnboarding(
  db: PrismaClient,
  request: OnboardingRequest,
  decision: "APPROVED" | "REJECTED",
  actor: Actor,
  note?: string,
): Promise<OnboardingRequestDto> {
  const updated = await db.$transaction(async (tx) => {
    // Cambio di stato condizionato: due decisioni in parallelo non passano entrambe.
    const { count } = await tx.onboardingRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: { status: decision, decidedAt: new Date(), confirmTokenHash: null, confirmExpiresAt: null },
    });
    if (count === 0) throw new HttpError(409, "Conflict", "La richiesta è già stata gestita");

    let publisherId: string | null = null;
    if (decision === "APPROVED") {
      const existing = await tx.publisher.findFirst({
        where: { alternativeId: { equals: request.ipa, mode: "insensitive" } },
        include: { codeHosting: true },
      });
      if (existing) {
        publisherId = existing.id;
        if (!existing.codeHosting.some((ch) => ch.url.toLowerCase() === request.codeHostingUrl.toLowerCase())) {
          await tx.codeHosting.create({ data: { id: randomUUID(), url: request.codeHostingUrl, group: true, publisherId } });
        }
        await tx.publisher.update({ where: { id: publisherId }, data: { active: true, ...(request.pec && { email: request.pec }) } });
        await audit(tx, { entityType: "publishers", entityId: publisherId, action: "code_hosting_added", ...actor, data: { url: request.codeHostingUrl, onboardingRequestId: request.id } });
      } else {
        publisherId = randomUUID();
        await tx.publisher.create({
          data: { id: publisherId, description: request.administration, alternativeId: request.ipa, email: request.pec, active: true },
        });
        await tx.codeHosting.create({ data: { id: randomUUID(), url: request.codeHostingUrl, group: true, publisherId } });
        await audit(tx, { entityType: "publishers", entityId: publisherId, action: "created", ...actor, data: { onboardingRequestId: request.id } });
      }
      await tx.onboardingRequest.update({ where: { id: request.id }, data: { publisherId } });
    }

    await audit(tx, {
      entityType: "onboarding_requests",
      entityId: request.id,
      action: decision === "APPROVED" ? "approved" : "rejected",
      ...actor,
      fromStatus: "PENDING",
      toStatus: decision,
      data: { ...(note && { note }), ...(publisherId && { publisherId }) },
    });
    return tx.onboardingRequest.findUniqueOrThrow({ where: { id: request.id } });
  });
  return toOnboardingDto(updated);
}

/** Decisione dell'ente dal link nella PEC. */
export async function decideByToken(db: PrismaClient, token: string, decision: "APPROVED" | "REJECTED") {
  const r = await byToken(db, token);
  return decideOnboarding(db, r, decision, { actorType: "REQUESTER", actorId: r.pec });
}
