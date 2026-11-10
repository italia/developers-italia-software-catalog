import { useMemo } from "react";
import { Link } from "react-router";
import { DataTable } from "../components/DataTable.tsx";
import { Icon } from "../components/Icon.tsx";
import { listPath, type Page, type PublisherDto, useApi } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useDeleteDialog } from "../lib/useDeleteDialog.tsx";
import { useListParams } from "../lib/useListParams.ts";
import { publisherColumns } from "./columns.tsx";

export function deletePublisherBody(p: PublisherDto) {
  return (
    <p>
      <strong>{p.description}</strong> verrà eliminata
      {p.codeHosting.length === 1 ? " con il suo code hosting." : ` con i suoi ${p.codeHosting.length} code hosting.`}
      {p.softwareCount === 1 && " Il suo software resta nel catalogo, senza amministrazione."}
      {p.softwareCount > 1 && ` I suoi ${p.softwareCount} software restano nel catalogo, senza amministrazione.`}
    </p>
  );
}

export function PublishersList() {
  const { isAdmin } = useAuth();
  const [params, update] = useListParams("description");
  const list = useApi<Page<PublisherDto>>(listPath("publishers", params));

  const del = useDeleteDialog<PublisherDto>({
    title: "Eliminare l'amministrazione?",
    path: (p) => `/publishers/${p.id}`,
    body: deletePublisherBody,
    onDeleted: list.reload,
  });
  const columns = useMemo(() => publisherColumns({ isAdmin, onDelete: del.ask }), [isAdmin, del.ask]);

  return (
    <>
      <h1 className="mb-2 text-3xl font-bold">Amministrazioni</h1>
      <p className="mb-6">Publisher del catalogo: enti e organizzazioni con i loro code hosting.</p>
      <DataTable
        columns={columns}
        page={list.data}
        loading={list.loading}
        error={list.error}
        params={params}
        onChange={update}
        searchPlaceholder="Nome, codice IPA, email, URL…"
        caption="Elenco delle amministrazioni"
        actions={
          isAdmin && (
            <Link to="/dashboard/publishers/nuova" className="ita-btn ita-btn-primary">
              <Icon name="it-plus" /> Nuova organizzazione
            </Link>
          )
        }
      />
      {del.dialog}
    </>
  );
}
