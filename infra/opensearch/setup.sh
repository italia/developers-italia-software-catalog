#!/bin/sh
# Ruoli e utenti di OpenSearch per il catalogo, creati con la REST API di sicurezza.
# Idempotente: si può rilanciare. Lo esegue il servizio opensearch-setup del compose.
#
#   catalog_public_read  utente anonimo: solo _search sull'alias del catalogo (D2)
#   catalog_indexer      utente $OPENSEARCH_USER: crea gli indici del catalogo, bulk, swap dell'alias
set -eu

: "${OPENSEARCH_INITIAL_ADMIN_PASSWORD:?manca OPENSEARCH_INITIAL_ADMIN_PASSWORD}"
: "${OPENSEARCH_USER:?manca OPENSEARCH_USER}"
: "${OPENSEARCH_PASS:?manca OPENSEARCH_PASS}"
ALIAS="${OPENSEARCH_INDEX_ALIAS:-developers_italia_it}"
ADMIN="admin:${OPENSEARCH_INITIAL_ADMIN_PASSWORD}"

# HTTPS nella base, HTTP se compose.local.yaml disattiva il TLS sull'interfaccia HTTP.
for url in https://opensearch:9200 http://opensearch:9200; do
  if curl -fsk -u "$ADMIN" "$url/_cluster/health" >/dev/null 2>&1; then BASE="$url"; break; fi
done
: "${BASE:?OpenSearch non raggiungibile o password admin errata}"
echo "OpenSearch: $BASE"

api() {
  printf '%s %s: ' "$1" "$2"
  curl -fsSk -u "$ADMIN" -H 'Content-Type: application/json' -X "$1" "$BASE/_plugins/_security/api/$2" -d "$3"
  echo
}

api PUT roles/catalog_public_read "{
  \"description\": \"Ricerca anonima sull'alias del catalogo\",
  \"index_permissions\": [{
    \"index_patterns\": [\"$ALIAS\", \"$ALIAS*\"],
    \"allowed_actions\": [\"indices:data/read/search*\"]
  }]
}"

api PUT roles/catalog_indexer "{
  \"description\": \"Indexer del catalogo: indici versionati, bulk e alias\",
  \"cluster_permissions\": [\"cluster_monitor\", \"cluster_composite_ops\", \"indices:admin/aliases/get\"],
  \"index_permissions\": [{
    \"index_patterns\": [\"$ALIAS\", \"$ALIAS*\"],
    \"allowed_actions\": [\"indices_all\"]
  }]
}"

api PUT "internalusers/$OPENSEARCH_USER" "{
  \"password\": \"$OPENSEARCH_PASS\",
  \"description\": \"Utente dell'indexer del catalogo\"
}"

api PUT rolesmapping/catalog_public_read '{ "backend_roles": ["opendistro_security_anonymous_backendrole"] }'
api PUT rolesmapping/catalog_indexer "{ \"users\": [\"$OPENSEARCH_USER\"] }"

echo "fatto"
