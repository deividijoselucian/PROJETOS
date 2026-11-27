#!/usr/bin/env bash
# Monta painel-deconto-servidor.tar.gz: o programa do servidor, as páginas dos sistemas
# (DECONTO e Controle de Operação), o mapa e o instalador, numa pasta painel-deconto/.
# Não leva dados, carga nem senha.
# Uso: bash painel/servidor/montar-pacote.sh [pasta-de-saida]
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
SAIDA="${1:-$AQUI/dist}"
mkdir -p "$SAIDA"
SAIDA="$(cd "$SAIDA" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
DEST="$TMP/painel-deconto"
mkdir -p "$DEST/publico"
cp "$AQUI/servidor.js" "$AQUI/sistemas.js" "$AQUI/banco.js" "$AQUI/paginas.js" \
   "$AQUI/instalar-no-servidor.sh" "$AQUI/.env.example" "$AQUI/LEIA-ME.md" "$DEST/"
cp "$RAIZ/sistema-carlise/frota.html" "$DEST/publico/frota.html"
cp "$RAIZ/munck/munck.html" "$DEST/publico/operacao.html"
cp "$RAIZ/munck/mapa-sul.json" "$DEST/publico/mapa-sul.json"
chmod +x "$DEST/instalar-no-servidor.sh"
# dono root no pacote: extraído como root em /opt, nenhum outro usuário da VM fica dono do programa
tar --owner=0 --group=0 --numeric-owner -czf "$SAIDA/painel-deconto-servidor.tar.gz" -C "$TMP" painel-deconto
echo "Pronto: $SAIDA/painel-deconto-servidor.tar.gz"
