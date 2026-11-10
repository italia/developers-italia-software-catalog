import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Checkbox, FormAlert, SubmitButton, TextField } from "../components/Form.tsx";
import { Icon } from "../components/Icon.tsx";
import { IpaSearch } from "../components/IpaSearch.tsx";
import { ErrorAlert, Loading } from "../components/States.tsx";
import { api, type IpaEntityDto, type PublisherDto, useApi } from "../lib/api.ts";

interface Hosting {
  url: string;
  group: boolean;
}

/**
 * Nuova organizzazione o modifica (solo ADMIN). Per una PA il codice IPA si sceglie
 * dall'anagrafica IndicePA, che precompila nome ed email; le organizzazioni non PA
 * (software di terze parti) non hanno codice IPA.
 */
export function PublisherForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const current = useApi<PublisherDto>(editing ? `/publishers/${id}` : null);

  const [kind, setKind] = useState<"pa" | "other">("pa");
  const [entity, setEntity] = useState<IpaEntityDto | null>(null);
  const [alternativeId, setAlternativeId] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [active, setActive] = useState(true);
  const [hosting, setHosting] = useState<Hosting[]>([{ url: "", group: true }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = current.data;
    if (!p) return;
    setKind(p.alternativeId ? "pa" : "other");
    setAlternativeId(p.alternativeId ?? "");
    setDescription(p.description);
    setEmail(p.email ?? "");
    setActive(p.active);
    setHosting(p.codeHosting.length ? p.codeHosting.map((h) => ({ ...h })) : [{ url: "", group: true }]);
  }, [current.data]);

  if (editing && current.loading && !current.data) return <Loading />;
  if (editing && (current.error || !current.data)) return <ErrorAlert error={current.error ?? new Error("Amministrazione non trovata")} />;

  const chooseEntity = (e: IpaEntityDto | null) => {
    setEntity(e);
    if (!e) return;
    setAlternativeId(e.ipa);
    setDescription(e.description);
    if (!email && e.pec[0]) setEmail(e.pec[0]);
  };

  const setRow = (i: number, patch: Partial<Hosting>) => setHosting((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const codeHosting = hosting.map((h) => ({ url: h.url.trim(), group: h.group })).filter((h) => h.url);
    if (codeHosting.length === 0) return setError("Serve almeno un code hosting.");
    if (kind === "pa" && !alternativeId) return setError("Scegli l'ente dall'anagrafica IndicePA.");
    setBusy(true);
    const body = {
      description: description.trim(),
      email: email.trim() || null,
      alternativeId: kind === "pa" ? alternativeId : null,
      active,
      codeHosting,
    };
    try {
      const saved = editing ? await api<PublisherDto>("PATCH", `/publishers/${id}`, body) : await api<PublisherDto>("POST", "/publishers", body);
      navigate(`/dashboard/publishers/${saved.id}`, { state: { flash: editing ? "Organizzazione aggiornata." : "Organizzazione creata." } });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const back = editing ? `/dashboard/publishers/${id}` : "/dashboard/publishers";

  return (
    <article className="max-w-3xl space-y-6">
      <Link to={back} className="ita-link inline-flex items-center gap-1">
        <Icon name="it-arrow-left" className="size-4" /> {editing ? "Torna all'organizzazione" : "Tutte le amministrazioni"}
      </Link>
      <h1 className="text-3xl font-bold">{editing ? `Modifica ${current.data?.description}` : "Nuova organizzazione"}</h1>
      {!editing && (
        <p>
          Le pubbliche amministrazioni di solito entrano con l'<Link to="/" className="ita-link">onboarding</Link>, che verifica la richiesta
          tramite PEC. Da qui si possono aggiungere direttamente amministrazioni e organizzazioni non PA, per esempio chi pubblica software
          di terze parti.
        </p>
      )}

      <form className="space-y-6" onSubmit={(e) => void submit(e)}>
        {error && <FormAlert kind="danger">{error}</FormAlert>}

        <fieldset className="ita-choice-group">
          <legend className="ita-legend">Tipo</legend>
          <div className="ita-choice-list ita-choice-list-inline">
            <label className="ita-choice">
              <input type="radio" className="ita-radio" name="kind" checked={kind === "pa"} onChange={() => setKind("pa")} />
              <span className="ita-choice-text">Pubblica amministrazione (con codice IPA)</span>
            </label>
            <label className="ita-choice">
              <input type="radio" className="ita-radio" name="kind" checked={kind === "other"} onChange={() => setKind("other")} />
              <span className="ita-choice-text">Altra organizzazione</span>
            </label>
          </div>
        </fieldset>

        {kind === "pa" && (
          <div className="space-y-2">
            <IpaSearch
              label="Ente in IndicePA"
              hint="Cerca per nome, codice IPA o codice fiscale: nome ed email vengono precompilati."
              required={!alternativeId}
              value={entity}
              onChange={chooseEntity}
            />
            {alternativeId && (
              <p>
                Codice IPA: <code>{alternativeId}</code>
              </p>
            )}
          </div>
        )}

        <TextField label="Nome" required value={description} onChange={(e) => setDescription(e.target.value)} className="max-w-none" />
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} hint="Per le PA di solito la PEC." />

        <fieldset className="space-y-3">
          <legend className="ita-legend">Code hosting</legend>
          <p className="ita-hint">
            URL di un'organizzazione o gruppo (GitHub, GitLab, Bitbucket, Gitea) oppure di un singolo repository. Il crawler scandisce
            tutti i repository delle organizzazioni.
          </p>
          {hosting.map((h, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <TextField
                label={`URL ${i + 1}`}
                type="url"
                required={i === 0}
                className="flex-1"
                placeholder="https://github.com/organizzazione"
                value={h.url}
                onChange={(e) => setRow(i, { url: e.target.value })}
              />
              <label className="ita-choice mb-2">
                <input type="checkbox" className="ita-checkbox" checked={h.group} onChange={(e) => setRow(i, { group: e.target.checked })} />
                <span className="ita-choice-text">Organizzazione</span>
              </label>
              {hosting.length > 1 && (
                <button
                  type="button"
                  className="ita-btn ita-btn-ghost ita-btn-square mb-1 text-error"
                  aria-label={`Togli l'URL ${i + 1}`}
                  onClick={() => setHosting((rows) => rows.filter((_, j) => j !== i))}
                >
                  <Icon name="it-delete" />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="ita-btn ita-btn-outline ita-btn-primary ita-btn-xs" onClick={() => setHosting((rows) => [...rows, { url: "", group: true }])}>
            <Icon name="it-plus" className="size-4" /> Aggiungi un URL
          </button>
        </fieldset>

        <Checkbox label="Attiva" hint="Il crawler scandisce solo le organizzazioni attive." checked={active} onChange={setActive} />

        <div className="flex gap-3">
          <SubmitButton busy={busy}>{editing ? "Salva" : "Crea organizzazione"}</SubmitButton>
          <Link to={back} className="ita-btn ita-btn-outline ita-btn-primary">
            Annulla
          </Link>
        </div>
      </form>
    </article>
  );
}
