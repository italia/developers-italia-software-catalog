// Settings e mappings dell'indice del catalogo.
//
// Sono ricavate dalle query di apps/catalog-website (src/api/elasticsearch.ts), perché le
// mappings di produzione non sono leggibili pubblicamente. I campi usati nei filtri `term`
// sono `keyword` con in più un sotto-campo `.keyword`: così funzionano sia `term` sul campo
// sia su `.keyword`. In produzione oggi `intendedAudience.scope` è testo analizzato e il
// filtro con valori come "local-authorities" non trova nulla (B13).

const keywordWithSubfield = { type: "keyword", fields: { keyword: { type: "keyword" } } } as const;
const textWithKeyword = { type: "text", fields: { keyword: { type: "keyword", ignore_above: 256 } } } as const;

export function indexBody(replicas: number) {
  return {
    settings: {
      number_of_shards: 1,
      number_of_replicas: replicas,
      // Un valore di tipo sbagliato in un publiccode.yml non deve far fallire il documento.
      "index.mapping.ignore_malformed": true,
      "index.mapping.total_fields.limit": 5000,
    },
    mappings: {
      date_detection: false,
      dynamic_templates: [{ strings: { match_mapping_type: "string", mapping: textWithKeyword } }],
      properties: {
        type: { type: "keyword" },
        slug: { type: "keyword" },
        crawltime: { type: "date" },
        vitalityScore: { type: "float" },
        aliases: { type: "keyword" },
        publisherId: { type: "keyword" },
        publisher: { properties: { name: textWithKeyword, ipa: { type: "keyword" } } },
        "it-riuso-codiceIPA": { type: "keyword" },
        "it-riuso-codiceIPA-label": textWithKeyword,
        publiccode: {
          properties: {
            name: textWithKeyword,
            releaseDate: { type: "date", format: "yyyy-MM-dd||strict_date_optional_time" },
            developmentStatus: keywordWithSubfield,
            softwareType: keywordWithSubfield,
            platforms: keywordWithSubfield,
            categories: keywordWithSubfield,
            intendedAudience: {
              properties: {
                scope: keywordWithSubfield,
                countries: keywordWithSubfield,
                unsupportedCountries: keywordWithSubfield,
              },
            },
            organisation: { properties: { uri: keywordWithSubfield } },
          },
        },
      },
    },
  };
}
