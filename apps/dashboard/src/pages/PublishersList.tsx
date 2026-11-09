import { Link } from "react-router";
import { type Column, DataTable } from "../components/DataTable.tsx";
import { StatusBadge } from "../components/StatusBadge.tsx";
import { listPath, type Page, type PublisherDto, useApi } from "../lib/api.ts";
import { formatDate, shortUrl } from "../lib/format.ts";
import { useListParams } from "../lib/useListParams.ts";

// Ordinabili solo i campi che l'API v2 sa ordinare (description, createdAt, updatedAt, softwareCount).
const columns: Column<PublisherDto>[] = [
  {
    accessor: "description",
    label: "Amministrazione",
    width: "1.5fr",
    minWidth: 240,
    sortable: true,
    cellRenderer: ({ row }) => (
      <Link to={`/publishers/${row.id}`} className="ita-link font-semibold">
        {row.description}
      </Link>
    ),
  },
  {
    accessor: "alternativeId",
    label: "Codice IPA",
    width: 130,
    cellRenderer: ({ row }) => (row.alternativeId ? <code>{row.alternativeId}</code> : "—"),
  },
  {
    accessor: "codeHosting",
    label: "Code hosting",
    width: "1fr",
    minWidth: 220,
    cellRenderer: ({ row }) => (
      <span className="truncate" title={row.codeHosting.map((ch) => ch.url).join("\n")}>
        {row.codeHosting[0] ? shortUrl(row.codeHosting[0].url) : "—"}
        {row.codeHosting.length > 1 && (
          <span className="ita-badge ita-badge-secondary ml-2">+{row.codeHosting.length - 1}</span>
        )}
      </span>
    ),
  },
  {
    accessor: "softwareCount",
    label: "Software",
    width: 110,
    align: "right",
    sortable: true,
    cellRenderer: ({ row }) =>
      row.softwareCount ? (
        <Link to={`/software?publisher=${row.id}`} className="ita-link">
          {row.softwareCount}
        </Link>
      ) : (
        "0"
      ),
  },
  { accessor: "active", label: "Stato", width: 100, cellRenderer: ({ row }) => <StatusBadge active={row.active} /> },
  { accessor: "updatedAt", label: "Aggiornato", width: 170, sortable: true, cellRenderer: ({ row }) => formatDate(row.updatedAt) },
];

export function PublishersList() {
  const [params, update] = useListParams("description");
  const { data, loading, error } = useApi<Page<PublisherDto>>(listPath("publishers", params));

  return (
    <>
      <h1 className="mb-2 text-3xl font-bold">Amministrazioni</h1>
      <p className="mb-6">Publisher del catalogo: enti e organizzazioni con i loro code hosting.</p>
      <DataTable
        columns={columns}
        page={data}
        loading={loading}
        error={error}
        params={params}
        onChange={update}
        searchPlaceholder="Nome, codice IPA, email, URL…"
        caption="Elenco delle amministrazioni"
      />
    </>
  );
}
