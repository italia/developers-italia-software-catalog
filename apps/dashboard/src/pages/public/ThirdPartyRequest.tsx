import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { CheckResult } from "../../components/CheckResult.tsx";
import { Checkbox, FormAlert, SubmitButton, TextArea, TextField } from "../../components/Form.tsx";
import { Icon } from "../../components/Icon.tsx";
import { api, type PubliccodeCheck, type ThirdPartyRequestDto } from "../../lib/api.ts";

/** Form pubblico per chiedere l'inserimento di un software di terze parti (sostituisce la issue add_new_software). */
export function ThirdPartyRequest() {
  const [form, setForm] = useState({ repositoryUrl: "", requesterName: "", requesterEmail: "", notes: "" });
  const [decl, setDecl] = useState({ relevantForPa: false, notPaOwned: false, validPubliccode: false });
  const [trap, setTrap] = useState("");
  const [check, setCheck] = useState<PubliccodeCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<ThirdPartyRequestDto | null>(null);

  const runCheck = async () => {
    setChecking(true);
    setError(null);
    try {
      setCheck(await api<PubliccodeCheck>("POST", "/third-party-requests/check", { url: form.repositoryUrl.trim() }));
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
      setSent(
        await api<ThirdPartyRequestDto>("POST", "/third-party-requests", {
          repositoryUrl: form.repositoryUrl.trim(),
          requesterEmail: form.requesterEmail.trim(),
          ...(form.requesterName && { requesterName: form.requesterName.trim() }),
          ...(form.notes && { notes: form.notes.trim() }),
          declarations: decl,
          ...(trap && { website: trap }),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div role="status" className="ita-callout ita-callout-success max-w-3xl">
        <p className="ita-callout-title flex items-center gap-2">
          <Icon name="it-check-circle" /> Richiesta ricevuta
        </p>
        <p>
          La redazione di Developers Italia esaminerà la richiesta per <strong>{sent.repositoryUrl}</strong> e ti scriverà a{" "}
          <strong>{sent.requesterEmail}</strong> con l'esito.
        </p>
        {sent.validation && !sent.validation.valid && (
          <p className="mt-2">Nel frattempo correggi il publiccode.yml: le richieste con un file non valido non possono essere approvate.</p>
        )}
      </div>
    );
  }

  return (
    <article className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold">Richiedi l'inserimento di un software di terze parti</h1>
      <p>
        Il catalogo raccoglie anche software open source <strong>non</strong> di titolarità di una pubblica amministrazione ma utile alla PA,
        per esempio prodotti di aziende o community. Il repository deve contenere un file <code>publiccode.yml</code> valido. Se il software
        è di una PA, usa invece l'<Link to="/" className="ita-link">onboarding</Link> dell'ente.
      </p>

      <form className="space-y-5" onSubmit={(e) => void submit(e)}>
        {error && <FormAlert kind="danger">{error}</FormAlert>}

        <div className="flex flex-wrap items-end gap-3">
          <TextField
            label="URL del repository"
            type="url"
            required
            placeholder="https://github.com/organizzazione/progetto"
            className="max-w-xl flex-1"
            value={form.repositoryUrl}
            onChange={(e) => {
              setForm({ ...form, repositoryUrl: e.target.value });
              setCheck(null);
            }}
          />
          <button type="button" className="ita-btn ita-btn-outline ita-btn-primary" disabled={!form.repositoryUrl || checking} onClick={() => void runCheck()}>
            {checking && <span className="ita-spinner ita-spinner-sm" aria-hidden="true" />}
            Controlla il publiccode.yml
          </button>
        </div>
        {check && <CheckResult check={check} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nome e cognome" autoComplete="name" value={form.requesterName} onChange={(e) => setForm({ ...form, requesterName: e.target.value })} />
          <TextField
            label="Email"
            type="email"
            required
            autoComplete="email"
            value={form.requesterEmail}
            onChange={(e) => setForm({ ...form, requesterEmail: e.target.value })}
            hint="Ti scriviamo solo per l'esito della richiesta."
          />
        </div>

        <fieldset className="ita-choice-group">
          <legend className="ita-legend">
            Dichiarazioni <span className="ita-required" aria-hidden="true">*</span>
          </legend>
          <div className="ita-choice-list">
            <Checkbox required label="Il software è rilevante per la Pubblica Amministrazione" checked={decl.relevantForPa} onChange={(v) => setDecl({ ...decl, relevantForPa: v })} />
            <Checkbox required label="Il software non è di titolarità di una Pubblica Amministrazione" checked={decl.notPaOwned} onChange={(v) => setDecl({ ...decl, notPaOwned: v })} />
            <Checkbox required label="Il repository contiene un file publiccode.yml valido" checked={decl.validPubliccode} onChange={(v) => setDecl({ ...decl, validPubliccode: v })} />
          </div>
        </fieldset>

        <TextArea label="Ulteriori informazioni" rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="max-w-none" />
        <div className="hidden" aria-hidden="true">
          <label>
            Sito web
            <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
          </label>
        </div>

        <SubmitButton busy={busy}>
          Invia la richiesta <Icon name="it-arrow-right" />
        </SubmitButton>
      </form>
    </article>
  );
}
