import { useEffect, useState } from 'react';
import { fetchVocabulary } from '../api/catalogApi';
import type { VocabularyTerm } from '../types';

/** Voci di una lista editoriale dell'API (null finché non arrivano). */
export function useVocabulary(id: string) {
  const [terms, setTerms] = useState<VocabularyTerm[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetchVocabulary(id)
      .then((t) => active && setTerms(t))
      .catch((e: Error) => {
        console.error(`lista ${id}:`, e);
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  return { terms, error };
}
