import data from './mockedResponse.json';
import type { IpaEntity, VocabularyTerm } from '../types';

export const mockResponse = data;

// Liste editoriali e anagrafica IndicePA per VITE_USE_MOCK=true (in produzione arrivano
// dall'API v2: /vocabularies e /ipa-entities). Un estratto, per sviluppare senza backend.
const term = (key: string, labelIt: string | null = key): VocabularyTerm => ({ key, labelIt, labelEn: null });

export const mockVocabularies: Record<string, VocabularyTerm[]> = {
  'pnrr-measures': [
    term('1.2', 'Abilitazione e facilitazione migrazione al Cloud'),
    term('1.4.1', 'Esperienza del Cittadino nei servizi pubblici'),
    term('1.4.3', 'Adozione pagoPA e app IO'),
    term('1.4.4', 'Adozione identità digitale'),
  ],
  'pnrr-targets': [term('Comuni'), term('Scuole'), term('ASL'), term('Enti Regionali'), term('PA Centrali')],
};

export const mockIpaEntities: Record<string, IpaEntity> = {
  cnr: { ipa: 'cnr', description: 'Consiglio Nazionale delle Ricerche', category: 'Pubbliche Amministrazioni', website: 'https://www.cnr.it' },
  pcm: { ipa: 'pcm', description: 'Presidenza del Consiglio dei Ministri', category: 'Pubbliche Amministrazioni', website: 'https://www.governo.it' },
};
