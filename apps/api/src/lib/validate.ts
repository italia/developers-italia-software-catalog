import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";
import { problem } from "./problem.ts";

/** zValidator che risponde 422 in problem+json, con l'elenco dei campi non validi. */
export const validate = <T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      return problem(c, 422, "Unprocessable Entity", "Richiesta non valida", { issues });
    }
  });
