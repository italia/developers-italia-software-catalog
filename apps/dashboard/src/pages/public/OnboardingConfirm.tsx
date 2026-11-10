import { useState } from "react";
import { useSearchParams } from "react-router";
import { FormAlert } from "../../components/Form.tsx";
import { Icon } from "../../components/Icon.tsx";
import { ErrorAlert, Loading } from "../../components/States.tsx";
import { api, useApi } from "../../lib/api.ts";
import { formatDate } from "../../lib/format.ts";

interface Summary {
  administration: string;
  ipa: string;
  codeHostingUrl: string;
  contactName: string;
  createdAt: string;
}

/** Pagina aperta dal link nella PEC: l'ente conferma o rifiuta la richiesta di onboarding. */
export function OnboardingConfirm() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const summary = useApi<Summary>(token ? `/onboarding-requests/confirm?token=${encodeURIComponent(token)}` : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"APPROVED" | "REJECTED" | null>(null);

  const decide = async (decision: "confirm" | "reject") => {
    setBusy(true);
    setError(null);
    try {
      setDone((await api<{ status: "APPROVED" | "REJECTED" }>("POST", "/onboarding-requests/confirm", { token, decision })).status);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!token) return <ErrorAlert error={new Error("Link incompleto: apri il link ricevuto via PEC.")} />;
  if (done) {
    return (
      <div role="status" className={`ita-callout ${done === "APPROVED" ? "ita-callout-success" : "ita-callout-warning"} max-w-3xl`}>
        <p className="ita-callout-title flex items-center gap-2">
          <Icon name={done === "APPROVED" ? "it-check-circle" : "it-close-circle"} />
          {done === "APPROVED" ? "Registrazione completata" : "Richiesta rifiutata"}
        </p>
        <p>
          {done === "APPROVED"
            ? "Il code hosting sarà incluso nelle prossime scansioni notturne del catalogo. Entreranno nel catalogo solo i repository con un publiccode.yml valido."
            : "La richiesta è stata chiusa e nessun dato è stato aggiunto al catalogo."}
        </p>
      </div>
    );
  }
  if (summary.loading) return <Loading />;
  if (summary.error || !summary.data) return <ErrorAlert error={summary.error ?? new Error("Richiesta non trovata")} />;
  const s = summary.data;

  return (
    <article className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold">Conferma la registrazione</h1>
      <p>
        Gentile {s.administration}, ci è pervenuta la richiesta di aggiungere questo strumento di code hosting al catalogo di Developers
        Italia, come strumento ufficiale dell'amministrazione per pubblicare il software a riuso.
      </p>
      <dl className="grid gap-x-8 gap-y-3 rounded-box bg-base-200 p-5 sm:grid-cols-[12rem_1fr]">
        <dt className="font-semibold">Ente</dt>
        <dd>
          {s.administration} (<code>{s.ipa}</code>)
        </dd>
        <dt className="font-semibold">Code hosting</dt>
        <dd className="break-all">
          <a className="ita-link" href={s.codeHostingUrl} target="_blank" rel="noreferrer">
            {s.codeHostingUrl}
          </a>
        </dd>
        <dt className="font-semibold">Referente</dt>
        <dd>{s.contactName}</dd>
        <dt className="font-semibold">Richiesta del</dt>
        <dd>{formatDate(s.createdAt)}</dd>
      </dl>
      {error && <FormAlert kind="danger">{error}</FormAlert>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="ita-btn ita-btn-primary" disabled={busy} onClick={() => void decide("confirm")}>
          <Icon name="it-check" /> Conferma la registrazione
        </button>
        <button type="button" className="ita-btn ita-btn-outline ita-btn-danger" disabled={busy} onClick={() => void decide("reject")}>
          Rifiuta, non l'abbiamo chiesta noi
        </button>
      </div>
    </article>
  );
}
