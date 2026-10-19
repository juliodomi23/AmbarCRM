import json
from pathlib import Path

out = Path(__file__).resolve().parent
root = out.parents[1]
filas = json.loads((out / 'resultados.json').read_text(encoding='utf-8'))
ultimo = {fila['prueba']: fila for fila in filas}
pruebas = sorted(p.name for p in (root / 'web/prisma/scripts').glob('test-*.ts') if p.name != 'test-lealtad-aurum.ts')
checks = sorted(p.name for p in (root / 'web/scripts').glob('check-*.ts'))
preparacion = ['schema', 'multi-tenant', 'actualizaciones-1', 'actualizaciones-2', 'actualizaciones-3', 'prisma-generate', 'prisma-validate', 'tsc', 'lint-cambios', 'build-webpack']
for nombre in pruebas + checks + preparacion:
    assert nombre in ultimo and ultimo[nombre]['codigo'] == 0, f'Pendiente: {nombre}'

texto = '# Resultado final de la regresión de Citas\n\n'
texto += f'Regresión completa: {len(pruebas)} scripts de prueba y {len(checks)} comprobaciones aprobados.\n'
texto += 'Postgres desechable, RLS con crm_app, datos sintéticos y proveedores externos bloqueados.\n'
texto += 'Aurum real se excluye porque requiere un servicio externo de pruebas.\n\n'
texto += 'Se muestra el último resultado de cada caso. Los intentos anteriores, incluidos fallos,\n'
texto += 'se conservan en resultados.json y ejecuciones.txt. Build local con fuentes simuladas.\n\n'
texto += '| Prueba | Salida | Segundos |\n|---|---:|---:|\n'
for nombre in preparacion + pruebas + checks:
    fila = ultimo[nombre]
    texto += f"| {nombre} | {fila['codigo']} | {fila['segundos']} |\n"
(out / 'resumen-regresion.md').write_text(texto, encoding='utf-8')
print(f'{len(pruebas)} pruebas y {len(checks)} checks: todos aprobados.')
