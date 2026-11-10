# Catalogo Software

A web application for browsing the Italian public software catalogue, built with React, Vite, and Bootstrap Italia.

**Live preview:** https://catalogo-software.vercel.app/

## Prerequisites

- [Bun](https://bun.sh/) v1.3.14+ (or any other package manager: npm, yarn, pnpm)

## Getting Started

1. Create a `.env` file from the sample:

   ```sh
   cp .env.sample .env
   ```

2. Install dependencies:

   ```sh
   bun install
   ```

3. Start the development server:

   ```sh
   bun run dev
   ```

   The app will be available at `http://localhost:3000`.

## Environment Variables

| Variable                 | Description                                    | Default                                   |
| ------------------------ | ---------------------------------------------- | ----------------------------------------- |
| `VITE_ELASTICSEARCH_URL` | OpenSearch endpoint for the software catalogue | `https://opensearch.developers.italia.it` |
| `VITE_USE_MOCK`          | Use mocked data instead of live API calls      | `true`                                    |
| `VITE_API_URL`           | Catalog API v2 (PNRR filter lists, IndicePA data for administration pages) | — |

To use live API calls instead of mocked data, set `VITE_USE_MOCK=false` in your `.env` file. Note that CORS from `localhost` may need to be enabled on the API side.

## Pages

| Path | Content | Data |
|---|---|---|
| `/` | Catalogue search with filters | OpenSearch; the PNRR filter options come from the API (`/v2/vocabularies/pnrr-measures`, `/v2/vocabularies/pnrr-targets`), managed in the dashboard (`/dashboard/liste`) |
| `/software/:slug` | Software detail; "Pubblicato da" links to the administration page | OpenSearch |
| `/pa` | Administrations with published software | OpenSearch (`administration` documents, software counted by `publisher.ipa`) |
| `/pa/:ipa` | Administration page: IPA code, type and website from IndicePA, published software | OpenSearch + API (`/v2/ipa-entities/:ipa`) |

An administration page lists the software the crawler found in that administration's code
hosting (`publisher.ipa`), the same list as in the dashboard. The old developers.italia.it
`/it/pa/<ipa>` pages used the IPA code declared in `publiccode.yml` instead.

The API must allow the catalogue's origin (`CORS_ORIGINS` in the API, all origins by default).
