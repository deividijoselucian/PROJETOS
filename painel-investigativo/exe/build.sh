#!/usr/bin/env bash
# Gera PainelInvestigativo.exe: o painel numa janela própria no Windows, sem internet.
# Precisa de: python3 e makensis (pacote "nsis" no Linux).
set -euo pipefail
cd "$(dirname "$0")"

rm -rf build
mkdir -p build dist

python3 montar.py build/painel.html
python3 gerar_icone.py build/icone.ico
makensis -V2 -INPUTCHARSET UTF8 painel.nsi

echo "Pronto: $(pwd)/dist/PainelInvestigativo.exe"
