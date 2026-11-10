import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CopyButton } from "../components/Copy.tsx";
import { DataTable } from "../components/DataTable.tsx";
import { Icon } from "../components/Icon.tsx";
import { ErrorAlert, Loading } from "../components/States.tsx";
import { StatusBadge } from "../components/StatusBadge.tsx";
import { listPath, type Page, type PublisherDto, type SoftwareDto, useApi } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { formatDate, shortUrl } from "../lib/format.ts";
import { useDeleteDialog } from "../lib/useDeleteDialog.tsx";
import { useListParams } from "../lib/useListParams.ts";
import { softwareColumns } from "./columns.tsx";
import { deletePublisherBody } from "./PublishersList.tsx";

/** Tabella dei software pubblicati dall'amministrazione (filtro ?publisher= fisso). */
function PublishedSoftware({ publisherId }: { publisherId: string }) {
  const { isAdmin } = useAuth();
  const [params, update] = useListParams("-updatedAt");
  const list = useApi<Page<SoftwareDto>>(listPath("software", { ...params, publisher: publisherId }));
  const del = useDeleteDialog<SoftwareDto>({
    title: "Eliminare il software?",
    path: (s) => `/software/${s.id}`,
    body: (s) => (
      <p>
        <strong>{s.name ?? shortUrl(s.url)}</strong> verrà rimosso dal catalogo. Se il repository resta in un code hosting censito, il
        crawler lo ritroverà alla prossima scansione.
      </p>
    ),
    onDeleted: list.reload,
  });
  const columns = useMemo(() => softwareColumns({ isAdmin, onDelete: del.ask, showPublisher: false }), [isAdmin, del.ask]);

  return (
    <>
      <DataTable
        columns={columns}
        page={list.data}
        loading={list.loading}
        error={list.error}
        params={params}
        onChange={update}
        searchPlaceholder="Nome, URL, parola nel publiccode.yml…"
        caption="Software pubblicati dall'amministrazione"
      />
      {del.dialog}
    </>
  );
}

export function PublisherDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { data: p, loading, error } = useApi<PublisherDto>(`/publishers/${id}`);
  const del = useDeleteDialog<PublisherDto>({
    title: "Eliminare l'amministrazione?",
    path: (x) => `/publishers/${x.id}`,
    body: deletePublisherBody,
    onDeleted: (x) => navigate("/dashboard/publishers", { state: { flash: `${x.description} eliminata.` } }),
  });

  if (loading && !p) return <Loading />;
  if (error || !p) return <ErrorAlert error={error ?? new Error("Amministrazione non trovata")} />;

  return (
    <article className="space-y-8">
      <Link to="/dashboard/publishers" className="ita-link inline-flex items-center gap-1">
        <Icon name="it-arrow-left" className="size-4" /> Tutte le amministrazioni
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{p.description}</h1>
        <StatusBadge active={p.active} />
        {isAdmin && (
          <span className="ms-auto flex gap-2">
            <Link to={`/dashboard/publishers/${p.id}/modifica`} className="ita-btn ita-btn-outline ita-btn-primary ita-btn-xs">
              <Icon name="it-pencil" className="size-4" /> Modifica
            </Link>
            <button type="button" className="ita-btn ita-btn-outline ita-btn-danger ita-btn-xs" onClick={() => del.ask(p)}>
              <Icon name="it-delete" className="size-4" /> Elimina
            </button>
          </span>
        )}
      </header>

      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[12rem_1fr]">
        <dt className="font-semibold">Codice IPA</dt>
        <dd className="flex items-center gap-1">{p.alternativeId ? <><code>{p.alternativeId}</code><CopyButton value={p.alternativeId} label="il codice IPA" /></> : "—"}</dd>
        <dt className="font-semibold">Email</dt>
        <dd className="flex items-center gap-1">{p.email ? <>{p.email}<CopyButton value={p.email} label="l'email" /></> : "—"}</dd>
        <dt className="font-semibold">Creato</dt>
        <dd>{formatDate(p.createdAt)}</dd>
        <dt className="font-semibold">Aggiornato</dt>
        <dd>{formatDate(p.updatedAt)}</dd>
        <dt className="font-semibold">ID</dt>
        <dd className="flex items-center gap-1">
          <code>{p.id}</code>
          <CopyButton value={p.id} label="l'ID" />
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
              <CopyButton value={ch.url} label="l'URL" />
              <span className="ita-badge ita-badge-secondary">{ch.group ? "organizzazione" : "singolo repository"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="software" aria-labelledby="software-title">
        <h2 id="software-title" className="mb-3 text-xl font-bold">
          Software pubblicati <span className="ita-badge ita-badge-primary align-middle">{p.softwareCount}</span>
        </h2>
        {p.softwareCount === 0 ? <p>Nessun software pubblicato.</p> : <PublishedSoftware publisherId={p.id} />}
      </section>
      {del.dialog}
    </article>
  );
}
