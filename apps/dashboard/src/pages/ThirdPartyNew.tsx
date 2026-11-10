import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { CheckResult, checkOk } from "../components/CheckResult.tsx";
import { Checkbox, FormAlert, SelectField, SubmitButton, TextField } from "../components/Form.tsx";
import { Icon } from "../components/Icon.tsx";
import { api, type PubliccodeCheck, type SoftwareDto } from "../lib/api.ts";
import { usePublisherOptions } from "./SoftwareEdit.tsx";

interface Result {
  publisherId: string;
  software: SoftwareDto | null;
  check: PubliccodeCheck;
}

/**
 * Aggiunta diretta di un software di terze parti (solo ADMIN): il repository diventa un
 * code hosting "singolo repository" di un'organizzazione non PA, esistente o nuova.
 */
export function ThirdPartyNew() {
  const navigate = useNavigate();
  const publishers = usePublisherOptions().filter((p) => !p.alternativeId);
  const [url, setUrl] = useState("");
  const [check, setCheck] = useState<PubliccodeCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [publisherId, setPublisherId] = useState("");
  const [org, setOrg] = useState({ description: "", email: "" });
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCheck = async () => {
    setChecking(true);
    setError(null);
    setCheck(null);
    try {
      setCheck(await api<PubliccodeCheck>("POST", "/third-party-requests/check", { url: url.trim() }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const target =
        mode === "existing" ? { publisherId } : { newPublisher: { description: org.description.trim(), email: org.email.trim() || null } };
      const r = await api<Result>("POST", "/software/third-party", { url: url.trim(), ...target, ...(force && { force }) });
      navigate(r.software ? `/dashboard/software/${r.software.id}` : `/dashboard/publishers/${r.publisherId}`, {
        state: {
          flash: r.software
            ? "Software aggiunto al catalogo."
            : "Repository aggiunto ai code hosting: il crawler creerà il software quando il publiccode.yml sarà valido.",
        },
      });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <article className="max-w-3xl space-y-6">
      <Link to="/dashboard/software" className="ita-link inline-flex items-center gap-1">
        <Icon name="it-arrow-left" className="size-4" /> Tutti i software
      </Link>
      <h1 className="text-3xl font-bold">Aggiungi un software di terze parti</h1>
      <p>
        Software open source rilevante per la PA ma non di titolarità di una PA (es. prodotti di aziende o community). Il repository
        viene aggiunto all'organizzazione che lo pubblica e il crawler lo aggiornerà ogni notte. I software delle PA entrano invece con
        l'onboarding dell'ente.
      </p>

      <form className="space-y-6" onSubmit={(e) => void submit(e)}>
        {error && <FormAlert kind="danger">{error}</FormAlert>}

        <div className="flex flex-wrap items-end gap-3">
          <TextField
            label="URL del repository"
            type="url"
            required
            placeholder="https://github.com/organizzazione/progetto"
            className="max-w-xl flex-1"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setCheck(null);
            }}
          />
          <button type="button" className="ita-btn ita-btn-outline ita-btn-primary" disabled={!url || checking} onClick={() => void runCheck()}>
            {checking && <span className="ita-spinner ita-spinner-sm" aria-hidden="true" />}
            Controlla il publiccode.yml
          </button>
        </div>
        {check && <CheckResult check={check} />}

        <fieldset className="ita-choice-group">
          <legend className="ita-legend">Organizzazione che pubblica il software</legend>
          <div className="ita-choice-list ita-choice-list-inline">
            <label className="ita-choice">
              <input type="radio" className="ita-radio" name="mode" checked={mode === "existing"} onChange={() => setMode("existing")} />
              <span className="ita-choice-text">Già nel catalogo</span>
            </label>
            <label className="ita-choice">
              <input type="radio" className="ita-radio" name="mode" checked={mode === "new"} onChange={() => setMode("new")} />
              <span className="ita-choice-text">Nuova organizzazione</span>
            </label>
          </div>
        </fieldset>

        {mode === "existing" ? (
          <SelectField label="Organizzazione" required value={publisherId} onChange={(e) => setPublisherId(e.target.value)} hint="Sono elencate le organizzazioni senza codice IPA.">
            <option value="">— scegli —</option>
            {publishers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.description} ({p.softwareCount} software)
              </option>
            ))}
          </SelectField>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nome dell'organizzazione" required value={org.description} onChange={(e) => setOrg({ ...org, description: e.target.value })} />
            <TextField label="Email di contatto" type="email" value={org.email} onChange={(e) => setOrg({ ...org, email: e.target.value })} />
          </div>
        )}

        {check && !checkOk(check) && (
          <Checkbox
            label="Aggiungi comunque il repository"
            hint="Il repository entra nei code hosting dell'organizzazione; il software verrà creato dal crawler quando il publiccode.yml sarà valido."
            checked={force}
            onChange={setForce}
          />
        )}

        <SubmitButton busy={busy}>
          <Icon name="it-plus" /> Aggiungi al catalogo
        </SubmitButton>
      </form>
    </article>
  );
}
