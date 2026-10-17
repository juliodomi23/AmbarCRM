# Prompt para Codex — total cobrado por cliente en la ficha de contrato (sin deploy)

> Copia desde "## Prompt" y pégalo en Codex.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`). **No hagas push, deploy ni toques
ninguna BD de producción.** Parte de `modulos-fase-2` (debe incluir `241421f`); crea la rama
`total-cobrado-cliente`.

### Qué se quiere

Al abrir la ficha de un contrato (`web/src/app/(app)/contratos/[id]/page.tsx`), Julio quiere ver
de un vistazo **cuánto llevamos cobrado con ese cliente**. Hoy la ficha muestra los datos del
contrato y su lista de cobros (paginada con `LIMITE_PANEL`), pero ningún total.

### Cambio

Añade, arriba de "Cobros del contrato", un bloque de resumen con:

1. **Total cobrado con el cliente**: suma de todo lo efectivamente recibido en **todos los
   contratos del mismo contacto** (un cliente puede tener varios). Número grande y destacado.
2. **Este contrato**: lo cobrado solo en este contrato (si el cliente tiene un solo contrato, muestra
   solo el primero y no repitas).
3. **Por cobrar**: saldo de cobros `pendiente` y `vencido` del cliente (`monto - monto_pagado`).
4. **Cliente desde**: fecha del primer pago registrado del cliente (omítela si no hay fechas).
5. **Mensualidades pagadas**: número de cobros `mensualidad` pagados del cliente.

### Reglas de cálculo (importante)

- Usa **agregados en base de datos** (`aggregate`/`groupBy`/SQL dentro de la transacción tenant),
  nunca sumes la lista paginada de la página.
- "Cobrado" debe coincidir exactamente con el KPI "Cobrado registrado" de `/cobros`:
  suma de `monto_pagado` de cobros con estado distinto de `cancelado`, **más** el `monto` de los
  cobros `pagado` con `pagos = []` (pagos históricos sin abonos desglosados). Extrae esa regla a una
  función compartida y haz que `/cobros` y la ficha la usen, para que no puedan divergir.
- Excluye `cancelado` e `incobrable` del total cobrado. Un cobro con abono parcial suma solo lo
  abonado.
- Dinero con `Prisma.Decimal`, formato `$1,234.00 MXN` (reutiliza el formateador existente).
- RLS intacta, dentro de la transacción tenant. Solo lectura: sin cambios de esquema ni SQL.

### UI

- Reutiliza `surface`, `tnum` y los estilos de los KPI de `/cobros` y `/panel-ar`; sin librerías
  nuevas. Español, sin emojis en el código ni comentarios obvios.
- 375 px: tarjetas en una columna sin desbordes; 1440 px: fila de tarjetas.
- Si no hay pagos, muestra $0.00 y "Sin pagos registrados" (no un bloque vacío).

### Verificación

Desde `web/` con una BD desechable (rol `crm_app` sin BYPASSRLS): `npx tsc --noEmit`,
`npm run lint`, `npx next build`, todos los `scripts/check-*.ts` (32/32) y la batería
`prisma/scripts/test-*.ts` (único fallo permitido: `test-lealtad-aurum.ts`). Añade un test que
cubra: cliente con dos contratos suma ambos; un cobro cancelado, un incobrable y un pendiente no
suman al cobrado; un pago histórico sin abonos (`pagos = []`) sí suma; un abono parcial suma solo
lo abonado; el total coincide con el KPI de `/cobros` para ese cliente. Capturas de la ficha a 375
y 1440 px (cliente con varios contratos y cliente sin pagos). Salidas literales y capturas en
`docs/pruebas-total-cliente-<fecha>/`. Un fallo se reporta tal cual.

### Entrega

Primero cualquier fallo; luego hash del commit (uno, en la rama, sin merge ni push) y qué NO se tocó.
