# Prompt para Codex — cancelar cobros pagados y eliminar cancelados (sin deploy)

> Copia desde "## Prompt" y pégalo en Codex.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`). En `/cobros` hay dos problemas
reales de uso. **No hagas push, deploy ni toques ninguna BD de producción.** Crea la rama
`cobros-cancelar-eliminar` desde `modulos-fase-2`.

### Problema

1. Un cobro **cancelado** no se puede eliminar: no existe `DELETE /api/cobros/[id]` ni botón.
2. Un cobro **pagado** (p. ej. un extra marcado como pagado por error) no se puede cancelar ni
   eliminar: `cambiarCobro` en `web/src/lib/cobros-db.ts` rechaza cualquier cambio si el estado no
   es `pendiente` o `vencido` ("El cobro ya está cerrado", 409).

### Comportamiento deseado

**A. Cancelar un cobro pagado** (revertir un pago por error)
- Solo Administrador, nota obligatoria (igual que cancelar hoy).
- Pasa de `pagado` (o con abonos parciales) a `cancelado`. Conserva en la fila el historial de
  `pagos` y `monto_pagado` como registro, pero **un cobro cancelado no cuenta** en ingreso del mes,
  cartera, MRR, comisiones, CSV ni alertas. Revisa cada consulta de `/panel-ar`,
  `/api/panel-ar/exportar`, `alertas-ar-db.ts` y `saldoCobro()` y corrige la que lo cuente.
- Repetir la misma cancelación sigue devolviendo `repetido: true`.
- `incobrable` no se toca: sigue sin admitir cambios.

**B. Eliminar un cobro cancelado**
- Nuevo `DELETE /api/cobros/[id]`, solo Administrador, con `conModulo("cobros", ...)`.
- Solo procede si el estado es `cancelado`; cualquier otro estado devuelve 409 con mensaje claro
  ("Cancela el cobro antes de eliminarlo").
- Bloquea la fila (`FOR UPDATE`) y borra dentro de una transacción tenant, como hace el pago.
- **Trampa importante:** `generarCobros` crea la mensualidad del mes siguiente. Si se borra una
  mensualidad con `periodo` ya cancelada, el cron la volvería a generar. Por eso las
  **mensualidades con periodo no se eliminan**: devuelve 409 ("Las mensualidades canceladas se
  conservan para que no se vuelvan a generar") y déjalas visibles en historial. Los extras,
  anticipos y balances (cargos manuales/de cierre) sí se pueden eliminar. Verifica con una
  prueba que, tras eliminar un extra, el cron no crea nada nuevo y que una mensualidad cancelada
  no se regenera.

### UI

- En `FilaCobro.tsx` / `RegistrarPago.tsx` (reutiliza lo que existe): acción **"Cancelar"**
  también para cobros pagados, con nota obligatoria y confirmación; acción **"Eliminar"** solo
  en cobros cancelados que lo permitan, con confirmación que muestre cliente, concepto y monto.
- Solo Administrador ve estas acciones. Textos en español, sin emojis en el código.
- Móvil (375 px) y escritorio (1440 px) sin desbordes, áreas táctiles cómodas.

### C. «Nuevo cobro» debe distinguir contratos y proponer el monto

Caso real: un cliente (Villafuerte) tiene dos contratos, uno de $1,200 y otro de $800. En
`web/src/components/ar/NuevoCobro.tsx` el selector solo muestra "Cliente · tipo" (los dos se leen
casi igual: "bot whatsapp" y "otro") y el monto arranca vacío, así que es fácil elegir el contrato
equivocado o capturar un monto que no corresponde.

- En el selector de contrato muestra también la mensualidad y el día de cobro
  ("Villafuerte y Asociados · bot whatsapp · $1,200/mes"). `GET /api/contratos` ya devuelve
  `mensualidad` en cada contrato; no hace falta cambiar la API.
- Al elegir un contrato (o al abrir desde la ficha de un contrato con `contratoId`), si el concepto
  es `mensualidad`, propón el monto con la mensualidad de ese contrato. Para `extra`, `anticipo` y
  `balance` deja el monto vacío (no hay un valor por defecto fiable). El monto sigue siendo editable.
- Si cambia el contrato o el concepto, no pises un monto que el usuario ya escribió a mano.
- Al guardar, muestra en el aviso cliente, concepto y monto para que el error se vea al instante.
- Añade al e2e: un contrato con mensualidad 800 propone 800 y no el del otro contrato.

### Reglas

- No cambies esquema ni SQL salvo que sea imprescindible; si hace falta, que sea aditivo e
  idempotente, y dime por qué. Sin dependencias nuevas.
- RLS intacta: todo dentro de la transacción tenant.
- No toques servidores, seeds ni permisos fuera de lo descrito.

### Verificación

Desde `web/` con una BD desechable (rol `crm_app` sin BYPASSRLS): `npx tsc --noEmit`,
`npm run lint`, `npx next build`, todos los `scripts/check-*.ts` (esperado 32/32) y la batería
`prisma/scripts/test-*.ts` (único fallo permitido: `test-lealtad-aurum.ts`). Añade un test e2e
(`test-cobros-cancelar-eliminar-e2e.ts`) que cubra: cancelar pagado sin nota (400), cancelar pagado
como no admin (403), cancelar pagado correcto y que sale de ingreso/cartera, eliminar cancelado
(204), eliminar pagado/pendiente (409), eliminar mensualidad con periodo (409), y que el cron no
regenera nada. Capturas de `/cobros` a 375 y 1440 px. Guarda salidas literales y capturas en
`docs/pruebas-cobros-cancelar-<fecha>/`. Un fallo se reporta tal cual.

### Entrega

Primero cualquier fallo o desviación; luego hash del commit en la rama (un commit, sin merge ni
push), qué consultas del panel ajustaste y la lista de lo que NO se tocó. Documenta el
comportamiento en `MODULOS.md`, sección Cobros.
