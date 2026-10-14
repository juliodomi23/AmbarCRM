# Nuevo cobro: identificar contrato y proponer monto · 2026-10-14

## Fallos y hallazgos

**Sin fallos finales** en TypeScript, lint, build, los 32 checks ni los tres E2E.

La inspección visual de la primera captura de escritorio detectó que el scroll
del formulario recortaba parte de los botones inferiores. Se corrigió dentro
de NuevoCobro: solo los campos tienen scroll y Cancelar/Crear cobro permanecen
visibles, con altura de 44 px. [Captura inicial con recorte](nuevo-cobro-1440-inicial-recortado.png).
El test inicial no comprobaba ese recorte y terminó EXIT 0:
[salida literal inicial](test-nuevo-cobro-monto-e2e-inicial.txt).
El test final comprueba además que los botones completos quedan dentro del
formulario y del viewport. TypeScript, lint, build, checks y los E2E se repitieron
tras corregir el layout; todos terminaron EXIT 0.

Se conservan también [tipos iniciales](tipos-inicial.txt), [lint inicial](lint-inicial.txt)
y [build inicial](build-inicial.txt). No se modificó ningún test existente ni
permisos de la app para conseguir estos resultados.

## Base y alcance

Antes de trabajar, modulos-fase-2 y cobros-cancelar-eliminar estaban ambos en
`f7ab22f51ad76ae100b6690da48de3ac6f90ef32`; se cumplía la precondición del prompt.
Se creó nuevo-cobro-monto desde esa base. Un único commit, sin merge ni push.

Los únicos archivos de producto modificados son:

- `web/src/components/ar/NuevoCobro.tsx`.
- Una expresión de texto en `web/src/components/ar/FilaCobro.tsx`.

El tipo del contrato se amplió dentro de NuevoCobro, sin archivos de tipos nuevos.
El resto de los archivos del commit son esta evidencia y scripts de verificación.
El caso de UI añadido vive en esta carpeta; los E2E existentes de web/prisma/scripts
se ejecutan intactos.

## Comportamiento

El selector muestra nombre, tipo, mensualidad y día: por ejemplo
«Villafuerte y Asociados · bot whatsapp · $1,200/mes · día 5» y
«Villafuerte y Asociados · otro · $800/mes · día 5».
La selección se repite en un texto que puede ocupar varias líneas: en móvil
permite leer todos los datos aunque el control nativo tenga una sola línea.
Sin mensualidad positiva (null o 0), muestra «sin mensualidad» y no propone monto.
Sin día de cobro, muestra «día por confirmar».

Mientras el monto no se haya editado, mensualidad deriva su propuesta del contrato
seleccionado. Extra, anticipo y balance empiezan vacíos. Editarlo o borrarlo a mano
da prioridad al valor manual, incluso al cambiar contrato, concepto o búsqueda,
o si la petición del contrato llega tarde. Crear correctamente limpia ese valor
para la siguiente alta; el monto permanece editable.

Desde una ficha con contratoId se consulta el GET existente de ese contrato para
conocer cliente/mensualidad/día, sin cambiar ninguna API. El guardado espera tener
el contrato identificado y el aviso confirma cliente, concepto e importe.
Una búsqueda que ya no incluye el contrato elegido conserva esa selección.

En cancelados con montoPagado positivo, FilaCobro muestra «Pago revertido · $X».
Los demás estados mantienen «Recibido $X de $Y». No se cambió ningún cálculo,
estado, historial de pagos ni regla de cancelación/eliminación.

## Verificación final

Los comandos se ejecutaron desde web/ con BD exclusivamente local y desechable;
los scripts PowerShell hacen Push-Location a web/ antes de invocarlos.

| Comprobación | Resultado | Salida literal |
|---|---|---|
| npx tsc --noEmit | EXIT 0 | [tipos.txt](tipos.txt) |
| npm run lint | EXIT 0 | [lint.txt](lint.txt) |
| npx next build | EXIT 0 | [build.txt](build.txt) |
| Todos scripts/check-*.ts | 32/32; FALLOS 0 | [checks-resumen.txt](checks-resumen.txt), salida individual por check |
| test-cobros-e2e.ts | EXIT 0 | [test-cobros-e2e.txt](test-cobros-e2e.txt) |
| test-cobros-cancelar-eliminar-e2e.ts | EXIT 0 | [test-cobros-cancelar-eliminar-e2e.txt](test-cobros-cancelar-eliminar-e2e.txt) |
| Nuevo E2E de UI | EXIT 0 | [test-nuevo-cobro-monto-e2e.txt](test-nuevo-cobro-monto-e2e.txt) |

[test-nuevo-cobro-monto-e2e.mjs](test-nuevo-cobro-monto-e2e.mjs) abre la app real con
Playwright del runtime de Codex/Edge, sin añadir dependencias. Crea una org aislada
con dos contratos de Villafuerte (1200 y 800, ambos día 5), otros con mensualidad
null/0 y cargos de ejemplo pagado/cancelado. Todos se limpian al terminar.

El caso pedido selecciona el contrato de 1200 y comprueba propuesta 1200;
luego selecciona el de 800 y comprueba **800, no 1200**. Guarda un cobro desde
el formulario real: POST 201, contratoId del contrato de 800, monto 800; confirma
también el monto persistido con una consulta tenant y el aviso con los tres datos.

Casos adicionales: extra/anticipo/balance sin propuesta, null/0 sin propuesta,
monto manual 915.50 conservado al cambiar contrato/concepto, borrado manual
conservado, búsqueda sin resultados conservando selección y monto, nueva alta
vacía tras guardar, ficha contratoId 800, respuesta de ficha retardada preservando
el monto manual 925, cancelado con «Pago revertido» y pagado con «Recibido».
No hubo errores JS. [Mediciones](visual.json).

## Capturas

| Entrada al formulario | 375 px | 1440 px |
|---|---|---|
| /cobros, contrato de 800 seleccionado | [Móvil](nuevo-cobro-375.png) | [Escritorio](nuevo-cobro-1440.png) |
| Ficha del contrato de 800 | [Móvil](nuevo-cobro-ficha-375.png) | [Escritorio](nuevo-cobro-ficha-1440.png) |

Se inspeccionaron visualmente las capturas finales. El ancho documental coincide
con 375/1440; scrollWidth del formulario coincide con clientWidth. Los formularios
quedan dentro del viewport, y los botones completos tienen altura mínima de 44 px.
En móvil, los campos usan scroll vertical para acceder a la nota; las acciones
permanecen visibles. No hay desbordes horizontales ni botones recortados.

## Entorno local y reproducción

Contenedor nuevo ambarcrm-nuevo-cobro-monto-20261014, postgres:16 / PostgreSQL 16.14,
base crm en tmpfs y puerto **127.0.0.1:55453**. [Identidad](contenedor.txt),
[rol y versión](postgres-rol.txt). crm_app no es superusuario ni tiene BYPASSRLS;
el nuevo E2E lo comprueba antes de crear su fixture. La app usa 127.0.0.1:3128,
next start y variables ficticias locales. Ninguna conexión de producción.
RLS quedó activo en contratos/cobros, con dueño diferente de crm_app, y no quedó
ninguna org del fixture UI: [estado final](estado-final-bd.txt). La app local se
detuvo y el contenedor desechable se eliminó: [limpieza](limpieza.txt).

Se inicializó con los archivos existentes sin editarlos:
[schema.sql](init-schema.txt), [multi-tenant.sql](init-multi-tenant.txt),
[actualizaciones.sql](init-actualizaciones.txt). El [fixture mínimo](fixture-local.mjs)
reproduce los requisitos del E2E HTTP anterior (MRR 4400, balance sin fecha y embudo);
no ejecuta ni modifica seeds.

Para repetir desde la raíz de AmbarCRM, crear un contenedor nuevo:

```powershell
docker run -d --name ambarcrm-nuevo-cobro-monto-20261014 -e POSTGRES_USER=dueno -e POSTGRES_PASSWORD=dueno_test -e POSTGRES_DB=crm -p 127.0.0.1:55453:5432 --tmpfs /var/lib/postgresql/data postgres:16
pwsh -File docs/pruebas-nuevo-cobro-monto-2026-10-14/preparar-bd.ps1
pwsh -File docs/pruebas-nuevo-cobro-monto-2026-10-14/estaticos.ps1
pwsh -File docs/pruebas-nuevo-cobro-monto-2026-10-14/ejecutar-pruebas.ps1 -Tipo checks
# Servir el build en otra terminal:
pwsh -File docs/pruebas-nuevo-cobro-monto-2026-10-14/iniciar-app-local.ps1
. ./docs/pruebas-nuevo-cobro-monto-2026-10-14/entorno-local.ps1
cd web
npx --no-install tsx prisma/scripts/test-cobros-e2e.ts
npx --no-install tsx prisma/scripts/test-cobros-cancelar-eliminar-e2e.ts
# PLAYWRIGHT_MODULE apunta al index.mjs del Playwright del runtime de Codex:
node ../docs/pruebas-nuevo-cobro-monto-2026-10-14/test-nuevo-cobro-monto-e2e.mjs
```

## Lo que no se tocó

- Ninguna BD de producción, datos reales, VPS o servicios externos.
- Ningún push, deploy, merge ni modificación de la rama base.
- API/rutas, esquema Prisma, SQL, migraciones, políticas RLS y permisos.
- Cálculos de cobros, panel, MRR, cron, pagos, cancelación y eliminación.
- Seeds, servidores, autenticación, middleware y limitadores.
- Dependencias, package.json, lockfiles y .env.
- E2E/checks existentes y los PROMPT-*.md del usuario.
