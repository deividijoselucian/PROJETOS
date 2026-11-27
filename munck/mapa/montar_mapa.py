"""Monta mapa-sul.json: contorno de PR, SC e RS, municípios de SC e as cidades dos três estados.
Uso: python3 -I montar_mapa.py <pasta-dados> <saida.json>"""
import csv, json, math, sys, os
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.ops import unary_union

pasta, saida = sys.argv[1], sys.argv[2]
LAT0, LON0 = -22.4, -57.8          # canto de cima à esquerda
COS = math.cos(math.radians(-28.0))  # escala da longitude na latitude média do Sul
K = 100.0                           # unidades por grau

def xy(lon, lat):
    return ((lon - LON0) * COS * K, (LAT0 - lat) * K)

def caminho(geom, casas=1):
    polys = [geom] if isinstance(geom, Polygon) else list(geom.geoms) if isinstance(geom, MultiPolygon) else []
    partes = []
    for p in polys:
        for anel in [p.exterior, *p.interiors]:
            pts = list(anel.coords)
            if len(pts) < 4:
                continue
            ant = None
            seg = []
            for lon, lat in pts[:-1]:
                x, y = xy(lon, lat)
                t = (round(x, casas), round(y, casas))
                if t != ant:
                    seg.append(t)
                ant = t
            if len(seg) >= 3:
                partes.append('M' + 'L'.join(f'{x:g},{y:g}' for x, y in seg) + 'Z')
    return ''.join(partes)

ufs = {'41': 'PR', '42': 'SC', '43': 'RS'}
estados, municipios = [], []
for cod, uf in ufs.items():
    gj = json.load(open(os.path.join(pasta, f'geojs-{cod}-mun.json'), encoding='utf-8'))
    geoms = [shape(f['geometry']).buffer(0) for f in gj['features']]
    contorno = unary_union(geoms).simplify(0.01, preserve_topology=True)
    contorno = max(contorno.geoms, key=lambda g: g.area) if isinstance(contorno, MultiPolygon) and uf != 'SC' else contorno
    estados.append({'uf': uf, 'd': caminho(contorno)})
    if uf == 'SC':
        for f, g in zip(gj['features'], geoms):
            s = g.simplify(0.006, preserve_topology=True)
            municipios.append({'n': f['properties'].get('name', ''), 'd': caminho(s)})

cidades = []
with open(os.path.join(pasta, 'municipios.csv'), encoding='utf-8') as fh:
    for r in csv.DictReader(fh):
        uf = ufs.get(r['codigo_uf'])
        if uf:
            cidades.append([r['nome'], uf, round(float(r['latitude']), 4), round(float(r['longitude']), 4)])
cidades.sort(key=lambda c: (c[0], c[1]))

# limites do desenho
xs, ys = [], []
for e in estados:
    for parte in e['d'].replace('M', ' ').replace('L', ' ').replace('Z', ' ').split():
        x, y = map(float, parte.split(','))
        xs.append(x); ys.append(y)
saida_obj = {
    'fonte': 'IBGE (malha municipal, via tbrugz/geodata-br, CC0) e kelvins/municipios-brasileiros (MIT)',
    'proj': {'lat0': LAT0, 'lon0': LON0, 'cos': round(COS, 6), 'k': K},
    'caixa': [math.floor(min(xs)), math.floor(min(ys)), math.ceil(max(xs) - min(xs)), math.ceil(max(ys) - min(ys))],
    'estados': estados, 'municipios': municipios, 'cidades': cidades,
}
json.dump(saida_obj, open(saida, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('estados', [(e['uf'], len(e['d'])) for e in estados], 'municipios', len(municipios), sum(len(m['d']) for m in municipios), 'cidades', len(cidades), 'caixa', saida_obj['caixa'])
