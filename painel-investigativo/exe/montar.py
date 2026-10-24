#!/usr/bin/env python3
"""Monta a versão do painel que abre direto no Windows, sem internet.

A página publicada (../painel.html) não tem <html>/<head> (a plataforma de artefatos
coloca na hora de publicar) e busca as fontes no Google Fonts. Aqui o arquivo ganha o
cabeçalho, as fontes vão embutidas em base64 e o link externo sai.

Uso: python3 montar.py saida.html
"""
import base64
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
FONTES = [
    # família, arquivo, peso (o Unbounded é variável: um arquivo cobre 500 a 700)
    ("Atkinson Hyperlegible", "AtkinsonHyperlegible-400.woff2", "400"),
    ("Atkinson Hyperlegible", "AtkinsonHyperlegible-700.woff2", "700"),
    ("Unbounded", "Unbounded.woff2", "500 700"),
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


def montar(origem):
    with open(origem, encoding="utf-8") as f:
        pagina = f.read()
    titulo = re.search(r"<title>.*?</title>", pagina, re.S)
    if not titulo:
        sys.exit("painel.html precisa de um <title>")
    pagina = pagina.replace(titulo.group(0), "", 1)
    # tira o que só existe para a plataforma ou depende de internet
    pagina = re.sub(r'<meta name="claude:[^"]*"[^>]*>\n?', "", pagina)
    pagina = re.sub(r'<link rel="(?:preconnect|stylesheet)" href="https://fonts\.[^"]*"[^>]*>\n?', "", pagina)
    if "fonts.googleapis" in pagina or "fonts.gstatic" in pagina:
        sys.exit("sobrou um link para o Google Fonts no painel.html")
    return (
        "<!doctype html>\n<html lang=\"pt-BR\">\n<head>\n<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        + titulo.group(0) + "\n<style>" + RESET + fontes_css() + "</style>\n</head>\n<body>\n"
        + pagina + "\n</body>\n</html>\n"
    )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("uso: python3 montar.py saida.html")
    html = montar(os.path.join(AQUI, "..", "painel.html"))
    with open(sys.argv[1], "w", encoding="utf-8") as f:
        f.write(html)
