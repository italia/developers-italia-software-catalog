import { useMemo } from "react";
import { Link } from "react-router";
import { DataTable } from "../components/DataTable.tsx";
import { Icon } from "../components/Icon.tsx";
import { listPath, type Page, type PublisherDto, type SoftwareDto, useApi } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { shortUrl } from "../lib/format.ts";
import { useDeleteDialog } from "../lib/useDeleteDialog.tsx";
import { useListParams } from "../lib/useListParams.ts";
import { softwareColumns } from "./columns.tsx";

export function SoftwareList() {
  const { isAdmin } = useAuth();
  const [params, update] = useListParams("-updatedAt");
  const list = useApi<Page<SoftwareDto>>(listPath("software", params));
  // Nome del publisher filtrato, per l'etichetta del filtro.
  const filtered = useApi<PublisherDto>(params.publisher ? `/publishers/${encodeURIComponent(params.publisher)}` : null);

  const del = useDeleteDialog<SoftwareDto>({
    title: "Eliminare il software?",
    path: (s) => `/software/${s.id}`,
    body: (s) => (
      <p>
        <strong>{s.name ?? shortUrl(s.url)}</strong> verrà rimosso dal catalogo con i suoi URL. Se il repository resta in un code
        hosting censito, il crawler lo ritroverà alla prossima scansione: per escluderlo in modo stabile conviene disattivarlo.
      </p>
    ),
    onDeleted: list.reload,
  });
  const columns = useMemo(() => softwareColumns({ isAdmin, onDelete: del.ask }), [isAdmin, del.ask]);

  return (
    <>
      <h1 className="mb-2 text-3xl font-bold">Software</h1>
      <p className="mb-6">Software del catalogo. La ricerca guarda URL e contenuto del publiccode.yml.</p>
      {params.publisher && (
        <p className="mb-4 flex flex-wrap items-center gap-2">
          <span>Amministrazione:</span>
          <span className="ita-chip ita-chip-primary">
            <span>{filtered.data?.description ?? params.publisher}</span>
            <button type="button" className="ita-chip-close" aria-label="Togli il filtro per amministrazione" onClick={() => update({ publisher: undefined })}>
              ×
            </button>
          </span>
        </p>
      )}
      <DataTable
        columns={columns}
        page={list.data}
        loading={list.loading}
        error={list.error}
        params={params}
        onChange={update}
        searchPlaceholder="Nome, URL, parola nel publiccode.yml…"
        caption="Elenco dei software"
        actions={
          isAdmin && (
            <Link to="/dashboard/software/terze-parti" className="ita-btn ita-btn-primary">
              <Icon name="it-plus" /> Software di terze parti
            </Link>
          )
        }
      />
      {del.dialog}
    </>
  );
}
