#!/usr/bin/env bash
# Gera o instalador de teste para Windows da Central de Acionamentos
# e um .zip só com a extensão do Chrome.
# Precisa de: python3, zip e makensis (pacote "nsis" no Linux).
set -euo pipefail
cd "$(dirname "$0")"

rm -rf build
mkdir -p build dist

# Demonstração: o painel com dados de exemplo. A página não tem <html>/<head> (a plataforma
# de artefatos coloca na hora de publicar); para abrir direto no Windows, acrescenta a
# codificação e o viewport.
python3 ../demonstracao/montar.py
{
  printf '<!doctype html>\n<html lang="pt-BR">\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  cat ../demonstracao/demonstracao.html
  printf '\n</html>\n'
} > build/index.html
cp instalar-extensao.html build/

python3 gerar_icone.py build/icone.ico

# O id da extensão vem da chave pública do manifest.json (o Chrome calcula do mesmo jeito).
EXT_ID=$(python3 - <<'EOF'
import base64, hashlib, json
chave = json.load(open('../extensao/manifest.json', encoding='utf-8'))['key']
resumo = hashlib.sha256(base64.b64decode(chave)).hexdigest()[:32]
print(''.join('abcdefghijklmnop'[int(c, 16)] for c in resumo))
EOF
)

makensis -V2 -INPUTCHARSET UTF8 -DEXT_ID="$EXT_ID" central.nsi

rm -f dist/CentralAcionamentos-Extensao.zip
(cd .. && zip -qr instalador/dist/CentralAcionamentos-Extensao.zip extensao)

echo "Extensão: $EXT_ID"
echo "Pronto: $(pwd)/dist/CentralAcionamentos-Teste-Setup.exe"
echo "Pronto: $(pwd)/dist/CentralAcionamentos-Extensao.zip"
