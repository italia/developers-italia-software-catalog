import type { Prisma } from "@sw-catalog/db";
import type { Context } from "hono";
import type { AuthVars } from "./session.ts";

type Db = Pick<Prisma.TransactionClient, "auditEvent">;

export interface AuditInput {
  entityType: "software" | "publishers" | "onboarding_requests" | "third_party_requests" | "dashboard_users" | "vocabularies";
  entityId: string;
  action: string;
  actorType?: "SYSTEM" | "DASHBOARD_USER" | "REQUESTER" | "GITHUB";
  actorId?: string | null;
  fromStatus?: "PENDING" | "APPROVED" | "REJECTED" | null;
  toStatus?: "PENDING" | "APPROVED" | "REJECTED" | null;
  data?: Prisma.InputJsonValue;
}

export function audit(db: Db, e: AuditInput) {
  return db.auditEvent.create({
    data: {
      entityType: e.entityType,
      entityId: e.entityId,
      action: e.action,
      actorType: e.actorType ?? "SYSTEM",
      actorId: e.actorId ?? null,
      fromStatus: e.fromStatus ?? null,
      toStatus: e.toStatus ?? null,
      data: e.data,
    },
  });
}

/** Attore della richiesta: l'utente della dashboard se c'è una sessione, altrimenti un client con token. */
export function actorOf(c: Context<{ Variables: AuthVars }>): Pick<AuditInput, "actorType" | "actorId"> {
  const user = c.get("user");
  return user ? { actorType: "DASHBOARD_USER", actorId: user.email } : { actorType: "SYSTEM", actorId: "api-token" };
}
