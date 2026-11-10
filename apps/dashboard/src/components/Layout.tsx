import type { ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { RequireAuth, useAuth } from "../lib/auth.tsx";
import { Icon } from "./Icon.tsx";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

/** Header .italia (slim + center + nav) con le classi ita-* di @italia-tailwind/css. */
function Header({ tagline, nav, tools }: { tagline: string; nav: NavItem[]; tools: ReactNode }) {
  return (
    <header className="ita-header">
      <div className="ita-header-slim">
        <div className="ita-header-container">
          <a href="https://innovazione.gov.it/dipartimento/" className="ita-header-owner">
            Dipartimento per la Trasformazione Digitale
          </a>
          <div className="flex items-center gap-3">{tools}</div>
        </div>
      </div>
      <div className="ita-header-center ita-header-compact">
        <div className="ita-header-container">
          <div className="ita-header-brand">
            <Link to="/">
              <Icon name="it-code-circle" className="size-10" />
              <span>
                <span className="ita-header-name">Catalogo del software</span>
                <span className="ita-header-tagline">{tagline}</span>
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
                  <NavLink to={item.to} end={item.end}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>
    </header>
  );
}

/** Messaggio passato con navigate(…, { state: { flash } }) dopo un'operazione. */
function Flash() {
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash;
  if (!flash) return null;
  return (
    <div role="status" className="ita-alert ita-alert-success mb-6">
      <div>{flash}</div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-base-300 py-8 text-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap gap-x-6 gap-y-2 px-4">
        <span>Developers Italia · Catalogo del software a riuso</span>
        <a className="ita-link" href="https://developers.italia.it/it/software">
          Catalogo pubblico
        </a>
        <a className="ita-link" href="mailto:contatti@developers.italia.it">
          contatti@developers.italia.it
        </a>
      </div>
    </footer>
  );
}

/** Area pubblica: onboarding delle PA e richieste di software di terze parti. */
export function PublicLayout() {
  const { user } = useAuth();
  return (
    <>
      <Header
        tagline="Onboarding e richieste"
        nav={[
          { to: "/", label: "Onboarding PA", end: true },
          { to: "/terze-parti", label: "Software di terze parti" },
        ]}
        tools={
          <Link to={user ? "/dashboard" : "/accesso"} className="ita-btn ita-btn-xs ita-btn-primary">
            <Icon name={user ? "it-user" : "it-locked"} className="size-4" />
            {user ? "Area riservata" : "Accedi"}
          </Link>
        }
      />
      <main id="main" className="mx-auto max-w-7xl px-4 py-8">
        <Flash />
        <Outlet />
      </main>
      <Footer />
    </>
  );
}

function UserTools() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <>
      <span className="flex items-center gap-2 text-sm">
        <Icon name="it-user" className="size-4" />
        <span className="hidden sm:inline">{user.email}</span>
        <span className={`ita-badge ${isAdmin ? "ita-badge-warning" : "ita-badge-secondary"}`}>{isAdmin ? "Admin" : "Sola lettura"}</span>
      </span>
      <button
        type="button"
        className="ita-btn ita-btn-xs ita-btn-primary"
        onClick={() => void logout().then(() => navigate("/accesso", { state: { flash: "Sei uscito dalla dashboard." } }))}
      >
        <Icon name="it-logout" className="size-4" /> Esci
      </button>
    </>
  );
}

/** Area riservata /dashboard: serve la sessione del magic link. */
export function DashboardLayout() {
  return (
    <RequireAuth>
      <Header
        tagline="Area riservata"
        nav={[
          { to: "/dashboard", label: "Cruscotto", end: true },
          { to: "/dashboard/software", label: "Software" },
          { to: "/dashboard/publishers", label: "Amministrazioni" },
          { to: "/dashboard/richieste", label: "Richieste" },
        ]}
        tools={<UserTools />}
      />
      <main id="main" className="mx-auto max-w-7xl px-4 py-8">
        <Flash />
        <Outlet />
      </main>
      <Footer />
    </RequireAuth>
  );
}
