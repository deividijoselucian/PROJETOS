#!/usr/bin/env python3
"""Desenha o ícone do DECONT e salva como .ico.

Um caminhão com semirreboque, em branco, sobre o azul da faixa da placa Mercosul,
com as rodas no amarelo da faixa da estrada. Não depende de bibliotecas: rasteriza
as formas com superamostragem e grava o .ico com imagens BMP de 32 bits.

Uso: python3 gerar_icone.py saida.ico
"""
import struct
import sys

AZUL = (0x1F, 0x3E, 0x9C)
AZUL_ESCURO = (0x16, 0x2D, 0x73)
BRANCO = (0xFF, 0xFF, 0xFF)
AMARELO = (0xF2, 0xC2, 0x30)

TAMANHOS = [16, 24, 32, 48, 64, 256]


def _retangulo_arredondado(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def _circulo(x, y, cx, cy, r):
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def _cabine(x, y):
    """Cabine do cavalo: retângulo com a frente inclinada (para-brisa)."""
    if x < 21.5 or x > 35.5 or y < 15 or y > 29:
        return False
    # frente inclinada no canto de cima à direita
    return y >= 15 + max(0.0, (x - 30.5)) * 1.1


def _janela(x, y):
    if x < 24 or x > 32.5 or y < 17.5 or y > 22.5:
        return False
    return y >= 17.5 + max(0.0, (x - 29.5)) * 1.1


def cor_em(x, y):
    """Cor (r, g, b) no ponto x, y do quadro 40x40, ou None se for transparente."""
    if not _retangulo_arredondado(x, y, 0, 0, 40, 40, 9):
        return None
    # rodas (com cubo)
    for cx in (9.5, 16.5, 29.5):
        if _circulo(x, y, cx, 31.5, 3.6):
            return AZUL_ESCURO if _circulo(x, y, cx, 31.5, 1.3) else AMARELO
    if _retangulo_arredondado(x, y, 4, 9.5, 20.2, 27.5, 1.4):        # baú do semirreboque
        return BRANCO
    if _cabine(x, y):
        return AZUL if _janela(x, y) else BRANCO
    if 4 <= x <= 35.5 and 27.8 <= y <= 29.6:                           # chassi
        return BRANCO
    return AZUL


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
