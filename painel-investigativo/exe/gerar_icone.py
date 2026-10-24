#!/usr/bin/env python3
"""Desenha o ícone do Meu Painel Investigativo e salva como .ico.

Um celular sobre o céu do amanhecer, com o sol nascendo na tela e duas barras de
ranking. Não depende de bibliotecas: rasteriza as formas com superamostragem e grava
o .ico com imagens BMP de 32 bits.

Uso: python3 gerar_icone.py saida.ico
"""
import struct
import sys

CEU = [(0x4B, 0x24, 0x68), (0xD2, 0x50, 0x6A), (0xF5, 0xA3, 0x5A)]  # topo, meio, base
BRANCO = (0xFF, 0xFF, 0xFF)
SOL = (0xFF, 0xD3, 0x6B)
TELA = (0x14, 0x18, 0x38)

TAMANHOS = [16, 24, 32, 48, 64, 256]


def _retangulo_arredondado(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def _ceu(y):
    t = min(max(y / 40.0, 0.0), 1.0) * 2
    a, b = (CEU[0], CEU[1]) if t <= 1 else (CEU[1], CEU[2])
    t = t if t <= 1 else t - 1
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def cor_em(x, y):
    """Cor (r, g, b) no ponto x, y do quadro 40x40, ou None se for transparente."""
    if not _retangulo_arredondado(x, y, 0, 0, 40, 40, 9):
        return None
    if _retangulo_arredondado(x, y, 11.5, 5, 28.5, 35, 4):        # corpo do celular
        if not _retangulo_arredondado(x, y, 13.7, 7.2, 26.3, 32.8, 2.2):
            return BRANCO
        if (x - 20) ** 2 + (y - 15.5) ** 2 <= 3.6 ** 2:            # sol / relógio
            return SOL
        if _retangulo_arredondado(x, y, 15.5, 22, 24.5, 24.4, 1.2):  # barra maior
            return BRANCO
        if _retangulo_arredondado(x, y, 15.5, 26.6, 20.8, 29, 1.2):  # barra menor
            return BRANCO
        return TELA
    return _ceu(y)


def desenhar(tamanho):
    """Linhas de pixels (r, g, b, a), de cima para baixo."""
    k = 4 if tamanho >= 64 else 6
    passo = 40.0 / tamanho
    linhas = []
    for py in range(tamanho):
        linha = []
        for px in range(tamanho):
            r = g = b = cobertos = 0
            for sy in range(k):
                y = (py + (sy + 0.5) / k) * passo
                for sx in range(k):
                    c = cor_em((px + (sx + 0.5) / k) * passo, y)
                    if c is not None:
                        r += c[0]
                        g += c[1]
                        b += c[2]
                        cobertos += 1
            if cobertos:
                linha.append((round(r / cobertos), round(g / cobertos), round(b / cobertos),
                              round(255 * cobertos / (k * k))))
            else:
                linha.append((0, 0, 0, 0))
        linhas.append(linha)
    return linhas


def bmp_do_ico(tamanho):
    """Imagem no formato que o .ico espera: cabeçalho BMP, pixels BGRA de baixo para cima e máscara."""
    linhas = desenhar(tamanho)
    cabecalho = struct.pack("<IiiHHIIiiII", 40, tamanho, tamanho * 2, 1, 32, 0, 0, 0, 0, 0, 0)
    pixels = b"".join(bytes((b, g, r, a)) for linha in reversed(linhas) for (r, g, b, a) in linha)
    bytes_mascara = ((tamanho + 31) // 32) * 4
    mascara = b"\x00" * (bytes_mascara * tamanho)
    return cabecalho + pixels + mascara


def gravar_ico(caminho):
    imagens = [bmp_do_ico(t) for t in TAMANHOS]
    deslocamento = 6 + 16 * len(TAMANHOS)
    saida = struct.pack("<HHH", 0, 1, len(TAMANHOS))
    for t, img in zip(TAMANHOS, imagens):
        lado = 0 if t >= 256 else t
        saida += struct.pack("<BBBBHHII", lado, lado, 0, 0, 1, 32, len(img), deslocamento)
        deslocamento += len(img)
    with open(caminho, "wb") as f:
        f.write(saida + b"".join(imagens))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("uso: python3 gerar_icone.py saida.ico")
    gravar_ico(sys.argv[1])
