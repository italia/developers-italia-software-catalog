import { Link, useParams } from "react-router";
import { Icon } from "../components/Icon.tsx";
import { ErrorAlert, Loading } from "../components/States.tsx";
import { StatusBadge } from "../components/StatusBadge.tsx";
import { type PublisherDto, useApi } from "../lib/api.ts";
import { formatDate } from "../lib/format.ts";

export function PublisherDetail() {
  const { id } = useParams();
  const { data: p, loading, error } = useApi<PublisherDto>(`/publishers/${id}`);

  if (loading) return <Loading />;
  if (error || !p) return <ErrorAlert error={error ?? new Error("Amministrazione non trovata")} />;

  return (
    <article className="space-y-8">
      <Link to="/publishers" className="ita-link inline-flex items-center gap-1">
        <Icon name="it-arrow-left" className="size-4" /> Tutte le amministrazioni
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{p.description}</h1>
        <StatusBadge active={p.active} />
      </header>

      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[12rem_1fr]">
        <dt className="font-semibold">Codice IPA</dt>
        <dd>{p.alternativeId ? <code>{p.alternativeId}</code> : "—"}</dd>
        <dt className="font-semibold">Email</dt>
        <dd>{p.email ?? "—"}</dd>
        <dt className="font-semibold">Creato</dt>
        <dd>{formatDate(p.createdAt)}</dd>
        <dt className="font-semibold">Aggiornato</dt>
        <dd>{formatDate(p.updatedAt)}</dd>
        <dt className="font-semibold">ID</dt>
        <dd>
          <code>{p.id}</code>
        </dd>
      </dl>

      <section>
        <h2 className="mb-3 text-xl font-bold">Code hosting</h2>
        <ul className="space-y-2">
          {p.codeHosting.map((ch) => (
            <li key={ch.url} className="flex flex-wrap items-center gap-2">
              <a href={ch.url} className="ita-link break-all" target="_blank" rel="noreferrer">
                {ch.url}
              </a>
              <span className="ita-badge ita-badge-secondary">{ch.group ? "organizzazione" : "singolo repository"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">Software</h2>
        <p>
          {p.softwareCount === 0 ? (
            "Nessun software."
          ) : (
            <Link to={`/software?publisher=${p.id}`} className="ita-link">
              {p.softwareCount === 1 ? "1 software" : `${p.softwareCount} software`} di questa amministrazione
            </Link>
          )}
        </p>
      </section>
    </article>
  );
}
