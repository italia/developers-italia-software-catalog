import { Hono } from "hono";
import { z } from "zod";
import { actorOf } from "../lib/audit.ts";
import { getDb } from "../lib/db.ts";
import { problem } from "../lib/problem.ts";
import { type AuthVars, requireWriter } from "../lib/session.ts";
import { validate } from "../lib/validate.ts";
import {
  createTerm,
  deleteTerm,
  getVocabulary,
  listVocabularies,
  reorderTerms,
  toTermDto,
  updateTerm,
  updateVocabulary,
} from "../services/vocabularies.ts";

// Liste editoriali del catalogo (D13): misure e beneficiari PNRR.
// Lettura pubblica (le usa il catalogo), con le sole voci attive; ?all=true, per la
// dashboard, include le disattivate e richiede la sessione. Scritture: ADMIN o token.
export const vocabularies = new Hono<{ Variables: AuthVars }>();

/** Testo facoltativo: stringa vuota → null; assente resta undefined (non si tocca). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => (s === undefined ? undefined : s || null));

const termBody = z.strictObject({
  key: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[^\r\n]+$/, "La chiave sta su una riga"),
  labelIt: optionalText(1000),
  labelEn: optionalText(1000),
  active: z.boolean().optional(),
});

vocabularies.get("/", async (c) => {
  c.header("Cache-Control", "public, max-age=60");
  return c.json({ data: await listVocabularies(getDb()) });
});

vocabularies.get("/:id", validate("query", z.object({ all: z.enum(["true", "false"]).optional() })), async (c) => {
  const all = c.req.valid("query").all === "true";
  if (all && !c.get("user")) return problem(c, 401, "Unauthorized", "Le voci disattivate sono visibili solo dalla dashboard");
  if (!all) c.header("Cache-Control", "public, max-age=60");
  return c.json(await getVocabulary(getDb(), c.req.param("id"), all));
});

vocabularies.patch(
  "/:id",
  requireWriter,
  validate("json", z.strictObject({ name: z.string().trim().min(1).max(200).optional(), description: optionalText(2000) })),
  async (c) => {
    await updateVocabulary(getDb(), c.req.param("id"), c.req.valid("json"), actorOf(c));
    return c.json(await getVocabulary(getDb(), c.req.param("id"), true));
  },
);

vocabularies.post("/:id/terms", requireWriter, validate("json", termBody), async (c) => {
  const term = await createTerm(getDb(), c.req.param("id"), c.req.valid("json"), actorOf(c));
  return c.json(toTermDto(term), 201);
});

vocabularies.patch("/:id/terms/:termId", requireWriter, validate("json", termBody.partial()), async (c) => {
  const term = await updateTerm(getDb(), c.req.param("id"), c.req.param("termId"), c.req.valid("json"), actorOf(c));
  return c.json(toTermDto(term));
});

vocabularies.delete("/:id/terms/:termId", requireWriter, async (c) => {
  await deleteTerm(getDb(), c.req.param("id"), c.req.param("termId"), actorOf(c));
  return c.body(null, 204);
});

vocabularies.put(
  "/:id/order",
  requireWriter,
  validate("json", z.strictObject({ termIds: z.array(z.string().min(1)).max(1000) })),
  async (c) => {
    await reorderTerms(getDb(), c.req.param("id"), c.req.valid("json").termIds, actorOf(c));
    return c.json(await getVocabulary(getDb(), c.req.param("id"), true));
  },
);
