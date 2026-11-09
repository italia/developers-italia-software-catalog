import { parse } from "yaml";

/** Nome del software dal publiccode.yml: `name`, oppure null se il YAML non è leggibile. */
export function publiccodeName(yaml: string): string | null {
  try {
    const doc = parse(yaml) as { name?: unknown } | null;
    return typeof doc?.name === "string" ? doc.name : null;
  } catch {
    return null;
  }
}
