import { Link } from "react-router";
import { type Column, DataTable } from "../components/DataTable.tsx";
import { StatusBadge } from "../components/StatusBadge.tsx";
import { listPath, type Page, type PublisherDto, type SoftwareDto, useApi } from "../lib/api.ts";
import { formatDate, shortUrl } from "../lib/format.ts";
import { useListParams } from "../lib/useListParams.ts";

// Ordinabili solo i campi che l'API v2 sa ordinare (createdAt, updatedAt).
const columns: Column<SoftwareDto>[] = [
  {
    accessor: "name",
    label: "Nome",
    width: "1fr",
    minWidth: 200,
    cellRenderer: ({ row }) => (
      <Link to={`/software/${row.id}`} className="ita-link font-semibold">
        {row.name ?? <em>senza nome</em>}
      </Link>
    ),
  },
  {
    accessor: "url",
    label: "Repository",
    width: "1.4fr",
    minWidth: 240,
    cellRenderer: ({ row }) => (
      <a href={row.url.replace(/\.git$/, "")} className="ita-link truncate" target="_blank" rel="noreferrer">
        {shortUrl(row.url)}
      </a>
    ),
  },
  {
    accessor: "publisher",
    label: "Amministrazione",
    width: "1fr",
    minWidth: 200,
    cellRenderer: ({ row }) =>
      row.publisher ? (
        <Link to={`/publishers/${row.publisher.id}`} className="ita-link truncate" title={row.publisher.description}>
          {row.publisher.description}
        </Link>
      ) : (
        "—"
      ),
  },
  { accessor: "active", label: "Stato", width: 100, cellRenderer: ({ row }) => <StatusBadge active={row.active} /> },
  { accessor: "createdAt", label: "Creato", width: 170, sortable: true, cellRenderer: ({ row }) => formatDate(row.createdAt) },
  { accessor: "updatedAt", label: "Aggiornato", width: 170, sortable: true, cellRenderer: ({ row }) => formatDate(row.updatedAt) },
];

export function SoftwareList() {
  const [params, update] = useListParams("-updatedAt");
  const { data, loading, error } = useApi<Page<SoftwareDto>>(listPath("software", params));
  // Nome del publisher filtrato, per l'etichetta del filtro.
  const filtered = useApi<PublisherDto>(params.publisher ? `/publishers/${encodeURIComponent(params.publisher)}` : null);

  return (
    <>
      <h1 className="mb-2 text-3xl font-bold">Software</h1>
      <p className="mb-6">Software del catalogo, letti dall'API v2. La ricerca guarda URL e contenuto del publiccode.yml.</p>
      {params.publisher && (
        <p className="mb-4 flex flex-wrap items-center gap-2">
          <span>Amministrazione:</span>
          <span className="ita-chip ita-chip-primary">
            <span>{filtered.data?.description ?? params.publisher}</span>
            <button
              type="button"
              className="ita-chip-close"
              aria-label="Togli il filtro per amministrazione"
              onClick={() => update({ publisher: undefined })}
            >
              ×
            </button>
          </span>
        </p>
      )}
      <DataTable
        columns={columns}
        page={data}
        loading={loading}
        error={error}
        params={params}
        onChange={update}
        searchPlaceholder="Nome, URL, parola nel publiccode.yml…"
        caption="Elenco dei software"
      />
    </>
  );
}
