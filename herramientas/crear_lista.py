#!/usr/bin/env python3
"""Convierte listas/grado-4.csv y listas/grado-5.csv en listas/lista.js (la lista que usa el registro de cada curso, con o sin internet).
USO:   python herramientas/crear_lista.py
FORMATO de cada CSV (se puede abrir y guardar con Excel o Google Sheets, «CSV UTF-8»):  curso;nombre   (también acepta coma o tabulador)
   401;Perez Gomez Ana Maria
Las filas cuyo nombre empieza por EJEMPLO se ignoran. Los cursos válidos son 401, 402, 403 (grado 4) y 501, 502 (grado 5)."""
import csv, io, json, os, re, sys, unicodedata
RAIZ = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
CURSOS = {'4': ['401', '402', '403'], '5': ['501', '502']}
def sin_tildes(t): return ''.join(c for c in unicodedata.normalize('NFD', t) if unicodedata.category(c) != 'Mn').lower()
def limpiar(n): return re.sub(r'\s+', ' ', n).strip()
def leer(grado):
    ruta = os.path.join(RAIZ, 'listas', f'grado-{grado}.csv'); res = {c: [] for c in CURSOS[grado]}; avisos = []
    if not os.path.exists(ruta): return res, [f'No existe {ruta}']
    txt = open(ruta, encoding='utf-8-sig').read(); delim = max(';,\t', key=txt.count) if txt else ';'
    for i, fila in enumerate(csv.reader(io.StringIO(txt), delimiter=delim), 1):
        if len(fila) < 2 or not any(fila): continue
        c, n = fila[0].strip(), limpiar(' '.join(fila[1:]))
        if i == 1 and re.sub(r'[^a-z]', '', sin_tildes(c)) in ('curso', 'grupo'): continue
        if not n or n.upper().startswith('EJEMPLO'): continue
        if c not in res: avisos.append(f'Fila {i}: el curso «{c}» no es válido para grado {grado} ({", ".join(res)}) → se omitió «{n}»'); continue
        if sin_tildes(n) in {sin_tildes(x) for x in res[c]}: avisos.append(f'Fila {i}: «{n}» está repetido en {c} → se dejó una sola vez'); continue
        res[c].append(n)
    for c in res: res[c].sort(key=sin_tildes)
    return res, avisos
if __name__ == '__main__':
    lista = {}; todo = []
    for g in ('4', '5'):
        lista[g], av = leer(g); todo += av
        print(f'Grado {g}: ' + ', '.join(f'{c}={len(v)}' for c, v in lista[g].items()))
    js = '/* Lista de estudiantes. Se genera con herramientas/crear_lista.py o con listas/preparar-lista.html */\nwindow.AULA_LISTA=' + json.dumps(lista, ensure_ascii=False) + ';\n'
    open(os.path.join(RAIZ, 'listas', 'lista.js'), 'w', encoding='utf-8').write(js)
    print('→ listas/lista.js actualizado (' + str(sum(len(v) for g in lista.values() for v in g.values())) + ' nombres)')
    for a in todo: print('  ⚠', a)
