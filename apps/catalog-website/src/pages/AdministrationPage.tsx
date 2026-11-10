import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { fetchIpaEntity } from '../api/catalogApi';
import { fetchAdministration, searchSoftwareByAdministration } from '../api/elasticsearch';
import { CatalogueItems } from '../components/catalogue/CatalogueItems';
import { ErrorMessage } from '../components/ErrorMessage';
import Layout from '../components/layout';
import { Spinner } from '../components/Spinner';
import type { CatalogueItem, IpaEntity } from '../types';
import { PAGE_SIZE } from '../utils/constants';
import { labels } from '../utils/i18n';

// Pagina di un'amministrazione (/pa/:ipa), come /it/pa/<ipa> del vecchio sito: nome, codice
// IPA, sito istituzionale e tipologia da IndicePA (API v2), e i software che ha pubblicato.

type State =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; name: string; entity: IpaEntity | null; items: CatalogueItem[]; total: number };

export function AdministrationPage() {
  const ipa = (useParams().ipa ?? '').toLowerCase();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    (async () => {
      const admin = await fetchAdministration(ipa);
      if (!admin) return active && setState({ status: 'not-found' });
      const [entity, page] = await Promise.all([fetchIpaEntity(ipa), searchSoftwareByAdministration(ipa, 0, PAGE_SIZE)]);
      if (active) setState({ status: 'ready', name: admin.name, entity, ...page });
    })().catch((e: Error) => active && setState({ status: 'error', message: e.message }));
    return () => {
      active = false;
    };
  }, [ipa]);

  const loadMore = useCallback(async () => {
    if (state.status !== 'ready') return;
    setLoadingMore(true);
    try {
      const page = await searchSoftwareByAdministration(ipa, state.items.length, PAGE_SIZE);
      setState({ ...state, items: [...state.items, ...page.items] });
    } catch (e) {
      setState({ status: 'error', message: (e as Error).message });
    } finally {
      setLoadingMore(false);
    }
  }, [ipa, state]);

  return (
    <Layout>
      <main className="container" style={{ marginTop: '2.5rem', marginBottom: '6rem' }}>
        <nav aria-label="Percorso di navigazione" className="breadcrumb-container">
          <ol className="breadcrumb">
            <li className="breadcrumb-item">
              <Link to="/">Catalogo</Link>
              <span className="separator">/</span>
            </li>
            <li className="breadcrumb-item">
              <Link to="/pa">{labels.administrations.title}</Link>
              {state.status === 'ready' && <span className="separator">/</span>}
            </li>
            {state.status === 'ready' && (
              <li className="breadcrumb-item active" aria-current="page">
                {state.name}
              </li>
            )}
          </ol>
        </nav>

        {state.status === 'loading' && <Spinner />}
        {state.status === 'error' && <ErrorMessage description={state.message} />}
        {state.status === 'not-found' && (
          <div className="text-center mt-5">
            <Helmet>
              <title>{labels.administrations.not_found} | Developers Italia</title>
            </Helmet>
            <h1 className="h2">{labels.administrations.not_found}</h1>
            <p>{labels.administrations.not_found_text}</p>
            <Link to="/pa" className="btn btn-primary mt-3">
              {labels.administrations.all}
            </Link>
          </div>
        )}
        {state.status === 'ready' && (
          <>
            <Helmet>
              <title>{state.name} | Catalogo del software | Developers Italia</title>
              <meta name="description" content={`Software pubblicati da ${state.name} nel Catalogo del software della PA.`} />
            </Helmet>
            <header className="d-flex align-items-start gap-3 mt-3">
              <svg className="icon icon-xl icon-primary flex-shrink-0" aria-hidden="true">
                <use href="/sprites.svg#it-pa" xlinkHref="/sprites.svg#it-pa" />
              </svg>
              <div>
                <h1>{state.name}</h1>
                <dl className="row mb-0">
                  <dt className="col-auto">{labels.administrations.ipa_code}</dt>
                  <dd className="col-auto">
                    <code>{ipa}</code>
                  </dd>
                  {state.entity?.category && (
                    <>
                      <dt className="col-auto">{labels.administrations.category}</dt>
                      <dd className="col-auto">{state.entity.category}</dd>
                    </>
                  )}
                  {state.entity?.website && (
                    <>
                      <dt className="col-auto">{labels.administrations.website}</dt>
                      <dd className="col-auto">
                        <a href={state.entity.website} target="_blank" rel="noopener noreferrer">
                          {state.entity.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          <span className="visually-hidden"> (si apre in una nuova finestra)</span>
                        </a>
                      </dd>
                    </>
                  )}
                </dl>
              </div>
            </header>

            <h2 className="h4 fw-bold mt-5">
              {labels.administrations.published_software}: {state.total}
            </h2>
            <hr />
            {state.total === 0 ? (
              <p className="mt-4">{labels.administrations.no_software}</p>
            ) : (
              <>
                <CatalogueItems items={state.items} />
                {state.items.length < state.total && (
                  <div className="d-flex w-100 justify-content-center mt-4">
                    <button type="button" className="btn btn-primary" onClick={() => void loadMore()} disabled={loadingMore}>
                      {labels.software.load_more}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </Layout>
  );
}
