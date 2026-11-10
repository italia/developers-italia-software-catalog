import type { PubliccodeCheck } from "../lib/api.ts";
import { Icon } from "./Icon.tsx";

/** Esito del controllo del publiccode.yml di un repository. */
export function CheckResult({ check }: { check: PubliccodeCheck }) {
  const ok = check.found && check.valid && !check.declaredIpa;
  return (
    <div className={`ita-callout ${ok ? "ita-callout-success" : check.found ? "ita-callout-warning" : "ita-callout-danger"}`}>
      <p className="ita-callout-title flex items-center gap-2">
        <Icon name={ok ? "it-check-circle" : "it-warning-circle"} />
        {!check.found ? "publiccode.yml non trovato" : check.valid ? "publiccode.yml valido" : "publiccode.yml non valido"}
        {check.name && <span className="font-normal">· {check.name}</span>}
      </p>
      <div className="space-y-2 text-sm">
        {!check.found && <p>Il file deve stare nella radice del branch predefinito del repository.</p>}
        {check.fileUrl && (
          <p>
            Letto da{" "}
            <a className="ita-link break-all" href={check.fileUrl} target="_blank" rel="noreferrer">
              {check.fileUrl}
            </a>
          </p>
        )}
        {check.declaredIpa && (
          <p>
            <strong>Attenzione:</strong> il file dichiara un'amministrazione titolare (<code>{check.declaredIpa}</code>). Un software di
            una PA non è di terze parti: deve essere l'ente a fare l'onboarding del proprio code hosting.
          </p>
        )}
        {check.errors.length > 0 && (
          <details open={check.errors.length <= 5}>
            <summary className="cursor-pointer font-semibold">Errori ({check.errors.length})</summary>
            <ul className="mt-1 list-disc ps-6">
              {check.errors.map((e, i) => (
                <li key={i}>
                  {e.key && <code>{e.key}</code>} {e.description}
                </li>
              ))}
            </ul>
          </details>
        )}
        {check.warnings.length > 0 && (
          <details>
            <summary className="cursor-pointer font-semibold">Avvisi ({check.warnings.length})</summary>
            <ul className="mt-1 list-disc ps-6">
              {check.warnings.map((w, i) => (
                <li key={i}>
                  {w.key && <code>{w.key}</code>} {w.description}
                </li>
              ))}
            </ul>
          </details>
        )}
        {check.found && (
          <p>
            Per correggere il file puoi usare il{" "}
            <a className="ita-link" href="https://publiccode-editor.developers.italia.it/" target="_blank" rel="noreferrer">
              publiccode editor
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}

export const checkOk = (c: PubliccodeCheck | null) => Boolean(c?.found && c.valid && !c.declaredIpa);
