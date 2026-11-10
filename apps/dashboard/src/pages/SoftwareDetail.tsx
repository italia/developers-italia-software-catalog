import { Link, useNavigate, useParams } from "react-router";
import { CopyButton } from "../components/Copy.tsx";
import { Icon } from "../components/Icon.tsx";
import { PubliccodePanel } from "../components/PubliccodePanel.tsx";
import { ErrorAlert, Loading } from "../components/States.tsx";
import { StatusBadge } from "../components/StatusBadge.tsx";
import { type LogDto, type Page, type SoftwareDto, useApi } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { formatDate, repoHref, shortUrl } from "../lib/format.ts";
import { useDeleteDialog } from "../lib/useDeleteDialog.tsx";

export function SoftwareDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const software = useApi<SoftwareDto>(`/software/${id}`);
  const logs = useApi<Page<LogDto>>(`/software/${id}/logs?page[size]=10`);
  const del = useDeleteDialog<SoftwareDto>({
    title: "Eliminare il software?",
    path: (x) => `/software/${x.id}`,
    body: (x) => (
      <p>
        <strong>{x.name ?? shortUrl(x.url)}</strong> verrà rimosso dal catalogo con i suoi URL. Se il repository resta in un code hosting
        censito, il crawler lo ritroverà alla prossima scansione: per escluderlo in modo stabile conviene disattivarlo.
      </p>
    ),
    onDeleted: (x) => navigate("/dashboard/software", { state: { flash: `${x.name ?? shortUrl(x.url)} eliminato.` } }),
  });

  if (software.loading && !software.data) return <Loading />;
  if (software.error || !software.data) return <ErrorAlert error={software.error ?? new Error("Software non trovato")} />;
  const s = software.data;

  return (
    <article className="space-y-8">
      <Link to="/dashboard/software" className="ita-link inline-flex items-center gap-1">
        <Icon name="it-arrow-left" className="size-4" /> Tutti i software
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{s.name ?? "Software senza nome"}</h1>
        <StatusBadge active={s.active} />
        {isAdmin && (
          <span className="ms-auto flex gap-2">
            <Link to={`/dashboard/software/${s.id}/modifica`} className="ita-btn ita-btn-outline ita-btn-primary ita-btn-xs">
              <Icon name="it-pencil" className="size-4" /> Modifica
            </Link>
            <button type="button" className="ita-btn ita-btn-outline ita-btn-danger ita-btn-xs" onClick={() => del.ask(s)}>
              <Icon name="it-delete" className="size-4" /> Elimina
            </button>
          </span>
        )}
      </header>

      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[12rem_1fr]">
        <dt className="font-semibold">Repository</dt>
        <dd className="flex items-center gap-1">
          <a href={repoHref(s.url)} className="ita-link break-all" target="_blank" rel="noreferrer">
            {shortUrl(s.url)}
          </a>
          <CopyButton value={repoHref(s.url)} label="l'URL del repository" />
        </dd>
        <dt className="font-semibold">Amministrazione</dt>
        <dd>
          {s.publisher ? (
            <Link to={`/dashboard/publishers/${s.publisher.id}`} className="ita-link">
              {s.publisher.description}
            </Link>
          ) : (
            "non nota"
          )}
          {s.publisher?.alternativeId && <code className="ml-2">{s.publisher.alternativeId}</code>}
        </dd>
        <dt className="font-semibold">Alias</dt>
        <dd>{s.aliases.length ? <ul>{s.aliases.map((a) => <li key={a} className="break-all">{a}</li>)}</ul> : "—"}</dd>
        <dt className="font-semibold">Vitalità</dt>
        <dd>{s.vitality ?? "non calcolata"}</dd>
        <dt className="font-semibold">Creato</dt>
        <dd>{formatDate(s.createdAt)}</dd>
        <dt className="font-semibold">Aggiornato</dt>
        <dd>{formatDate(s.updatedAt)}</dd>
        <dt className="font-semibold">ID</dt>
        <dd className="flex items-center gap-1">
          <code>{s.id}</code>
          <CopyButton value={s.id} label="l'ID" />
        </dd>
      </dl>

      <section>
        <h2 className="mb-3 text-xl font-bold">Log del crawler</h2>
        {logs.loading && <Loading />}
        {logs.data && logs.data.data.length === 0 && <p>Nessun log.</p>}
        <ul className="space-y-3">
          {logs.data?.data.map((log) => (
            <li key={log.id} className="rounded-box border border-base-300 p-3">
              <p className="mb-1 text-sm font-semibold">{formatDate(log.createdAt)}</p>
              <pre className="overflow-x-auto text-sm whitespace-pre-wrap">{log.message}</pre>
            </li>
          ))}
        </ul>
      </section>

      <PubliccodePanel softwareId={s.id} yaml={s.publiccodeYml} />
      {del.dialog}
    </article>
  );
}
