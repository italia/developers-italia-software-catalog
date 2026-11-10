import { Hono } from "hono";
import { type AuthVars, loadSession } from "../lib/session.ts";
import { auth } from "./auth.ts";
import { catalogs } from "./catalogs.ts";
import { ipa } from "./ipa.ts";
import { logs } from "./logs.ts";
import { onboarding } from "./onboarding.ts";
import { publishers } from "./publishers.ts";
import { software } from "./software.ts";
import { thirdParty } from "./third-party.ts";

// API v2: la versione principale del nuovo catalogo.
//
// Contratto: ../../openapi/v2/openapi.yaml (design-first, vedi new-plan.md, Fase 3).
// Letture di software, publisher, log e cataloghi pubbliche; scritture con un token
// (client macchina) o con la sessione di un ADMIN della dashboard.
export const v2 = new Hono<{ Variables: AuthVars }>();

v2.use(loadSession);
v2.get("/status", (c) => c.json({ status: "ok", version: "2" }));
v2.route("/auth", auth);
v2.route("/software", software);
v2.route("/publishers", publishers);
v2.route("/logs", logs);
v2.route("/catalogs", catalogs);
v2.route("/ipa-entities", ipa);
v2.route("/onboarding-requests", onboarding);
v2.route("/third-party-requests", thirdParty);
