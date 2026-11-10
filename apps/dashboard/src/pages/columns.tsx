import { Link } from "react-router";
import { CopyCell } from "../components/Copy.tsx";
import type { Column } from "../components/DataTable.tsx";
import { RowActions } from "../components/RowActions.tsx";
import { StatusBadge } from "../components/StatusBadge.tsx";
import type { PublisherDto, SoftwareDto } from "../lib/api.ts";
import { formatDate, repoHref, shortUrl } from "../lib/format.ts";

interface Opts<T> {
  isAdmin: boolean;
  onDelete: (row: T) => void;
}

const actionsColumn = <T extends { id: string }>(label: (r: T) => string, editTo: (r: T) => string, onDelete: (r: T) => void): Column<T> => ({
  accessor: "_actions",
  label: "Azioni",
  width: 96,
  // Sempre visibile anche quando la tabella scorre in orizzontale.
  pinned: "right",
  cellRenderer: ({ row }) => <RowActions editTo={editTo(row as T)} label={label(row as T)} onDelete={() => onDelete(row as T)} />,
});

// Ordinabili solo i campi che l'API v2 sa ordinare (createdAt, updatedAt).
export function softwareColumns({ isAdmin, onDelete, showPublisher = true }: Opts<SoftwareDto> & { showPublisher?: boolean }): Column<SoftwareDto>[] {
  const cols: Column<SoftwareDto>[] = [
    {
      accessor: "name",
      label: "Nome",
      width: "1fr",
      minWidth: 200,
      cellRenderer: ({ row }) => (
        <CopyCell value={row.name} label="il nome">
          <Link to={`/dashboard/software/${row.id}`} className="ita-link font-semibold">
            {row.name ?? <em>senza nome</em>}
          </Link>
        </CopyCell>
      ),
    },
    {
      accessor: "url",
      label: "Repository",
      width: "1.4fr",
      minWidth: 240,
      cellRenderer: ({ row }) => (
        <CopyCell value={repoHref(row.url)} label="l'URL del repository">
          <a href={repoHref(row.url)} className="ita-link truncate" target="_blank" rel="noreferrer">
            {shortUrl(row.url)}
          </a>
        </CopyCell>
      ),
    },
  ];
  if (showPublisher) {
    cols.push({
      accessor: "publisher",
      label: "Amministrazione",
      width: "1fr",
      minWidth: 200,
      cellRenderer: ({ row }) =>
        row.publisher ? (
          <CopyCell value={row.publisher.description} label="il nome dell'amministrazione">
            <Link to={`/dashboard/publishers/${row.publisher.id}`} className="ita-link truncate" title={row.publisher.description}>
              {row.publisher.description}
            </Link>
          </CopyCell>
        ) : (
          "—"
        ),
    });
  }
  cols.push(
    { accessor: "active", label: "Stato", width: 100, cellRenderer: ({ row }) => <StatusBadge active={row.active} /> },
    { accessor: "createdAt", label: "Creato", width: 160, sortable: true, cellRenderer: ({ row }) => formatDate(row.createdAt) },
    { accessor: "updatedAt", label: "Aggiornato", width: 160, sortable: true, cellRenderer: ({ row }) => formatDate(row.updatedAt) },
    {
      accessor: "id",
      label: "ID",
      width: 110,
      cellRenderer: ({ row }) => (
        <CopyCell value={row.id} label="l'ID">
          <code className="truncate text-xs" title={row.id}>
            {row.id.slice(0, 8)}…
          </code>
        </CopyCell>
      ),
    },
  );
  if (isAdmin) cols.push(actionsColumn<SoftwareDto>((r) => r.name ?? shortUrl(r.url), (r) => `/dashboard/software/${r.id}/modifica`, onDelete));
  return cols;
}

// Ordinabili solo i campi che l'API v2 sa ordinare (description, createdAt, updatedAt, softwareCount).
export function publisherColumns({ isAdmin, onDelete }: Opts<PublisherDto>): Column<PublisherDto>[] {
  const cols: Column<PublisherDto>[] = [
    {
      accessor: "description",
      label: "Amministrazione",
      width: "1.5fr",
      minWidth: 240,
      sortable: true,
      cellRenderer: ({ row }) => (
        <CopyCell value={row.description} label="il nome">
          <Link to={`/dashboard/publishers/${row.id}`} className="ita-link font-semibold">
            {row.description}
          </Link>
        </CopyCell>
      ),
    },
    {
      accessor: "alternativeId",
      label: "Codice IPA",
      width: 140,
      cellRenderer: ({ row }) => (
        <CopyCell value={row.alternativeId} label="il codice IPA">
          {row.alternativeId ? <code>{row.alternativeId}</code> : "—"}
        </CopyCell>
      ),
    },
    {
      accessor: "codeHosting",
      label: "Code hosting",
      width: "1fr",
      minWidth: 220,
      cellRenderer: ({ row }) => (
        <CopyCell value={row.codeHosting[0]?.url} label="l'URL del code hosting">
          <span className="truncate" title={row.codeHosting.map((ch) => ch.url).join("\n")}>
            {row.codeHosting[0] ? shortUrl(row.codeHosting[0].url) : "—"}
            {row.codeHosting.length > 1 && <span className="ita-badge ita-badge-secondary ml-2">+{row.codeHosting.length - 1}</span>}
          </span>
        </CopyCell>
      ),
    },
    {
      accessor: "email",
      label: "Email",
      width: 180,
      cellRenderer: ({ row }) => (
        <CopyCell value={row.email} label="l'email">
          <span className="truncate">{row.email ?? "—"}</span>
        </CopyCell>
      ),
    },
    {
      accessor: "softwareCount",
      label: "Software",
      width: 100,
      align: "right",
      sortable: true,
      cellRenderer: ({ row }) =>
        row.softwareCount ? (
          <Link to={`/dashboard/publishers/${row.id}#software`} className="ita-link">
            {row.softwareCount}
          </Link>
        ) : (
          "0"
        ),
    },
    { accessor: "active", label: "Stato", width: 100, cellRenderer: ({ row }) => <StatusBadge active={row.active} /> },
    { accessor: "updatedAt", label: "Aggiornato", width: 150, sortable: true, cellRenderer: ({ row }) => formatDate(row.updatedAt) },
  ];
  if (isAdmin) cols.push(actionsColumn<PublisherDto>((r) => r.description, (r) => `/dashboard/publishers/${r.id}/modifica`, onDelete));
  return cols;
}
