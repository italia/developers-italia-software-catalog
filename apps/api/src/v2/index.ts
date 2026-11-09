import { Hono } from "hono";
import { catalogs } from "./catalogs.ts";
import { logs } from "./logs.ts";
import { publishers } from "./publishers.ts";
import { software } from "./software.ts";

// API v2: la versione principale del nuovo catalogo.
//
// Contratto: ../../openapi/v2/openapi.yaml (design-first, vedi new-plan.md, Fase 3).
export const v2 = new Hono();

v2.get("/status", (c) => c.json({ status: "ok", version: "2" }));
v2.route("/software", software);
v2.route("/publishers", publishers);
v2.route("/logs", logs);
v2.route("/catalogs", catalogs);
