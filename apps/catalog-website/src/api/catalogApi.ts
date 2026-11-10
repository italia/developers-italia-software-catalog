// Chiamate all'API v2 del catalogo (VITE_API_URL): liste editoriali per i filtri e
// anagrafica IndicePA per le pagine delle amministrazioni. I software restano su OpenSearch.
import type { IpaEntity, VocabularyTerm } from '../types';
import { mockIpaEntities, mockVocabularies } from './mockData';

const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

async function get<T>(path: string): Promise<T> {
  if (!API_URL) throw new Error('VITE_API_URL non impostato');
  const res = await fetch(`${API_URL}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`API ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

const vocabularyCache = new Map<string, Promise<VocabularyTerm[]>>();

/** Voci attive di una lista editoriale (es. pnrr-measures), nell'ordine scelto in dashboard. */
export function fetchVocabulary(id: string): Promise<VocabularyTerm[]> {
  let p = vocabularyCache.get(id);
  if (!p) {
    p = USE_MOCK
      ? Promise.resolve(mockVocabularies[id] ?? [])
      : get<{ terms: VocabularyTerm[] }>(`/vocabularies/${encodeURIComponent(id)}`).then((v) => v.terms);
    // Un errore non resta in cache: al prossimo montaggio si riprova
    p.catch(() => vocabularyCache.delete(id));
    vocabularyCache.set(id, p);
  }
  return p;
}

/** Ente dell'anagrafica IndicePA (nome, tipologia, sito istituzionale); null se non c'è. */
export async function fetchIpaEntity(ipa: string): Promise<IpaEntity | null> {
  if (USE_MOCK) return mockIpaEntities[ipa] ?? null;
  try {
    return await get<IpaEntity>(`/ipa-entities/${encodeURIComponent(ipa)}`);
  } catch {
    // L'anagrafica arricchisce la pagina, non è indispensabile
    return null;
  }
}
