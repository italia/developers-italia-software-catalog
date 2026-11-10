import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { searchAdministrations } from '../api/elasticsearch';
import { ErrorMessage } from '../components/ErrorMessage';
import Layout from '../components/layout';
import { Spinner } from '../components/Spinner';
import type { Administration } from '../types';
import { labels } from '../utils/i18n';

// Elenco delle amministrazioni del catalogo (/pa), come la pagina /it/pa del vecchio sito.

const softwareCount = (n: number) =>
  `${n} ${n === 1 ? labels.administrations.software_count_one : labels.administrations.software_count_other}`;

/** Per la ricerca: minuscolo e senza accenti */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function AdministrationsPage() {
  const [all, setAll] = useState<Administration[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    searchAdministrations()
      // Solo quelle con software pubblicati: le altre (code hosting da sistemare) sono
      // segnalate nel cruscotto della dashboard; la loro pagina resta raggiungibile.
      .then((admins) => setAll(admins.filter((a) => a.softwareCount > 0)))
      .catch((e: Error) => setError(e.message));
  }, []);

  const shown = useMemo(() => {
    if (!all) return [];
    const needle = fold(q.trim());
    return needle ? all.filter((a) => fold(a.name).includes(needle) || a.ipa.includes(needle)) : all;
  }, [all, q]);

  return (
    <Layout>
      <Helmet>
        <title>{labels.administrations.title} | Catalogo del software | Developers Italia</title>
      </Helmet>
      <main className="container" style={{ marginTop: '2.5rem', marginBottom: '6rem' }}>
        <h1>{labels.administrations.title}</h1>
        <p className="lead">{labels.administrations.intro}</p>

        <div className="form-group mt-5" style={{ maxWidth: '40rem' }}>
          <label htmlFor="pa-search" className="active">
            {labels.administrations.search_label}
          </label>
          <input id="pa-search" type="search" className="form-control" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {error && <ErrorMessage description={error} />}
        {!all && !error && <Spinner />}
        {all && (
          <>
            <h2 className="h5 fw-bold" aria-live="polite">
              {shown.length} {labels.administrations.results}
            </h2>
            <hr />
            {shown.length === 0 ? (
              <p className="mt-4">{labels.administrations.no_results}</p>
            ) : (
              <ul className="row list-unstyled mt-4">
                {shown.map((a) => (
                  <li key={a.ipa} className="col-12 col-md-6 col-lg-4 p-2 d-flex">
                    <div className="it-card rounded shadow-sm border w-100">
                      <div className="it-card-body">
                        <h3 className="it-card-title h5">
                          <Link to={`/pa/${a.ipa}`}>{a.name}</Link>
                        </h3>
                        <p className="it-card-text mb-1">
                          {labels.administrations.ipa_code}: <code>{a.ipa}</code>
                        </p>
                        <p className="it-card-text">{softwareCount(a.softwareCount)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </Layout>
  );
}
