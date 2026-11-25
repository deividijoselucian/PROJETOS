#!/usr/bin/env python3
"""Monta a versão do DECONT que abre direto no Windows, sem internet.

A página publicada (../frota.html) não tem <html>/<head> (a plataforma de artefatos
coloca na hora de publicar) e busca as fontes no Google Fonts. Aqui o arquivo ganha o
cabeçalho, as fontes vão embutidas em base64 e o link externo sai.

Uso: python3 montar.py saida.html [--carga copia.json]

Com --carga, a cópia (.json salva pelo DECONT) vai dentro da página e é carregada na
primeira vez que o sistema abre num computador sem frota cadastrada. Esse .exe leva os
dados da frota: entregue só ao dono e não publique.
"""
import base64
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
FONTES = [
    # família, arquivo, peso
    ("Barlow", "Barlow-400.woff2", "400"),
    ("Barlow", "Barlow-500.woff2", "500"),
    ("Barlow", "Barlow-600.woff2", "600"),
    ("Barlow", "Barlow-700.woff2", "700"),
    ("Barlow Condensed", "BarlowCondensed-500.woff2", "500"),
    ("Barlow Condensed", "BarlowCondensed-600.woff2", "600"),
    ("Barlow Condensed", "BarlowCondensed-700.woff2", "700"),
]
RESET = (
    "*,*::before,*::after{box-sizing:border-box}"
    "body{margin:0}"
    "img{max-width:100%}"
    "[hidden]{display:none!important}"
)


def fontes_css():
    regras = []
    for familia, arquivo, peso in FONTES:
        with open(os.path.join(AQUI, "fontes", arquivo), "rb") as f:
            dados = base64.b64encode(f.read()).decode("ascii")
        regras.append(
            "@font-face{font-family:'%s';font-style:normal;font-weight:%s;font-display:swap;"
            "src:url(data:font/woff2;base64,%s) format('woff2')}" % (familia, peso, dados)
        )
    return "".join(regras)


def carga_html(caminho):
    with open(caminho, encoding="utf-8") as f:
        texto = f.read()
    obj = json.loads(texto)
    if not isinstance(obj, dict) or obj.get("app") != "sistema-carlise" or not isinstance(obj.get("dados"), dict):
        sys.exit("%s não é uma cópia do DECONT" % caminho)
    # "</" escrito como "<\/" (vale o mesmo em JSON) para o navegador não fechar o <script> antes da hora
    texto = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return '<script type="application/json" id="carga-inicial">' + texto + "</script>\n"


def montar(origem, carga=""):
    with open(origem, encoding="utf-8") as f:
        pagina = f.read()
    titulo = re.search(r"<title>.*?</title>", pagina, re.S)
    if not titulo:
        sys.exit("frota.html precisa de um <title>")
    pagina = pagina.replace(titulo.group(0), "", 1)
    # tira o que só existe para a plataforma ou depende de internet
    pagina = re.sub(r'<meta name="claude:[^"]*"[^>]*>\n?', "", pagina)
    pagina = re.sub(r'<link rel="(?:preconnect|stylesheet)" href="https://fonts\.[^"]*"[^>]*>\n?', "", pagina)
    if "fonts.googleapis" in pagina or "fonts.gstatic" in pagina:
        sys.exit("sobrou um link para o Google Fonts no frota.html")
    return (
        "<!doctype html>\n<html lang=\"pt-BR\">\n<head>\n<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        + titulo.group(0) + "\n<style>" + RESET + fontes_css() + "</style>\n</head>\n<body>\n"
        + carga + pagina + "\n</body>\n</html>\n"
    )


if __name__ == "__main__":
    args = sys.argv[1:]
    carga = ""
    if len(args) == 3 and args[1] == "--carga":
        carga = carga_html(args[2])
    elif len(args) != 1:
        sys.exit("uso: python3 montar.py saida.html [--carga copia.json]")
    html = montar(os.path.join(AQUI, "..", "frota.html"), carga)
    with open(sys.argv[1], "w", encoding="utf-8") as f:
        f.write(html)
