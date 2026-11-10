import type {
  DashboardUserDto,
  IpaEntityDto,
  LogDto,
  OnboardingRequestDto,
  Page,
  PubliccodeCheck,
  PublisherDto,
  SoftwareDto,
  ThirdPartyRequestDto,
} from "@sw-catalog/shared";
import { useCallback, useEffect, useState } from "react";

export type {
  DashboardUserDto,
  IpaEntityDto,
  LogDto,
  OnboardingRequestDto,
  Page,
  PubliccodeCheck,
  PublisherDto,
  SoftwareDto,
  ThirdPartyRequestDto,
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

/**
 * Chiamata all'API v2 sullo stesso sito (proxy di Vite in sviluppo): il cookie di
 * sessione viaggia da solo. Gli errori problem+json diventano ApiError.
 */
export async function api<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/v2${path}`, {
    method,
    signal,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(body !== undefined && { "Content-Type": "application/json" }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const p = (await res.json().catch(() => null)) as { detail?: string; title?: string; issues?: { path: string; message: string }[] } | null;
    const issues = p?.issues ?? [];
    const message = issues.length ? issues.map((i) => i.message).join("; ") : (p?.detail ?? p?.title ?? `HTTP ${res.status}`);
    throw new ApiError(res.status, message, issues);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export interface ListParams {
  page: number;
  pageSize: number;
  q?: string;
  active?: string;
  sort?: string;
  /** Solo software: id o codice IPA del publisher */
  publisher?: string;
  /** Solo richieste */
  status?: string;
}

export function listPath(resource: string, p: ListParams): string {
  const qs = new URLSearchParams({ "page[number]": String(p.page), "page[size]": String(p.pageSize) });
  if (p.q) qs.set("q", p.q);
  if (p.active) qs.set("active", p.active);
  if (p.sort) qs.set("sort", p.sort);
  if (p.publisher) qs.set("publisher", p.publisher);
  if (p.status) qs.set("status", p.status);
  return `/${resource}?${qs}`;
}

interface State<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  /** Ricarica gli stessi dati (dopo una modifica) */
  reload: () => void;
}

/** GET con annullamento della richiesta precedente quando cambia il percorso. */
export function useApi<T>(path: string | null): State<T> {
  const [state, setState] = useState<Omit<State<T>, "reload">>({ data: null, error: null, loading: Boolean(path) });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    api<T>("GET", path, undefined, controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error: Error) => {
        if (error.name !== "AbortError") setState({ data: null, error, loading: false });
      });
    return () => controller.abort();
  }, [path, version]);

  return { ...state, reload };
}
