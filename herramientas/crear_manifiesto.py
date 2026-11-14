#!/usr/bin/env python3
"""Genera offline-manifest.json: la lista de archivos que el botón «Usar sin internet» guarda en el equipo.
Ejecútalo después de agregar clases o imágenes:   python herramientas/crear_manifiesto.py
  nucleo → portada y recursos (siempre)   ·   cursos → las clases de cada período/área/grado."""
import json, os, glob
RAIZ = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
def rel(p): return os.path.relpath(p, RAIZ).replace(os.sep, '/')
def item(p): return {'u': rel(p), 's': os.path.getsize(p)}
nucleo = [os.path.join(RAIZ, 'index.html'), os.path.join(RAIZ, 'listas', 'lista.js')]
for dp, dn, fn in os.walk(os.path.join(RAIZ, 'recursos')):
    r = rel(dp)
    if any(x in r for x in ('imagenes/referencias', 'imagenes/marcos', 'recursos/plantillas', 'imagenes/legado/ch_')): continue
    nucleo += [os.path.join(dp, f) for f in fn if not f.endswith(('.md', '.py', '.gitkeep'))]
cursos = {}
for d in sorted(glob.glob(os.path.join(RAIZ, 'periodo-*', '*-*'))):
    fs = [f for f in glob.glob(os.path.join(d, '*')) if os.path.isfile(f) and not f.endswith('.gitkeep') and not os.path.basename(f).startswith('_')]
    if any(os.path.basename(f).startswith('semana') for f in fs):
        per = os.path.basename(os.path.dirname(d)).split('-')[1]; cursos[f'{per}-{os.path.basename(d)}'] = [item(f) for f in sorted(fs)]
m = {'nucleo': [item(p) for p in sorted(set(nucleo))], 'cursos': cursos}
open(os.path.join(RAIZ, 'offline-manifest.json'), 'w', encoding='utf-8').write(json.dumps(m, ensure_ascii=False, indent=0))
mb = lambda l: sum(i['s'] for i in l) / 1048576
print(f"núcleo: {len(m['nucleo'])} archivos, {mb(m['nucleo']):.1f} MB")
for k, v in cursos.items(): print(f'  {k}: {len(v)} archivos, {mb(v):.1f} MB')
