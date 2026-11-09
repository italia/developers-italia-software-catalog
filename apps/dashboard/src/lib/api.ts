import type { LogDto, Page, PublisherDto, SoftwareDto } from "@sw-catalog/shared";
import { useEffect, useState } from "react";

export type { LogDto, Page, PublisherDto, SoftwareDto };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/v2${path}`, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string; title?: string } | null;
    throw new ApiError(res.status, body?.detail ?? body?.title ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface ListParams {
  page: number;
  pageSize: number;
  q?: string;
  active?: string;
  sort?: string;
  /** Solo software: id o codice IPA del publisher */
  publisher?: string;
}

export function listPath(resource: "software" | "publishers", p: ListParams): string {
  const qs = new URLSearchParams({ "page[number]": String(p.page), "page[size]": String(p.pageSize) });
  if (p.q) qs.set("q", p.q);
  if (p.active) qs.set("active", p.active);
  if (p.sort) qs.set("sort", p.sort);
  if (p.publisher) qs.set("publisher", p.publisher);
  return `/${resource}?${qs}`;
}

interface State<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

/** GET con annullamento della richiesta precedente quando cambia il percorso. */
export function useApi<T>(path: string | null): State<T> {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    get<T>(path, controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error: Error) => {
        if (error.name !== "AbortError") setState({ data: null, error, loading: false });
      });
    return () => controller.abort();
  }, [path]);

  return state;
}
