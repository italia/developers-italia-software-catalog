import { Hono } from "hono";

// API v1: livello di compatibilità con developers-italia-api (Go).
//
// Contratto: ../../openapi/v1/open-catalog-api.oas.yaml (copia di riferimento dal repo Go).
// Serve ai client attuali (publiccode-crawler Go, onboarding-italia, publiccode-issueopener,
// chi è iscritto ai webhook) durante la migrazione. Va implementata come adattatore sottile
// sopra gli stessi servizi della v2, senza logica propria. Dopo il cutover riceverà gli
// header Deprecation/Sunset e verrà rimossa (vedi new-plan.md, Fase 3).
export const v1 = new Hono();

v1.get("/status", (c) => c.body(null, 204));
