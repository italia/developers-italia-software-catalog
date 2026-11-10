import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import type { ListParams } from "./api.ts";

/** Stato della tabella (pagina, ricerca, filtro, ordinamento) nell'URL, così è condivisibile. */
export function useListParams(defaultSort: string) {
  const [params, setParams] = useSearchParams();

  const value: ListParams = useMemo(
    () => ({
      page: Math.max(1, Number(params.get("page") ?? 1)),
      pageSize: Number(params.get("size") ?? 25),
      q: params.get("q") ?? "",
      active: params.get("active") ?? "",
      sort: params.get("sort") ?? defaultSort,
      publisher: params.get("publisher") ?? "",
      status: params.get("status") ?? "",
    }),
    [params, defaultSort],
  );

  const update = useCallback(
    (patch: Partial<ListParams>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          // Cambiare ricerca, filtro o ordinamento riporta alla prima pagina.
          if (!("page" in patch)) next.delete("page");
          const keys = { page: "page", pageSize: "size", q: "q", active: "active", sort: "sort", publisher: "publisher", status: "status" } as const;
          for (const [k, v] of Object.entries(patch) as [keyof ListParams, string | number | undefined][]) {
            const key = keys[k];
            if (v === undefined || v === "" || (k === "page" && v === 1)) next.delete(key);
            else next.set(key, String(v));
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return [value, update] as const;
}
