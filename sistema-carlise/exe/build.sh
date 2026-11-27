#!/usr/bin/env bash
# Gera DECONTO.exe: o sistema numa janela própria no Windows, sem internet.
# Precisa de: python3 e makensis (pacote "nsis" no Linux).
set -euo pipefail
cd "$(dirname "$0")"

rm -rf build
mkdir -p build dist

if [ -n "${CARGA:-}" ]; then
  # .exe com a frota dentro (CARGA=copia.json): só para o dono, não publicar
  python3 montar.py build/frota.html --carga "$CARGA"
else
  python3 montar.py build/frota.html
fi
python3 gerar_icone.py build/icone.ico
makensis -V2 -INPUTCHARSET UTF8 frota.nsi

echo "Pronto: $(pwd)/dist/DECONTO.exe"
