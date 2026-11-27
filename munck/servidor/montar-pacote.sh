#!/usr/bin/env bash
# Monta controle-munck-servidor.tar.gz: o programa do servidor, o sistema (munck.html),
# o mapa e o instalador, numa pasta controle-munck/. Não leva dados nem senha.
# Uso: bash munck/servidor/montar-pacote.sh [pasta-de-saida]
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
SAIDA="${1:-$AQUI/dist}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/controle-munck/publico" "$SAIDA"
cp "$AQUI/servidor.js" "$AQUI/instalar-no-servidor.sh" "$AQUI/.env.example" "$AQUI/LEIA-ME.md" "$TMP/controle-munck/"
cp "$AQUI/../munck.html" "$AQUI/../mapa-sul.json" "$TMP/controle-munck/publico/"
chmod +x "$TMP/controle-munck/instalar-no-servidor.sh"
tar -czf "$SAIDA/controle-munck-servidor.tar.gz" -C "$TMP" controle-munck
echo "Pronto: $SAIDA/controle-munck-servidor.tar.gz"
