import { type ReactColumnDef, SimpleTable, type SortColumn } from "@simple-table/react";
import "@simple-table/react/styles.css";
import { type ReactNode, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { ListParams, Page } from "../lib/api.ts";
import { Pagination } from "./Pagination.tsx";
import { ErrorAlert } from "./States.tsx";

// Righe come le vuole simple-table (oggetti con chiavi stringa).
export type Row = Record<string, unknown>;
export type Column<T> = ReactColumnDef<T & Row>;

interface Props<T> {
  columns: Column<T>[];
  page: Page<T> | null;
  loading: boolean;
  error: Error | null;
  params: ListParams;
  onChange: (patch: Partial<ListParams>) => void;
  searchPlaceholder: string;
  caption: string;
  /** Filtro a tendina: attivi/inattivi (default) o stato delle richieste */
  filter?: "active" | "status" | "none";
  /** Pulsanti accanto ai filtri (es. "Nuovo") */
  actions?: ReactNode;
}

const filters = {
  active: { key: "active", label: "Stato", options: [["", "Tutti"], ["true", "Attivi"], ["false", "Inattivi"]] },
  status: { key: "status", label: "Stato", options: [["", "Tutte"], ["PENDING", "In attesa"], ["APPROVED", "Approvate"], ["REJECTED", "Rifiutate"]] },
} as const;

const parseSort = (sort?: string) =>
  sort ? { column: sort.replace(/^-/, ""), direction: sort.startsWith("-") ? ("desc" as const) : ("asc" as const) } : null;

/**
 * Tabella con @simple-table/react: ordinamento e paginazione lato server (API v2, modalità
 * page[number]), ricerca e filtro sopra, paginazione .italia sotto. Tutto lo stato sta nell'URL.
 */
export function DataTable<T>({ columns, page, loading, error, params, onChange, searchPlaceholder, caption, filter = "active", actions }: Props<T>) {
  const f = filter === "none" ? null : filters[filter];
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(params.q ?? "");

  // Ricerca con debounce di 300ms.
  useEffect(() => {
    if (q === (params.q ?? "")) return;
    const t = setTimeout(() => onChange({ q }), 300);
    return () => clearTimeout(t);
  }, [q, params.q, onChange]);

  const sort = parseSort(params.sort);
  const onSortChange = (s: SortColumn | null) => {
    onChange({ sort: s ? `${s.direction === "desc" ? "-" : ""}${String(s.key.accessor)}` : undefined });
  };

  const total = page?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  const hrefFor = (p: number) => {
    const next = new URLSearchParams(searchParams);
    if (p === 1) next.delete("page");
    else next.set("page", String(p));
    return `?${next}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="ita-field min-w-64 flex-1">
          <label htmlFor="table-search" className="ita-label">
            Cerca
          </label>
          <input
            id="table-search"
            type="search"
            className="ita-input"
            placeholder={searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {f && (
          <div className="ita-field w-48">
            <label htmlFor="table-filter" className="ita-label">
              {f.label}
            </label>
            <select
              id="table-filter"
              className="ita-select"
              value={params[f.key] ?? ""}
              onChange={(e) => onChange({ [f.key]: e.target.value })}
            >
              {f.options.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
        {actions && <div className="ms-auto flex flex-wrap gap-2">{actions}</div>}
      </div>

      {error && <ErrorAlert error={error} />}

      <section className="sw-table" aria-label={caption}>
        <SimpleTable<T & Row>
          // Rimonta la tabella quando cambia l'ordinamento dall'URL, così le frecce restano allineate.
          key={params.sort ?? ""}
          columns={columns}
          rows={(page?.data ?? []) as (T & Row)[]}
          getRowId={({ row }) => String(row.id)}
          theme="light"
          isLoading={loading && !page}
          externalSortHandling
          onSortChange={onSortChange}
          initialSortColumn={sort?.column}
          initialSortDirection={sort?.direction}
          enableVirtualization={false}
          autoExpandColumns
          hoverRowBackground
          tableEmptyStateRenderer="Nessun risultato."
        />
      </section>

      {page && <Pagination page={params.page} totalPages={totalPages} totalItems={total} hrefFor={hrefFor} />}
    </div>
  );
}
