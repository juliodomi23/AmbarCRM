# PROMPT — Taller: buscador de órdenes, estado en vivo y diálogos de confirmación

Rama `taller-mecanico` (último commit `82ac771`). Trabaja en `web/`. Lee `web/AGENTS.md` (este Next.js tiene cambios incompatibles: revisa `node_modules/next/dist/docs/` antes de tocar rutas o componentes) y `web/DESIGN.md`. Reglas: sin push, merge ni deploy; no tocar producción; solo tokens del sistema (nada de hexadecimales ni colores fijos de Tailwind); un commit por punto.

## Contexto
La demo del módulo Taller ya se enseña a prospectos. Julio detectó tres problemas al usarla. Corrígelos sin cambiar lógica de negocio, esquema ni APIs salvo lo indicado.

## 1. Buscador en Órdenes (`/taller/ordenes`)
Hoy el tablero no se puede filtrar; Vehículos sí tiene buscador. Un taller real acumula decenas de órdenes activas y cientos entregadas.
- Buscador arriba del tablero/lista (mismo estilo que el de `TallerVehiculos`: icono, `min-h-11`, placeholder «Buscar por placa, cliente, vehículo o folio»). Filtra en el cliente, sin acentos ni mayúsculas, por: placa, nombre del cliente, marca/modelo, folio (`#12` o `12`) y falla reportada.
- Filtro rápido por mecánico («Todos», «Sin asignar», y cada mecánico) como selector o chips, combinable con la búsqueda.
- Contador visible («7 de 12 órdenes») y estado vacío con acción «Limpiar filtros».
- El filtro aplica al tablero y a la vista de lista. Se conserva al cambiar entre ambas; no hace falta persistirlo en la URL.
- **Columnas largas:** «Entregado» y «Cancelado» solo muestran las de los últimos 30 días, con el enlace «Ver todas (N)» que las expande. La búsqueda sí encuentra las antiguas (si hay texto de búsqueda, no se aplica el recorte).
- Accesible: `role="search"`, etiqueta asociada, foco visible.

## 2. El estado no se actualiza sin recargar
Julio reporta que al pasar una orden de etapa tiene que recargar la página para ver el estado. **Reprodúcelo primero** (en navegador real o con Playwright) en estos escenarios y arregla cada uno que falle:
a. En el detalle de la orden, pulsar el botón de avance: el encabezado, la línea de progreso, el panel «Acción siguiente», el historial y los botones deben reflejar el nuevo estado de inmediato.
b. Avanzar en el detalle y volver al tablero con «Tablero de órdenes» o las pestañas: el tablero debe mostrar el estado nuevo sin recargar (revisa la caché de rutas del cliente de Next 16: `router.refresh()`, `revalidatePath` o `export const dynamic`/`revalidate` según la guía de `node_modules/next/dist/docs/`).
c. El cliente aprueba o rechaza desde su celular mientras el equipo tiene abierta la orden: el detalle debe actualizarse solo. Haz un sondeo ligero (cada ~8 s, solo mientras `estado === "esperando_aprobacion"` y la pestaña está visible, con `document.visibilityState`) que consulte `GET /api/taller/ordenes/[id]` y actualice el estado, o reutiliza el SSE existente (`/api/stream`) si ya cubre el caso. Al detectar el cambio, muestra un aviso («El cliente aprobó la cotización») con el toast de la app.
d. Registrar un pago actualiza saldo, «Pagado» y la lista de pagos al instante (hoy ya debería; verifica que también cambie el chip «Por cobrar / Cuenta liquidada»).
Si la causa es que el estado local (`useState(inicial)`) ignora las props nuevas tras `router.refresh()`, resuélvelo de forma que no pierda lo que el usuario está editando (diagnóstico, conceptos sin guardar).

## 3. Reemplazar `window.confirm` por el diálogo de la app
Al entregar con saldo (y en otros casos) aparece el cuadro nativo del navegador, que se ve mal. Ya existe `src/components/Confirmador.tsx` con `confirmar({ titulo, mensaje, confirmar, cancelar, peligro })` (devuelve `Promise<boolean>`, y `<Confirmador/>` ya está montado en el layout). Reemplaza **todos** los `window.confirm` de `src/components/taller/` (hoy: `TallerOrdenDetalle.tsx` líneas ~39, ~65 y ~66):
- Entregar con saldo: título «Entregar con saldo pendiente», mensaje con el monto en `monedaTaller`, botón «Entregar de todos modos»; para quien no es administrador, no se ofrece confirmar: aviso con toast de error «Solo un administrador puede entregar con saldo» (mantén la regla actual del servidor).
- Cancelar con pagos: `peligro: true`, texto claro de que los reembolsos se resuelven fuera del sistema.
- Cambiar conceptos que exige nueva aprobación: título «Se pedirá nueva aprobación», botón «Guardar y reabrir aprobación».
Busca también cualquier `alert(`, `prompt(` o `confirm(` en el módulo y quítalos.

## Pruebas y verificación
- Amplía `scripts/check-taller.ts` solo donde haya lógica nueva testeable (filtro de órdenes como función pura, recorte de 30 días); la UI se verifica con Playwright o a mano.
- Verifica visualmente con la demo: `node scripts/seed-demo-taller.mjs` en una base local (instrucciones en `docs/TALLER-MECANICO.md`; `actualizaciones.sql` se carga con `psql`). Revisa claro/oscuro, 375 px y escritorio, y guarda capturas del buscador, del diálogo de entrega con saldo y del detalle tras avanzar.
- `npx tsc --noEmit`, `npm run lint`, `git diff --check` y `npm run check:taller` pasando (corre la prueba de verdad y pega la salida en el reporte; si no puedes, dilo).

## Entrega
Commits en español por punto (`feat(taller): buscador y filtro por mecánico en órdenes`, `fix(taller): estado en vivo tras avanzar y al aprobar el cliente`, `style(taller): diálogos de confirmación de la app`). Reporte breve: qué escenarios del punto 2 fallaban y cuál era la causa, archivos tocados, qué verificaste visualmente y qué no, y hash de cada commit.
