#!/usr/bin/env python3
"""Crea (o actualiza) el índice de un curso a partir de la plantilla con texto.

USO
  python herramientas/crear_indice.py 1 aritmetica 4        # período 1, Aritmética 4°
  python herramientas/crear_indice.py 2 tecnologia 5 --semanas 8
  python herramientas/crear_indice.py --todos 1 2 3         # los 4 cursos de los períodos 1, 2 y 3
  python herramientas/crear_indice.py 4 aritmetica 5 --salida _prueba.html   # solo para probar

Detecta solo las clases que existan en la carpeta (semanaN_*.html): las que están son «¡EMPEZAR!»,
las que faltan salen «En construcción». Vuelve a ejecutarlo cada vez que agregues una clase.
NO sobrescribe un índice existente de otro estilo (p. ej. el de galaxia del período 4) salvo con --forzar.
"""
import argparse, glob, html, json, os, re, sys
RAIZ = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
AREAS = {'aritmetica': dict(nombre='Aritmética', code='mat', c1='#ffb020', c2='#ff6a00', grupos={'4': ['401','402','403'], '5': ['501','502']}),
         'tecnologia': dict(nombre='Tecnología', code='tec', c1='#22d3ee', c2='#2563ff', grupos={'4': ['401','402','403'], '5': ['501','502']})}
PERIODO_COLOR = {1: '#3DDC97', 2: '#8B5CF6', 3: '#FF5C8A', 4: '#FFD23F'}

def titulo_de(ruta):
    try:
        t = open(ruta, encoding='utf-8').read(6000)
        m = re.search(r'<title>(.*?)</title>', t, re.S)
        partes = [p.strip() for p in html.unescape(m.group(1)).split('·')] if m else []
        # «Semana 5 · Galaxia de la Plaza · Aritmética 5° …» → «Galaxia de la Plaza»
        for p in partes[1:]:
            if p and not re.match(r'(?i)(semana|per[ií]odo|aritm|tecnol)', p): return p
    except Exception: pass
    return ''

def crear(periodo, area, grado, semanas=9, salida=None, forzar=False):
    a = AREAS[area]; carpeta = os.path.join(RAIZ, f'periodo-{periodo}', f'{area}-{grado}')
    os.makedirs(carpeta, exist_ok=True)
    destino = os.path.join(carpeta, salida or f'index_{area}{grado}_p{periodo}.html')
    if os.path.exists(destino) and not forzar and not salida:
        if 'crear_indice.py' not in open(destino, encoding='utf-8', errors='ignore').read(4000) + open(destino, encoding='utf-8', errors='ignore').read(60000):
            print(f'  = se respeta el índice existente (otro estilo): {os.path.relpath(destino, RAIZ)}  (usa --forzar para reemplazarlo)'); return
    sem = []
    for n in range(1, semanas + 1):
        f = (glob.glob(os.path.join(carpeta, f'semana{n}_*_p{periodo}.html')) or [None])[0]
        sem.append(dict(n=n, archivo=os.path.basename(f) if f else '', titulo=titulo_de(f) if f else '', sub='', listo=bool(f)))
    t = open(os.path.join(RAIZ, 'recursos', 'plantillas', 'indice-curso.html'), encoding='utf-8').read()
    rep = {'{{AREA_NOMBRE_MAY}}': a['nombre'].upper(), '{{AREA_NOMBRE}}': a['nombre'], '{{AREA_CODE}}': a['code'], '{{GRADO}}': str(grado), '{{PERIODO}}': str(periodo),
           '{{C1}}': a['c1'], '{{C2}}': a['c2'], '{{PC}}': PERIODO_COLOR[periodo], '{{GRUPOS}}': json.dumps(a['grupos'][str(grado)]),
           '{{SEMANAS_JSON}}': json.dumps(sem, ensure_ascii=False)}
    for k, v in rep.items(): t = t.replace(k, v)
    open(destino, 'w', encoding='utf-8').write(t)
    print(f'  ✓ {os.path.relpath(destino, RAIZ)}  ({sum(s["listo"] for s in sem)} de {semanas} semanas listas)')

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('periodo', nargs='?', type=int); p.add_argument('area', nargs='?', choices=list(AREAS)); p.add_argument('grado', nargs='?', type=int, choices=[4, 5])
    p.add_argument('--semanas', type=int, default=9); p.add_argument('--salida'); p.add_argument('--forzar', action='store_true')
    p.add_argument('--todos', nargs='+', type=int, metavar='PERIODO')
    a = p.parse_args()
    if a.todos:
        for per in a.todos:
            for ar in AREAS:
                for gr in (4, 5): crear(per, ar, gr, a.semanas, forzar=a.forzar)
    elif a.periodo and a.area and a.grado: crear(a.periodo, a.area, a.grado, a.semanas, a.salida, a.forzar)
    else: p.print_help(); sys.exit(1)
