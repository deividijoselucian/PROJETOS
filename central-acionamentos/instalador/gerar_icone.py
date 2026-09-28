#!/usr/bin/env python3
"""Desenha o ícone da Central de Acionamentos (um giroflex) e salva como .ico.

Não depende de bibliotecas: rasteriza as formas com superamostragem e grava o
.ico com imagens BMP de 32 bits. Também pode gravar uma prévia em PNG.

Uso: python3 gerar_icone.py [saida.ico] [--pngs pasta]
"""
import os
import struct
import sys
import zlib

FUNDO = (0x15, 0x20, 0x2A)  # azul-ardósia escuro
AMBAR = (0xF2, 0xA9, 0x00)  # luz do giroflex
BASE = (0xE8, 0xEC, 0xEF)   # base clara

TAMANHOS = [16, 24, 32, 48, 64, 256]  # dentro do .ico
PNGS = [16, 32, 48, 128]              # ícones da extensão
ESCALA = 0.8  # encolhe o desenho para caber dentro do quadrado de fundo

# Raios de luz no mesmo espaço 40x40 do SVG da página.
RAIOS = [(20, 3, 20, 9), (6.5, 9.5, 10.5, 13.5), (33.5, 9.5, 29.5, 13.5),
         (1.5, 22, 6.5, 22), (33.5, 22, 38.5, 22)]


def _retangulo_arredondado(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def _capsula(x, y, ax, ay, bx, by, r):
    dx, dy = bx - ax, by - ay
    t = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)
    t = min(1.0, max(0.0, t))
    px, py = ax + t * dx, ay + t * dy
    return (x - px) ** 2 + (y - py) ** 2 <= r * r


def cor_em(x, y):
    """Cor (r, g, b) no ponto x, y do quadro 40x40, ou None se for transparente."""
    if not _retangulo_arredondado(x, y, 0, 0, 40, 40, 8):
        return None
    # leva o ponto para o espaço do desenho original, centralizado no quadrado
    gx = 20 + (x - 20) / ESCALA
    gy = 18.4 + (y - 20) / ESCALA
    if _retangulo_arredondado(gx, gy, 6, 29, 34, 35, 2):
        return BASE
    if (11 <= gx <= 29 and 23 <= gy <= 29) or (gy <= 23 and (gx - 20) ** 2 + (gy - 23) ** 2 <= 81):
        return AMBAR
    for ax, ay, bx, by in RAIOS:
        if _capsula(gx, gy, ax, ay, bx, by, 1.25):
            return AMBAR
    return FUNDO


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


def _bmp(tamanho, linhas):
    """Imagem do .ico no formato BMP 32 bits (cores + máscara AND)."""
    cabecalho = struct.pack('<IiiHHIIiiII', 40, tamanho, tamanho * 2, 1, 32, 0, 0, 0, 0, 0, 0)
    cores = bytearray()
    mascara = bytearray()
    bytes_mascara = ((tamanho + 31) // 32) * 4
    for linha in reversed(linhas):
        bits = bytearray(bytes_mascara)
        for x, (r, g, b, a) in enumerate(linha):
            cores += bytes((b, g, r, a))
            if a == 0:
                bits[x // 8] |= 0x80 >> (x % 8)
        mascara += bits
    return cabecalho + bytes(cores) + bytes(mascara)


def _png(linhas):
    altura, largura = len(linhas), len(linhas[0])
    bruto = b''.join(b'\x00' + bytes(v for p in linha for v in p) for linha in linhas)

    def bloco(tipo, dados):
        return (struct.pack('>I', len(dados)) + tipo + dados
                + struct.pack('>I', zlib.crc32(tipo + dados) & 0xFFFFFFFF))

    return (b'\x89PNG\r\n\x1a\n'
            + bloco(b'IHDR', struct.pack('>IIBBBBB', largura, altura, 8, 6, 0, 0, 0))
            + bloco(b'IDAT', zlib.compress(bruto, 9))
            + bloco(b'IEND', b''))


def gravar_ico(caminho):
    imagens = {t: desenhar(t) for t in TAMANHOS}
    corpos = [_bmp(t, imagens[t]) for t in TAMANHOS]
    deslocamento = 6 + 16 * len(TAMANHOS)
    diretorio = b''
    for t, corpo in zip(TAMANHOS, corpos):
        lado = 0 if t >= 256 else t  # 0 significa 256 no formato .ico
        diretorio += struct.pack('<BBBBHHII', lado, lado, 0, 0, 1, 32, len(corpo), deslocamento)
        deslocamento += len(corpo)
    with open(caminho, 'wb') as f:
        f.write(struct.pack('<HHH', 0, 1, len(TAMANHOS)) + diretorio + b''.join(corpos))


def gravar_pngs(pasta):
    """Ícones da extensão do Chrome: icone16.png, icone32.png, icone48.png e icone128.png."""
    for t in PNGS:
        with open(os.path.join(pasta, 'icone%d.png' % t), 'wb') as f:
            f.write(_png(desenhar(t)))


def main():
    args = sys.argv[1:]
    pasta = None
    if '--pngs' in args:
        i = args.index('--pngs')
        pasta = args[i + 1]
        del args[i:i + 2]
    if not args and not pasta:
        sys.exit('uso: gerar_icone.py [saida.ico] [--pngs pasta]')
    if args:
        gravar_ico(args[0])
    if pasta:
        gravar_pngs(pasta)


if __name__ == '__main__':
    main()
