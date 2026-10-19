import json
from pathlib import Path

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
filas = json.loads((OUT / 'resultados-pruebas.json').read_text(encoding='utf-8'))
ultimas = {fila['prueba']: fila for fila in filas}
esperadas = {p.name for p in (ROOT / 'web/prisma/scripts').glob('test-*.ts') if p.name != 'test-lealtad-aurum.ts'}
esperadas |= {p.name for p in (ROOT / 'web/scripts').glob('check-*.ts')}
faltantes = sorted(esperadas - ultimas.keys())
fallos = [fila for nombre, fila in ultimas.items() if nombre in esperadas and fila['codigo'] != 0]
assert not faltantes, f'Faltan pruebas: {faltantes}'
assert not fallos, f'Pruebas con fallos: {fallos}'
tests = sum(nombre.startswith('test-') for nombre in esperadas)
checks = len(esperadas) - tests
lineas = ['# Regresión integral de Citas · 18 de octubre de 2026', '',
          f'{tests} scripts de prueba y {checks} comprobaciones aprobados en PostgreSQL desechable con RLS.', '',
          '| Archivo | Código final | Segundos |', '|---|---:|---:|']
for nombre in sorted(esperadas):
    fila = ultimas[nombre]
    lineas.append(f"| `{nombre}` | {fila['codigo']} | {fila['segundos']} |")
lineas += ['', 'Excluido: `test-lealtad-aurum.ts`, que requiere un Aurum real.', '',
           'La compilación Webpack, TypeScript, lint, Prisma validate, reintentos y fallos del entorno',
           'se conservan en los otros archivos `resultados-*.json` y `ejecuciones.txt`. No se',
           'declara aprobado el comando normal de despliegue con tipografías reales.', '']
resumen = '\n'.join(lineas)
(OUT / 'resumen-regresion.md').write_text(resumen, encoding='utf-8')
destino = ROOT / 'docs/regresion-pre-merge-2026-10-17.md'
marcador = '\n## Revisión integral adicional de Citas · 18 de octubre de 2026\n'
contenido = destino.read_text(encoding='utf-8').split(marcador)[0]
destino.write_text(contenido + marcador + '\n' + resumen.replace('# Regresión integral de Citas · 18 de octubre de 2026\n', '', 1), encoding='utf-8')
print(f'{tests} pruebas y {checks} checks: todos aprobados. Informe generado.')
