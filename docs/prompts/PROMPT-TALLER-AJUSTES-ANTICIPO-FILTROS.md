# PROMPT — Taller: ajustes de conceptos, filtro por periodo, anticipo y cobro al entregar

Rama `taller-mecanico` (último commit `d629e38`, ya en `ambar/taller-mecanico`). Trabaja en `web/`. Lee `web/AGENTS.md` (este Next.js tiene cambios incompatibles: revisa `node_modules/next/dist/docs/` antes de tocar rutas o componentes), `web/DESIGN.md` (solo tokens del sistema; nada de hexadecimales ni colores fijos de Tailwind) y `docs/TALLER-MECANICO.md`. Reglas: sin push, merge ni deploy; no tocar producción; **ningún mensaje real a Meta**. Migraciones idempotentes en `web/prisma/sql/actualizaciones.sql` (se repiten en cada deploy con `ON_ERROR_STOP=1`: pruébala corriéndola 3 veces seguidas con `psql`); tablas con `org_id` + RLS; fechas con zona fija `America/Mexico_City`; confirmaciones con `confirmar()` de `src/components/Confirmador.tsx` (nunca `window.confirm`). Un commit por punto, en español.

## Contexto
Julio probó la demo del taller antes de enseñarla y encontró estos problemas. Todos se verifican con la demo sembrada (`node scripts/seed-demo-taller.mjs` contra una base local; las instrucciones para cargar los SQL con `psql` están en `docs/TALLER-MECANICO.md`).

## 1. Salto raro al hacer scroll en el detalle de una orden
Julio vio «algo raro» al bajar con el scroll en `/taller/ordenes/[id]` (quizá intermitente). **Reprodúcelo primero** con Playwright (escritorio 1366 px y móvil 375 px) en órdenes de varios estados. Sospechosos: columna derecha con posición fija/`sticky` que se encima con la izquierda o con la barra superior, el título «Taller de servicio» que queda cortado bajo el header al desplazarse (se ve en capturas previas), contenedores anidados con `overflow` dentro de `<main class="overflow-auto">` de `AppShell`, o el salto de layout cuando aparecen toasts o el sondeo cada 8 s reemplaza el estado. Corrige la causa real y deja escrito en el reporte qué era; si no logras reproducirlo, dilo y deja una captura del estado final que verificaste.

## 2. Conceptos de la cotización: cambiar tipo y borrar
En «Conceptos de reparación» (`TallerOrdenDetalle.tsx`):
- **Cambiar el tipo** de una fila de «Mano de obra» a «Refacción» (y al revés). Hoy el tipo no se puede editar. Al pasar a «Refacción» el campo descripción se convierte en el selector de refacciones del catálogo (precio tomado del catálogo, con existencia visible) y no se puede guardar sin elegir una; al pasar a «Mano de obra» se limpia `refaccionId` y el precio vuelve a ser editable. El servidor ya valida estas combinaciones (`parseConceptos`): confirma que acepta el cambio y que ajusta el inventario con la diferencia (descuenta al volverse refacción, devuelve al dejar de serlo).
- **Borrar un concepto**: botón de papelera por fila (accesible, 40 px, con `aria-label`), con confirmación breve solo si la fila ya estaba guardada. Borrar en el borrador y que «Guardar conceptos» lo persista; el servidor ya calcula el delta de inventario, verifica que el inventario se regrese. Reglas existentes que se mantienen: no se editan conceptos en `esperando_aprobacion`, en `entregado` ni `cancelado`; si la orden ya estaba aprobada y está en `en_reparacion` o `listo`, el cambio regresa a diagnóstico y pide nueva aprobación (el diálogo ya existe); no se puede dejar el total por debajo de lo pagado (mensaje claro).
- Pruebas (`scripts/check-taller.ts`): cambiar tipo mano de obra → refacción descuenta existencia y refacción → mano de obra la devuelve; borrar una fila de refacción devuelve existencia; borrar con la orden en `esperando_aprobacion` o `entregado` da 409; total recalculado en el servidor.

## 3. Filtro de órdenes por periodo
En `/taller/ordenes`, junto al buscador y al filtro de mecánico, agrega un filtro de **periodo** (no por día): «Todo», «Esta semana», «Este mes», «Mes anterior», «Este año» y un selector de mes/año («Elegir mes…») con `<input type="month">`. Se aplica sobre la **fecha de ingreso** (`createdAt`) y, si es sencillo, con un conmutador «Ingreso / Promesa de entrega» para filtrar por la fecha promesa. Semana de lunes a domingo, todo en zona de México. Combinable con la búsqueda y el filtro de mecánico, muestra el contador («7 de 12 órdenes») y «Limpiar filtros». Funciones puras en `src/lib/taller-orden-filtros.ts` con pruebas (límites de semana/mes/año, cambio de mes, zona horaria). Recuerda que las columnas «Entregado» y «Cancelado» solo muestran 30 días: si hay un filtro de periodo activo, ese filtro manda y no se aplica el recorte de 30 días.

## 4. Anticipo y cobro al entregar (control de dinero)
**Objetivo:** que el taller sepa si pidió anticipo al aprobarse la cotización y que pueda cobrar (con método de pago) en el momento de la entrega.

**Datos:** `ALTER TABLE taller_pagos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'abono'` con `CHECK (tipo IN ('anticipo','abono','liquidacion'))` (idempotente: el CHECK dentro de un bloque `DO $$` que verifique si existe). Configuración del módulo (`TallerConfig.tsx`): `anticipoPorcentaje` (0–100, **0 = no se pide**, valor sugerido 50), solo administradores.

**Anticipo:**
- Con porcentaje > 0, cuando la orden está aprobada (`aprobadoAt` y estado `en_reparacion` o posterior) se calcula `anticipoSugerido = total × porcentaje` y se muestra en el detalle una tarjeta «Anticipo: sugerido $X · recibido $Y · pendiente $Z» con estado claro (verde si cubierto; ámbar si falta). Botón «Registrar anticipo»: formulario con monto (prellenado con lo pendiente) y método (efectivo, tarjeta, transferencia, otro); registra un pago con `tipo = 'anticipo'` reutilizando la validación de `pagos/route.ts` (no exceder el saldo).
- La página pública de aprobación (`/taller-aprobacion/[token]`) muestra, si hay porcentaje, «Para iniciar la reparación se solicita un anticipo de $X (N %)». **No bloquea** la aprobación del cliente; es solo información. El mensaje de WhatsApp de aprobación puede incluir esa línea.
- Si cambian los conceptos y el total, el anticipo sugerido se recalcula.
- **No bloquees** avanzar de etapa por falta de anticipo (decisión de producto: control, no restricción). Deja el punto de extensión comentado en `taller-reglas.ts` si quieres, sin implementarlo.

**Cobro al entregar:**
- Al pulsar «Entregar vehículo» con saldo pendiente, el diálogo (hoy solo «Entregar de todos modos») pasa a un panel propio con: saldo, campo **monto a cobrar ahora** (prellenado con el saldo), **método de pago** y dos acciones: «Cobrar y entregar» y, solo para administradores, «Entregar con saldo pendiente». Si el monto cubre todo el saldo, el pago se registra con `tipo = 'liquidacion'`.
- Debe ser **atómico**: ampliar `PATCH /api/taller/ordenes/[id]` para aceptar `pagoFinal: { monto, metodo }` junto con `estado: "entregado"`; en una sola transacción valida (monto > 0, ≤ saldo, método válido), inserta el pago y cambia el estado. Si algo falla no queda ni pago ni cambio de estado. Mantén las reglas actuales: sin `pagoFinal` y con saldo, solo un administrador con `confirmarSaldoPendiente`.
- Si no hay saldo, entrega directa como hoy.

**Reportes:** en `taller-reportes.ts` (agregaciones en SQL, no `include` anidados) añade «Anticipos recibidos en el periodo» y «Órdenes en reparación sin anticipo» (solo si `anticipoPorcentaje > 0`), y desglose de cobrado por método de pago en la pestaña Reportes. Incluye el método y el tipo en el CSV de pagos si ya existe una columna análoga; si no, no lo inventes.

**Demo:** `seed-demo-taller.mjs` pone `anticipoPorcentaje: 50` en `demo-taller` y deja una orden en reparación con anticipo cubierto (pago tipo `anticipo`), otra en reparación **sin** anticipo y la orden «lista» con saldo para enseñar el cobro al entregar. Idempotente.

**Pruebas:** anticipo sugerido con porcentajes 0, 50 y 100 y con total que cambia; registrar anticipo respeta el tope del saldo; `pagoFinal` válido registra pago y entrega en una transacción; `pagoFinal` inválido (monto 0, mayor al saldo, método desconocido) no cambia nada; agente sin `pagoFinal` ni confirmación recibe 409; aislamiento entre organizaciones; reportes cuadran con los pagos de las fixtures.

## Verificación y entrega
- `npx tsc --noEmit`, `npm run lint`, `git diff --check` limpios y **`npm run check:taller` pasando de verdad** (pega la salida; si no puedes correrlo, dilo). La migración corrida 3 veces seguidas con `psql -v ON_ERROR_STOP=1` sin error.
- Verificación visual con Playwright o a mano (claro/oscuro, 375 px y escritorio) de: el scroll del punto 1, edición y borrado de conceptos, filtro de periodo, tarjeta de anticipo, panel de cobro al entregar y la página pública con el anticipo. Guarda capturas en `docs/capturas-taller/`.
- Con volumen: 10 000 órdenes en una base local y la pestaña Reportes sigue respondiendo en menos de 1 s.
- Actualiza `docs/TALLER-MECANICO.md` (anticipo, `pagoFinal`, tipos de pago) y `MODULOS.md`.
- Commits por punto (`fix(taller): scroll del detalle`, `feat(taller): editar tipo y borrar conceptos`, `feat(taller): filtro de órdenes por periodo`, `feat(taller): anticipo y cobro al entregar`). Reporte breve: causa del punto 1, archivos tocados, qué verificaste visualmente y qué no, y hash de cada commit.
