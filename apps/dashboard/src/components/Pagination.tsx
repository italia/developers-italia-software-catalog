import { Link } from "react-router";
import { Icon } from "./Icon.tsx";

/** Pagine da mostrare attorno a quella corrente, con 1 e l'ultima sempre visibili. */
function pageWindow(current: number, total: number, visible = 5): (number | "…")[] {
  if (total <= visible + 2) return Array.from({ length: total }, (_, i) => i + 1);
  const half = Math.floor(visible / 2);
  const start = Math.max(2, Math.min(current - half, total - visible));
  const end = Math.min(total - 1, start + visible - 1);
  const pages: (number | "…")[] = [1];
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

interface Props {
  page: number;
  totalPages: number;
  totalItems: number;
  /** Querystring per una pagina, mantenendo gli altri parametri. */
  hrefFor: (page: number) => string;
}

/** Paginazione .italia (ita-pagination) con i link di React Router. */
export function Pagination({ page, totalPages, totalItems, hrefFor }: Props) {
  if (totalPages <= 1) return <p className="ita-pagination-text">Totale {totalItems} elementi</p>;

  const arrow = (target: number, label: string, iconName: "it-chevron-left" | "it-chevron-right") =>
    target < 1 || target > totalPages ? (
      <a className="ita-page-link" role="link" aria-disabled="true">
        <Icon name={iconName} />
        <span className="sr-only">{label}</span>
      </a>
    ) : (
      <Link className="ita-page-link" to={hrefFor(target)}>
        <Icon name={iconName} />
        <span className="sr-only">{label}</span>
      </Link>
    );

  return (
    <nav className="ita-pagination" aria-label="Paginazione">
      <ul>
        <li>{arrow(page - 1, "Pagina precedente", "it-chevron-left")}</li>
        {pageWindow(page, totalPages).map((p, i) =>
          p === "…" ? (
            <li key={`gap-${i}`} className="hidden sm:block">
              <span className="ita-page-link" aria-hidden="true">
                …
              </span>
            </li>
          ) : (
            <li key={p} className={p === page ? undefined : "hidden sm:block"}>
              <Link className="ita-page-link" to={hrefFor(p)} aria-current={p === page ? "page" : undefined}>
                {p === page && <span className="sm:hidden">Pagina&nbsp;</span>}
                {p}
              </Link>
            </li>
          ),
        )}
        <li>{arrow(page + 1, "Pagina successiva", "it-chevron-right")}</li>
      </ul>
      <p className="ita-pagination-text">Totale {totalItems} elementi</p>
    </nav>
  );
}
