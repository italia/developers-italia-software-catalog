import type {
  PubliccodeDeprecationDto,
  PubliccodeIssueDto,
  PubliccodeUpgradeDto,
  PubliccodeValidationDto,
} from "@sw-catalog/shared";
import { useId, useMemo, useState } from "react";
import { api, useApi } from "../lib/api.ts";
import { CopyButton } from "./Copy.tsx";
import { Icon } from "./Icon.tsx";
import { ErrorAlert, Loading } from "./States.tsx";

// publiccode.yml del software con la validazione per versione dello standard
// (GET /v2/software/:id/validation) e il confronto con la versione aggiornata
// (GET /v2/software/:id/upgrade). Le regole sono quelle di publiccode-schema.

const LONG = 220;

function IssueText({ text }: { text: string }) {
  if (text.length <= LONG) return <>{text}</>;
  // I messaggi del parser sugli enum elencano tutti i valori ammessi
  return (
    <details className="inline">
      <summary className="cursor-pointer">{text.slice(0, LONG)}…</summary>
      <span className="break-words">{text.slice(LONG)}</span>
    </details>
  );
}

function IssueList({ title, items, kind }: { title: string; items: PubliccodeIssueDto[]; kind: "error" | "warning" }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className={`mb-1 font-semibold ${kind === "error" ? "text-error" : "text-base-content"}`}>
        {title} ({items.length})
      </h4>
      <ul className="space-y-1 text-sm">
        {items.map((e, i) => (
          <li key={`${e.key}-${i}`} className="break-words">
            {e.key && <code className="me-2">{e.key}</code>}
            <IssueText text={e.description} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeprecationList({ title, items }: { title: string; items: PubliccodeDeprecationDto[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1 font-semibold">
        {title} ({items.length})
      </h4>
      <ul className="space-y-1 text-sm">
        {items.map((d, i) => (
          <li key={`${d.id}-${d.key}-${i}`} className="break-words">
            <code className="me-2">{d.key}</code>
            {d.message}{" "}
            <span className={`ita-badge ${d.fixable && !d.lossy ? "ita-badge-success" : "ita-badge-secondary"}`}>
              {d.fixable ? (d.lossy ? "correggibile con perdita" : "correggibile") : "da correggere a mano"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Righe che compaiono solo in uno dei due file (confronto per insieme, senza allineamento),
 * ignorando spazi e virgolette: "13" e 13 sono lo stesso valore.
 */
const norm = (l: string) => l.replace(/["']/g, "").replace(/\s+/g, " ").trim();
function changedLines(a: string, b: string) {
  const inA = new Set(a.split("\n").map(norm));
  const inB = new Set(b.split("\n").map(norm));
  return {
    onlyA: (line: string) => norm(line) !== "" && !inB.has(norm(line)),
    onlyB: (line: string) => norm(line) !== "" && !inA.has(norm(line)),
  };
}

function Code({ text, highlight, className }: { text: string; highlight: (l: string) => boolean; className: string }) {
  return (
    <pre className="max-h-[36rem] overflow-auto rounded-box bg-base-200 p-4 text-sm">
      {text.split("\n").map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: righe di un file statico
        <span key={i} className={`block ${highlight(line) ? className : ""}`}>
          {line || " "}
        </span>
      ))}
    </pre>
  );
}

export function PubliccodePanel({ softwareId, yaml }: { softwareId: string; yaml: string }) {
  const versionId = useId();
  const targetId = useId();
  // Valori del form e richiesta inviata: la validazione parte con "Valida"
  const [version, setVersion] = useState("");
  const [strict, setStrict] = useState(false);
  const [query, setQuery] = useState("");
  const validation = useApi<PubliccodeValidationDto>(`/software/${softwareId}/validation${query}`);

  const [target, setTarget] = useState("");
  const [upgraded, setUpgraded] = useState<PubliccodeUpgradeDto | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<Error | null>(null);
  const [layout, setLayout] = useState<"side" | "stacked">("side");

  const v = validation.data;
  const diff = useMemo(() => (upgraded ? changedLines(yaml, upgraded.yaml) : null), [yaml, upgraded]);

  const runValidation = () => {
    const qs = new URLSearchParams();
    if (version) qs.set("version", version);
    if (strict) qs.set("strict", "true");
    const next = qs.size ? `?${qs}` : "";
    if (next === query) validation.reload();
    else setQuery(next);
  };

  const showUpgrade = async () => {
    setUpgrading(true);
    setUpgradeError(null);
    try {
      setUpgraded(await api<PubliccodeUpgradeDto>("GET", `/software/${softwareId}/upgrade${target ? `?to=${target}` : ""}`));
    } catch (e) {
      setUpgradeError(e as Error);
    } finally {
      setUpgrading(false);
    }
  };

  const latest = v?.latestSupported ?? "0.8.0";

  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        publiccode.yml <CopyButton value={yaml} label="il publiccode.yml" />
      </h2>

      <div className="rounded-box border border-base-300 bg-base-100 p-4 space-y-4">
        <h3 className="!m-0 !text-lg font-semibold">Validazione</h3>
        <div className="flex flex-wrap items-end gap-4">
          <div className="ita-field !mb-0">
            <label className="ita-label" htmlFor={versionId}>
              Versione dello standard
            </label>
            <select id={versionId} className="ita-select" value={version} onChange={(e) => setVersion(e.target.value)}>
              <option value="">Dichiarata nel file{v?.declaredVersion ? ` (${v.declaredVersion})` : ""}</option>
              {v?.versions.map((o) => (
                <option key={o.version} value={o.version}>
                  {o.version}
                  {o.supportedByParser ? "" : " (non accettata dal parser Go)"}
                </option>
              ))}
            </select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 pb-2">
            <input type="checkbox" className="checkbox checkbox-sm" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
            <span>
              Strict <span className="text-sm text-base-content/70">(solo le chiavi e gli obblighi di quella versione)</span>
            </span>
          </label>
          <button type="button" className="ita-btn ita-btn-primary ita-btn-sm" onClick={runValidation} disabled={validation.loading}>
            {validation.loading && <span className="ita-spinner ita-spinner-sm" aria-hidden="true" />}
            Valida
          </button>
        </div>

        {validation.error && <ErrorAlert error={validation.error} />}
        {!v && validation.loading && <Loading label="Validazione…" />}
        {v && (
          <div className="space-y-3" aria-live="polite">
            <p className="flex flex-wrap items-center gap-2">
              <span className={`ita-badge ${v.valid ? "ita-badge-success" : "ita-badge-danger"}`}>
                <Icon name={v.valid ? "it-check-circle" : "it-close-circle"} className="size-4" /> {v.valid ? "Valido" : "Non valido"}
              </span>
              <span className="text-sm">
                {v.schema === "v0"
                  ? `Regole del parser (valide per ogni 0.x), deprecazioni fino alla ${v.checkedVersion}`
                  : `Schema della versione ${v.checkedVersion} (strict)`}
                {" · "}il file dichiara {v.declaredVersion ?? "una versione non valida"}
              </span>
            </p>
            <IssueList title="Errori" items={v.errors} kind="error" />
            <IssueList title="Avvisi" items={v.warnings} kind="warning" />
            <DeprecationList title="Deprecati" items={v.deprecations} />
            {v.valid && v.warnings.length === 0 && v.deprecations.length === 0 && (
              <p className="text-sm text-base-content/70">Nessun problema per questa versione.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="ita-field !mb-0">
          <label className="ita-label" htmlFor={targetId}>
            Aggiorna a
          </label>
          <select id={targetId} className="ita-select" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{latest} (ultima versione dello standard)</option>
            {v?.versions
              .filter((o) => o.version !== latest)
              .map((o) => (
                <option key={o.version} value={o.version}>
                  {o.version}
                  {o.version === v.parserLatest ? " (ultima accettata dal parser Go e dall'editor)" : ""}
                </option>
              ))}
          </select>
        </div>
        <button type="button" className="ita-btn ita-btn-outline ita-btn-primary ita-btn-sm" onClick={() => void showUpgrade()} disabled={upgrading}>
          {upgrading && <span className="ita-spinner ita-spinner-sm" aria-hidden="true" />}
          Mostra la versione aggiornata
        </button>
        {upgraded && (
          <div role="group" aria-label="Disposizione" className="flex gap-1">
            {(["side", "stacked"] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={layout === l}
                className={`ita-btn ita-btn-xs ${layout === l ? "ita-btn-primary" : "ita-btn-outline ita-btn-primary"}`}
                onClick={() => setLayout(l)}
              >
                {l === "side" ? "Affiancati" : "Uno sotto l'altro"}
              </button>
            ))}
            <button type="button" className="ita-btn ita-btn-ghost ita-btn-xs" onClick={() => setUpgraded(null)}>
              Chiudi il confronto
            </button>
          </div>
        )}
      </div>
      {upgradeError && <ErrorAlert error={upgradeError} />}

      {upgraded && diff ? (
        <div className="space-y-4">
          <div className={layout === "side" ? "grid gap-4 lg:grid-cols-2" : "space-y-4"}>
            <div className="min-w-0">
              <h3 className="!m-0 mb-2 !text-base font-semibold">Originale ({upgraded.from ?? "versione non valida"})</h3>
              <Code text={yaml} highlight={diff.onlyA} className="bg-error/15" />
            </div>
            <div className="min-w-0">
              <h3 className="!m-0 mb-2 flex items-center gap-2 !text-base font-semibold">
                Aggiornato a {upgraded.to} <CopyButton value={upgraded.yaml} label="il publiccode.yml aggiornato" />
                <span className={`ita-badge ${upgraded.validation.valid ? "ita-badge-success" : "ita-badge-danger"}`}>
                  {upgraded.validation.valid ? "valido" : `${upgraded.validation.errors.length} errori`}
                </span>
              </h3>
              <Code text={upgraded.yaml} highlight={diff.onlyB} className="bg-success/15" />
            </div>
          </div>
          {v && !v.versions.find((o) => o.version === upgraded.to)?.supportedByParser && (
            <p role="note" className="ita-alert ita-alert-warning text-sm">
              La {upgraded.to} è valida per il catalogo, ma il parser Go e l'editor publiccode.yml accettano fino alla{" "}
              {v.parserLatest}: per un file che deve passare anche da loro, aggiorna alla {v.parserLatest}.
            </p>
          )}
          <p className="text-sm text-base-content/70">
            In rosso le righe che cambiano o spariscono, in verde quelle nuove o modificate. L'aggiornamento applica le correzioni
            dello standard; il file del repository non viene toccato: va aggiornato da chi mantiene il software.
          </p>
          <DeprecationList title="Correzioni applicate" items={upgraded.applied} />
          <DeprecationList title="Rimaste" items={upgraded.remaining} />
          <IssueList title={`Errori del file aggiornato (strict ${upgraded.to})`} items={upgraded.validation.errors} kind="error" />
        </div>
      ) : (
        <pre className="max-h-[32rem] overflow-auto rounded-box bg-base-200 p-4 text-sm">{yaml}</pre>
      )}
    </section>
  );
}
