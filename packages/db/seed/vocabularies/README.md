# Seed delle liste editoriali

Copie dei file `_data/*.yml` del vecchio sito [developers.italia.it](https://github.com/italia/developers.italia.it)
(BSD-3-Clause), commit `1449cf74` del 10 novembre 2025, nel loro formato originale:

| File | Lista (`vocabularies.id`) |
|---|---|
| `pnrr_measures.yml` | `pnrr-measures` |
| `pnrr_targets.yml` | `pnrr-targets` |
| `software_pa_types.yml` | `software-pa-types` |

`faq.yml` non è stato ripreso: le FAQ andranno nel CMS del nuovo sito developers.italia.it.

Servono solo al primo caricamento (`bun run db:seed:vocabularies`): da lì in poi le liste
si modificano dalla dashboard (`/dashboard/vocabolari`) e questi file non vanno aggiornati.
La conversione è in `src/vocabulary-seed.ts`.
