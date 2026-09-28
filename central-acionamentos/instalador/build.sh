#!/usr/bin/env bash
# Gera o instalador de teste para Windows da Central de Acionamentos.
# Precisa de: python3 e makensis (pacote "nsis" no Linux).
set -euo pipefail
cd "$(dirname "$0")"

rm -rf build
mkdir -p build dist

# A página publicada não tem <html>/<head> (a plataforma coloca na hora de publicar).
# Para abrir direto no Windows, acrescenta a codificação e o viewport.
{
  printf '<!doctype html>\n<html lang="pt-BR">\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  cat ../prototipo.html
  printf '\n</html>\n'
} > build/index.html

python3 gerar_icone.py build/icone.ico build/icone.png
makensis -V2 -INPUTCHARSET UTF8 central.nsi
echo "Pronto: $(pwd)/dist/CentralAcionamentos-Teste-Setup.exe"
