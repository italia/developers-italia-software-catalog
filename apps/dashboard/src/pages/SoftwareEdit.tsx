import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Checkbox, FormAlert, SelectField, SubmitButton, TextArea, TextField } from "../components/Form.tsx";
import { Icon } from "../components/Icon.tsx";
import { ErrorAlert, Loading } from "../components/States.tsx";
import { api, type Page, type PublisherDto, type SoftwareDto, useApi } from "../lib/api.ts";
import { shortUrl } from "../lib/format.ts";

/** Elenco compatto dei publisher per le tendine (tutti, ordinati per nome). */
export function usePublisherOptions() {
  const [options, setOptions] = useState<PublisherDto[]>([]);
  useEffect(() => {
    // L'API pagina a 100: si leggono le pagine finché ce ne sono (oggi circa 150 publisher).
    (async () => {
      const all: PublisherDto[] = [];
      for (let page = 1; page < 50; page++) {
        const r = await api<Page<PublisherDto>>("GET", `/publishers?page[number]=${page}&page[size]=100&sort=description`);
        all.push(...r.data);
        if (all.length >= (r.meta.total ?? 0) || r.data.length === 0) break;
      }
      setOptions(all);
    })().catch(() => undefined);
  }, []);
  return options;
}

/** Modifica di un software (solo ADMIN): URL, alias, amministrazione, stato, publiccode.yml. */
export function SoftwareEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: s, loading, error } = useApi<SoftwareDto>(`/software/${id}`);
  const publishers = usePublisherOptions();

  const [form, setForm] = useState({ url: "", aliases: "", publisherId: "", active: true, publiccodeYml: "" });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (s) setForm({ url: s.url, aliases: s.aliases.join("\n"), publisherId: s.publisherId ?? "", active: s.active, publiccodeYml: s.publiccodeYml });
  }, [s]);

  if (loading && !s) return <Loading />;
  if (error || !s) return <ErrorAlert error={error ?? new Error("Software non trovato")} />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setSaveError(null);
    try {
      await api("PATCH", `/software/${s.id}`, {
        url: form.url.trim(),
        aliases: form.aliases.split(/\s+/).map((a) => a.trim()).filter(Boolean),
        publisherId: form.publisherId || null,
        active: form.active,
        publiccodeYml: form.publiccodeYml,
      });
      navigate(`/dashboard/software/${s.id}`, { state: { flash: "Software aggiornato." } });
    } catch (err) {
      setSaveError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <article className="space-y-6">
      <Link to={`/dashboard/software/${s.id}`} className="ita-link inline-flex items-center gap-1">
        <Icon name="it-arrow-left" className="size-4" /> Torna al software
      </Link>
      <h1 className="text-3xl font-bold">Modifica {s.name ?? shortUrl(s.url)}</h1>
      <p>
        Il crawler aggiorna ogni notte il publiccode.yml dal repository: le modifiche al file fatte qui valgono fino alla scansione
        successiva. Per escludere un software in modo stabile, disattivalo.
      </p>
      <form className="max-w-3xl space-y-5" onSubmit={(e) => void submit(e)}>
        {saveError && <FormAlert kind="danger">{saveError}</FormAlert>}
        <TextField label="URL del repository" type="url" required value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="max-w-none" />
        <TextArea
          label="Alias"
          hint="Altri URL dello stesso repository (es. dopo un cambio di nome), uno per riga."
          rows={3}
          value={form.aliases}
          onChange={(e) => setForm({ ...form, aliases: e.target.value })}
          className="max-w-none"
        />
        <SelectField
          label="Amministrazione"
          hint="Il publisher nel cui code hosting si trova il repository."
          value={form.publisherId}
          onChange={(e) => setForm({ ...form, publisherId: e.target.value })}
          className="max-w-none"
        >
          <option value="">— nessuna —</option>
          {publishers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.description}
              {p.alternativeId ? ` (${p.alternativeId})` : ""}
            </option>
          ))}
        </SelectField>
        <Checkbox label="Attivo" hint="I software inattivi non compaiono nel catalogo pubblico." checked={form.active} onChange={(active) => setForm({ ...form, active })} />
        <TextArea
          label="publiccode.yml"
          required
          rows={18}
          spellCheck={false}
          className="max-w-none font-mono"
          value={form.publiccodeYml}
          onChange={(e) => setForm({ ...form, publiccodeYml: e.target.value })}
        />
        <div className="flex gap-3">
          <SubmitButton busy={busy}>Salva</SubmitButton>
          <Link to={`/dashboard/software/${s.id}`} className="ita-btn ita-btn-outline ita-btn-primary">
            Annulla
          </Link>
        </div>
      </form>
    </article>
  );
}
