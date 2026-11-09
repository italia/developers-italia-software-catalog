import { Link, useParams } from "react-router";
import { Icon } from "../components/Icon.tsx";
import { ErrorAlert, Loading } from "../components/States.tsx";
import { StatusBadge } from "../components/StatusBadge.tsx";
import { type LogDto, type Page, type SoftwareDto, useApi } from "../lib/api.ts";
import { formatDate, shortUrl } from "../lib/format.ts";

export function SoftwareDetail() {
  const { id } = useParams();
  const software = useApi<SoftwareDto>(`/software/${id}`);
  const logs = useApi<Page<LogDto>>(`/software/${id}/logs?page[size]=10`);

  if (software.loading) return <Loading />;
  if (software.error || !software.data) return <ErrorAlert error={software.error ?? new Error("Software non trovato")} />;
  const s = software.data;

  return (
    <article className="space-y-8">
      <Link to="/software" className="ita-link inline-flex items-center gap-1">
        <Icon name="it-arrow-left" className="size-4" /> Tutti i software
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{s.name ?? "Software senza nome"}</h1>
        <StatusBadge active={s.active} />
      </header>

      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[12rem_1fr]">
        <dt className="font-semibold">Repository</dt>
        <dd>
          <a href={s.url.replace(/\.git$/, "")} className="ita-link break-all" target="_blank" rel="noreferrer">
            {shortUrl(s.url)}
          </a>
        </dd>
        <dt className="font-semibold">Amministrazione</dt>
        <dd>
          {s.publisher ? (
            <Link to={`/publishers/${s.publisher.id}`} className="ita-link">
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
        <dd>
          <code>{s.id}</code>
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

      <section>
        <h2 className="mb-3 text-xl font-bold">publiccode.yml</h2>
        <pre className="max-h-[32rem] overflow-auto rounded-box bg-base-200 p-4 text-sm">{s.publiccodeYml}</pre>
      </section>
    </article>
  );
}
