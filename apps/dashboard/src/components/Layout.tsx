import { Link, NavLink, Outlet } from "react-router";
import { Icon } from "./Icon.tsx";

const nav = [
  { to: "/software", label: "Software" },
  { to: "/publishers", label: "Amministrazioni" },
];

/** Header .italia (slim + center + nav) con le classi ita-* di @italia-tailwind/css. */
export function Layout() {
  return (
    <>
      <header className="ita-header">
        <div className="ita-header-slim">
          <div className="ita-header-container">
            <a href="https://innovazione.gov.it/dipartimento/" className="ita-header-owner">
              Dipartimento per la Trasformazione Digitale
            </a>
          </div>
        </div>
        <div className="ita-header-center ita-header-compact">
          <div className="ita-header-container">
            <div className="ita-header-brand">
              <Link to="/">
                <Icon name="it-code-circle" className="size-10" />
                <span>
                  <span className="ita-header-name">Catalogo del software</span>
                  <span className="ita-header-tagline">Dashboard di gestione</span>
                </span>
              </Link>
            </div>
          </div>
        </div>
        <div className="ita-header-nav">
          <nav aria-label="Navigazione principale">
            <div>
              <ul className="menu menu-horizontal">
                {nav.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to}>{item.label}</NavLink>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </>
  );
}
