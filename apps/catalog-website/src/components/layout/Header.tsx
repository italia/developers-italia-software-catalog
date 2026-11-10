import { NavLink, Link } from 'react-router-dom';

export default function () {
  return (
    <header className="it-header-wrapper">
      <div className="it-nav-wrapper">
        <div className="it-header-center-wrapper">
          <div className="container-xxl">
            <div className="row">
              <div className="col-12">
                <div className="it-header-center-content-wrapper">
                  <div className="it-brand-wrapper">
                    <Link to="/">
                      <img src="/assets/logo/header-it-logo-white.svg" alt="" className="it-brand-logo" />
                      <div className="it-brand-text"><h1 className="it-brand-title">Catalogo del software</h1><div className="it-brand-tagline d-none d-md-block">Il Catalogo del software a riuso e open source della Pubblica Amministrazione</div></div>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="it-header-navbar-wrapper">
          <div className="container-xxl">
            <div className="row">
              <div className="col-12">
                <nav className="navbar navbar-expand" aria-label="Navigazione principale">
                  <ul className="navbar-nav">
                    <li className="nav-item">
                      <NavLink to="/" end className="nav-link">
                        <span>Software</span>
                      </NavLink>
                    </li>
                    <li className="nav-item">
                      <NavLink to="/pa" className="nav-link">
                        <span>Amministrazioni</span>
                      </NavLink>
                    </li>
                  </ul>
                </nav>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
