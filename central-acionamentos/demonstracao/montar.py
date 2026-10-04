#!/usr/bin/env python3
"""Monta demonstracao.html: o painel de verdade da extensão numa página só, rodando com o
simulador (dados de exemplo) no lugar da extensão. Serve para abrir no navegador por um link
e como página de demonstração do instalador.

Uso: python3 demonstracao/montar.py
"""
import base64
import pathlib
import re

RAIZ = pathlib.Path(__file__).resolve().parent.parent
EXT = RAIZ / 'extensao'
DEMO = RAIZ / 'demonstracao'

FAIXA = '''<section class="demo-faixa" aria-label="Sobre esta demonstração">
    <p><b>Demonstração com dados de exemplo.</b> Os chamados chegam sozinhos a cada minuto. No sistema de verdade, eles vêm dos portais abertos no seu Chrome, e o WhatsApp sai pelo seu servidor. Clique em qualquer lugar uma vez para liberar o som.</p>
    <button class="btn btn-sm" id="demo-chegar">Simular chamado novo</button>
  </section>
'''


def main():
    html = (EXT / 'central.html').read_text('utf-8')
    titulo = re.search(r'<title>.*?</title>', html).group(0)
    fontes = re.search(r'<link rel="stylesheet" href="https://fonts[^>]*>', html).group(0)
    corpo = html.split('<body>', 1)[1].split('<script src="portais.js">', 1)[0].strip()
    icone = base64.b64encode((EXT / 'icones' / 'icone48.png').read_bytes()).decode()
    corpo = corpo.replace('src="icones/icone48.png"', 'src="data:image/png;base64,' + icone + '"')
    corpo = corpo.replace('<main class="wrap">', '<main class="wrap">\n  ' + FAIXA, 1)
    css = (EXT / 'central.css').read_text('utf-8') + (DEMO / 'demonstracao.css').read_text('utf-8')
    scripts = [EXT / 'portais.js', DEMO / 'simulador.js', EXT / 'central.js']
    partes = [titulo, fontes, '<style>\n' + css + '</style>', corpo]
    partes += ['<script>\n' + p.read_text('utf-8') + '</script>' for p in scripts]
    (DEMO / 'demonstracao.html').write_text('\n'.join(partes) + '\n', 'utf-8')


if __name__ == '__main__':
    main()
