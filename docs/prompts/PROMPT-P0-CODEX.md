# Prompt para Codex — Plan P0 de competitividad

> Copia todo este archivo en Codex. Cambia solo la línea **FASE A EJECUTAR** para cada corrida.
> El plan completo está en `PLAN-P0-COMPETITIVIDAD.md`.

---

## FASE A EJECUTAR

**Fase 1 — Pagos en línea.**

No avances a la Fase 2 (CFDI), ni a calendario, email, integraciones, Meta Ads, automatizaciones o reportes en esta ejecución. Al terminar, detente y entrega evidencia para revisión.

---

## Rol

Eres un ingeniero senior full-stack trabajando en **AmbarCRM**, un CRM multiempresa para PYMEs de Latinoamérica, con WhatsApp como canal principal y módulos por giro.

Stack: Next.js 16 (App Router), TypeScript, React 19, Prisma, PostgreSQL 16, Tailwind, NextAuth. Multi-tenant con `org_id` y RLS.

Julio solo revisa. Tú haces la implementación completa, las pruebas y la evidencia. No pidas confirmaciones innecesarias; si una decisión externa no está tomada, implementa con una interfaz/adaptador y un mock, y deja documentado lo que falta configurar.

---

## Lectura obligatoria antes de tocar código

1. `PLAN-P0-COMPETITIVIDAD.md` (sección de la fase elegida).
2. `MULTI-TENANT.md`.
3. `docs/DESPLIEGUE.md`.
4. `web/src/lib/db.ts` (Prisma extendido, `runWithOrg`, `dbRaw`).
5. `web/src/lib/modulos.ts` y `web/src/lib/modulos-catalogo.ts`.
6. `web/prisma/schema.prisma`.
7. `web/prisma/sql/multi-tenant.sql` y `web/prisma/sql/actualizaciones.sql`.
8. `web/src/components/ui.tsx`, `web/src/components/modulos/FormularioModulo.tsx`, `web/src/components/modulos/PanelListado.tsx`.
9. Rutas y patrones de una fase similar ya existente (por ejemplo `web/src/app/api/citas`, `web/src/app/api/caja`, `web/src/app/api/webhooks-salientes`).
10. `web/scripts/check-*.ts` y `web/prisma/scripts/test-*-e2e.ts` para el estilo de pruebas.

Si el plan y el código se contradicen, gana el código; anota la diferencia en la entrega.

---

## Reglas no negociables

- Trabaja en una rama nueva: `codex/p0-fase-1-pagos`.
- **No hagas push, merge ni deploy.** No toques producción, ni bases de datos reales, ni cuentas de clientes.
- **No inventes credenciales.** Usa `.env.example` con placeholders y mocks/sandbox en pruebas.
- No agregues dependencias nuevas sin justificar. Si es indispensable, fija versión y documenta por qué.
- Toda tabla nueva lleva `org_id`, FK a `orgs`, índices y política RLS `org_isolation` con `USING` y `WITH CHECK`.
- Toda lectura/escritura pasa por el patrón existente (`db` extendido, `runWithOrg`, `requireModuloActivo`).
- El servidor valida todo. Nunca confíes en montos, estados ni IDs del cliente.
- Webhooks: verificar firma, idempotencia, replay protection y logs sin PII.
- Dinero: usa `Decimal`/enteros de centavos según el patrón del repo; nunca `float`.
- UI: reutiliza `EncabezadoPagina`, `Boton`, `Badge`, `surface`, `PanelListado`, `FormularioModulo`. Respeta modo oscuro, móvil y accesibilidad.
- No rompas checks existentes. Si un check falla por tu cambio, corrígelo.
- No dejes TODOs sin documentar. Lo que no se pueda completar va en “Pendientes” con motivo.

---

## Objetivo de la Fase 1

Implementar **pagos en línea** para que un negocio pueda cobrar desde una venta, cita, cotización o pedido, con conciliación, webhooks y reembolsos.

### 1. Diseño

Antes de codificar, escribe un ADR corto en `docs/pagos-online.md`:

- Proveedor principal: Mercado Pago (México). Stripe queda como adaptador futuro documentado, no implementado salvo que sea trivial.
- Alternativa evaluada y por qué se descarta.
- Flujo: origen → checkout → webhook → conciliación → estado final.
- Modelo de datos.
- Riesgos y decisiones de idempotencia.
- Variables de entorno.

### 2. Modelo de datos

Crea tablas con RLS e índices:

- `pagos_online`: `id`, `org_id`, `origen_tipo` (`venta`, `cita`, `cotizacion`, `pedido`), `origen_id`, `proveedor`, `estado`, `monto`, `moneda`, `referencia_externa`, `idempotency_key`, `metadata`, `expira_at`, `created_at`, `updated_at`.
- `eventos_pago`: `id`, `org_id`, `pago_id`, `proveedor`, `evento_id` único por proveedor, `tipo`, `payload`, `procesado_at`, `created_at`.
- Si hace falta, `enlaces_pago` o columnas equivalentes para URL de checkout y expiración.

Incluye SQL idempotente y ensáyalo desde `schema.sql` + `multi-tenant.sql` + `actualizaciones.sql` en Postgres desechable.

### 3. Adaptador de proveedor

Define una interfaz `ProveedorPago` con:

- `crearCheckout(datos): Promise<{ url, referencia, expiraAt }>`
- `verificarWebhook(req): Promise<EventoPago | null>`
- `consultarPago(referencia): Promise<EstadoPago>`
- `reembolsar(referencia, monto?): Promise<ResultadoReembolso>`

Implementa:

- `ProveedorMercadoPago` con llamadas reales detrás de variables de entorno (sin credenciales en el repo).
- `ProveedorMock` para pruebas E2E.
- Selección por configuración de módulo/entorno.

### 4. Backend

- `POST /api/pagos/checkout`: valida sesión, módulo, permisos y origen; recalcula el monto en servidor; crea pago pendiente y devuelve URL.
- `POST /api/public/pagos/webhook/[proveedor]`: verifica firma, evita replay, procesa idempotente y actualiza el pago.
- Cron de conciliación de pagos pendientes (`/api/cron/pagos-pendientes` o patrón existente).
- Reembolso desde API interna con permisos de admin/cajero.
- Actualización del origen (venta/cita/cotización/pedido) solo cuando el pago esté aprobado, dentro de una transacción.
- Manejo de montos y moneda: si no coincide, rechaza y registra.
- No expongas tokens, llaves ni payloads completos con PII.

### 5. UI

- Botón “Cobrar en línea” en al menos uno de estos flujos: venta, cotización o cita. Si el flujo es complejo, empieza por ventas y deja el resto documentado.
- Estado del pago con `Badge` (pendiente, aprobado, rechazado, reembolsado).
- Página pública de resultado (éxito/pendiente/error).
- Configuración del módulo: proveedor, moneda, modo sandbox, llave pública.
- Enlace copiable al checkout.

### 6. Permisos y activación

- Módulo `pagos_en_linea` o configuración equivalente en `modulos_org`.
- Permisos por puesto: admin y cajero/ventas; el resto solo lectura o sin acceso.
- Feature flag por organización.
- No actives el módulo en todas las demos por defecto; deja el seed/config documentado.

### 7. Pruebas mínimas obligatorias

- Firma de webhook inválida → rechazo.
- Webhook duplicado → un solo pago/evento.
- Monto o moneda distintos → rechazo.
- Pago aprobado → origen actualizado una sola vez.
- Reembolso → estado correcto e idempotente.
- Dos webhooks concurrentes → un solo estado final.
- RLS: empresa A no ve pagos/eventos de empresa B.
- E2E con Postgres desechable, app local y `ProveedorMock`.
- `npx tsc --noEmit`, ESLint y `npm run build`.

### 8. Documentación

- `docs/pagos-online.md` con arquitectura, variables, webhook, sandbox y pruebas.
- Actualiza `.env.example`.
- Actualiza `docs/DESPLIEGUE.md` si hay variables nuevas.
- Agrega un `check-pagos-online.ts` puro si aplica.

---

## Criterios de aceptación

- [ ] Se puede crear un checkout desde un origen real.
- [ ] El webhook actualiza el pago y el origen de forma idempotente.
- [ ] Un evento duplicado o concurrente no duplica dinero ni estados.
- [ ] Un monto manipulado por el cliente no se acepta.
- [ ] RLS y permisos probados con dos empresas.
- [ ] UI consistente, responsive y en modo oscuro.
- [ ] `tsc`, ESLint, build y checks aprobados.
- [ ] Sin secretos, sin push, sin deploy.

---

## Formato de entrega

Al terminar, responde con:

1. Rama y commits locales.
2. Resumen de archivos cambiados.
3. Decisiones tomadas y supuestos.
4. Comandos ejecutados y resultados (tsc, lint, build, pruebas).
5. Evidencia de RLS e idempotencia.
6. Pendientes y lo que requiere cuenta/credenciales reales.
7. Riesgos o cosas que Julio debe revisar.

No avances a la siguiente fase. No hagas push. No despliegues.
