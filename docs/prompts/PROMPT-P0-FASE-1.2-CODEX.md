# Prompt para Codex — Fase 1.2: OAuth por organización y cierre de pagos

> Copia todo este archivo en Codex. Esta fase corrige los huecos que quedaron en `ad8bbc2`.
> No implementa CFDI ni otras fases del P0.

## Contexto

- Repo: AmbarCRM (Next.js 16, TypeScript, Prisma, PostgreSQL 16, multi-tenant con RLS).
- Rama base: `codex/p0-fase-1.1-pagos` (commit `ad8bbc2`).
- Rama nueva: `codex/p0-fase-1.2-pagos`.
- No hagas push, merge ni deploy.
- No uses credenciales reales. Usa sandbox/mocks y variables documentadas.

## Lectura obligatoria

1. `PLAN-P0-COMPETITIVIDAD.md` (Fase 1).
2. `docs/pagos-online.md`.
3. `web/src/lib/pagos/servicio-endurecido.ts`, `proveedor.ts`, `credenciales.ts`, `mercado-pago.ts`.
4. `web/src/app/api/pagos/*`, `web/src/app/api/public/pagos/*`.
5. `web/src/components/config/PagosConfigSeguro.tsx`, `PagosConfig.tsx`, `TabModulos.tsx`.
6. `web/src/components/retail/CobroEnLinea.tsx`, `web/src/app/(app)/ventas/page.tsx`.
7. `web/prisma/schema.prisma`, `web/prisma/sql/actualizaciones.sql`, `web/prisma/sql/multi-tenant.sql`.
8. `web/prisma/scripts/test-pagos-online-e2e.ts`.
9. Documentación oficial de Mercado Pago: OAuth con `authorization_code`, refresh token, webhooks y `x-signature`.

## Lo que ya está bien y NO debes rehacer

- Índice único parcial de un solo pago pendiente por venta.
- Manejo de `P2002` del checkout y reintento tras rechazo.
- Webhook por path con organización (`/webhook/[proveedor]/[org]`).
- Cron tolerante a errores por organización.
- RLS, FK compuesta, cifrado AES-256-GCM y bloqueo de `mock` en producción.
- Menú de `pagos_en_linea` como configuración, sin duplicar Ventas.
- UI de copiar/regenerar enlace y reintento.
- Pruebas de concurrencia, venta cancelada, cron y RLS.

## Correcciones obligatorias

### 1. OAuth por organización (bloqueante)

Hoy el admin pega un access token y un webhook secret a mano. Eso no es viable para clientes reales y no es el “auth” que se pidió.

- Elimina la captura manual de access token y webhook secret de `PagosConfigSeguro`.
- Agrega “Conectar Mercado Pago” con OAuth `authorization_code`.
- Rutas nuevas:
  - `GET /api/pagos/oauth/iniciar`: genera `state` firmado/CSRF, guarda cookie HttpOnly y redirige a `https://auth.mercadopago.com/authorization` con `client_id`, `redirect_uri`, `response_type=code`, `scope=offline_access`.
  - `GET /api/pagos/oauth/callback`: valida `state`, intercambia `code` en `/oauth/token` con `client_id`, `client_secret`, `redirect_uri` y `grant_type=authorization_code`; guarda tokens cifrados por organización.
- Guarda en `credenciales_pago`: `access_token_encrypted`, `refresh_token_encrypted`, `expires_at`, `user_id`, `scope`, `public_key`, `sandbox`, `activo`.
- Renueva el access token antes de 180 días con refresh token (6 meses). Si falla, marca “reconectar” y bloquea checkouts.
- “Desconectar” borra/desactiva los tokens de esa organización.
- `obtenerProveedorPago(orgId)` usa el access token de la organización. Sin conexión → 409.
- Mantén el fallback por variables solo para `PAGOS_ORG_PILOTO`.
- Credenciales manuales solo para desarrollo/piloto detrás de `PAGOS_PERMITIR_CREDENCIALES_MANUALES=1`; en producción la API las rechaza.
- UI: estado “Conectado como…”, vencimiento, reconectar y desconectar. Nunca devuelvas tokens al navegador.
- Variables: `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_REDIRECT_URI`, `MERCADOPAGO_WEBHOOK_SECRET`, `PAGOS_TOKEN_ENCRYPTION_KEY`, `PAGOS_BASE_URL`.
- Pruebas: state inválido/CSRF, code inválido, refresh, token expirado, reconexión, dos organizaciones con tokens distintos.

### 2. Secreto del webhook (bloqueante)

El secreto de firma de Mercado Pago es **de la aplicación**, no de cada organización.

- Verifica `x-signature` con `MERCADOPAGO_WEBHOOK_SECRET` (env de la aplicación).
- Quita `webhook_secret_encrypted` de `credenciales_pago` o déjalo nullable solo para migración; no lo pidas en la UI.
- El `org` del path solo enruta; la autenticidad la da la firma y la consulta del pago.
- Actualiza `mercado-pago.ts`, `proveedor.ts`, `docs/pagos-online.md` y pruebas.
- Pruebas: firma válida/inválida con el secreto de aplicación, path de otra org, proveedor incorrecto, duplicado.

### 3. Reembolsos con un solo total

`montoReembolsado` debe ser la **única fuente de verdad** del total reembolsado.

- `reembolsos_pago` queda solo como reserva/idempotencia de reembolsos pendientes; no es un segundo total visible.
- `disponible = monto - montoReembolsado - suma de reembolsos pendientes`.
- Al aprobar un reembolso, incrementa `montoReembolsado`; si llega al total, estado `reembolsado`; si es parcial, sigue `aprobado`.
- Si un webhook marca el pago como reembolsado, fija `montoReembolsado = monto` y no permitas otro reembolso.
- No marques reembolso total si el evento es `charged_back` o un reembolso parcial; agrega estado/flag de revisión si no puedes determinar el monto.
- Implementa conciliación de reembolsos pendientes: consulta al proveedor, actualiza estado/referencia, libera reservas rechazadas y evita reservas eternas.
- Si el proveedor falla, no dejes la reserva pendiente sin reintento/limpieza.
- UI: un solo texto “Reembolsado $X de $Y”; formulario de reembolso (modal o inline, no `window.prompt`).
- Pruebas: parcial + parcial = total; tercero rechazado; reembolso pendiente conciliado; webhook de reembolso total; intento de sobre-reembolso tras webhook; RLS.

### 4. Venta cancelada y pagos tardíos

No se acredita la venta, pero el dinero ya fue capturado. Hay que dejarlo en revisión/reembolso.

- En `procesarEventoPago`, si la venta está `cancelada`, `preparando`, `lista`, `entregada` o el total cambió:
  - No marques `pagada`.
  - Agrega `metadata.conflicto`, `metadata.requiereReembolso = true` y un motivo.
  - Intenta el reembolso automático si hay credenciales; si falla, deja tarea de revisión.
  - La UI debe mostrar “Pago en revisión / requiere reembolso”, no solo “aprobado”.
- Si el pago ya estaba `aprobado`, no lo bajes a `rechazado` por un evento de monto distinto; crea revisión.
- Pruebas: venta cancelada + pago tardío, venta entregada + segundo pago, total cambiado, evento de monto distinto sobre un pago aprobado.

### 5. P2002 de `pagoVenta`

- `tx.pagoVenta.create` puede chocar con un `pagoVenta` previo del mismo método (por ejemplo, tras un reembolso y nuevo cobro). Usa `upsert` o captura solo ese P2002 y no lo confundas con un evento duplicado.
- Un P2002 de `pagoVenta` no debe devolver `{ duplicado: true }` si el evento es nuevo.
- Prueba: pago aprobado, reembolso, nuevo checkout aprobado para la misma venta/método.

### 6. Webhooks de reembolso y contracargo

- No marques `montoReembolsado = monto` para cualquier `refunded`.
- Usa el monto reembolsado del proveedor (`transaction_amount_refunded` o consulta de reembolsos) para distinguir parcial/total.
- `charged_back` no es un reembolso: crea estado/flag de contracargo y tarea; no lo presentes como reembolso normal.
- Prueba: webhook de reembolso parcial, total y contracargo.

### 7. `.env.example` y documentación

- Actualiza `.env.example` (raíz y `web/.env.example` si aplica) con:
  - `PAGOS_PROVEEDOR`, `PAGOS_ORG_PILOTO`, `PAGOS_TOKEN_ENCRYPTION_KEY`, `PAGOS_BASE_URL`.
  - `PAGOS_PERMITIR_MOCK`, `PAGOS_MOCK_SECRET`, `PAGOS_PERMITIR_CREDENCIALES_MANUALES`.
  - `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_REDIRECT_URI`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_SANDBOX`.
- Quita o marca como obsoletas las variables que asumían secreto por organización.
- `docs/pagos-online.md`: OAuth, redirect URI, scopes, refresh, webhook de aplicación, total único, venta cancelada, migración y sandbox.
- No inventes secretos; deja placeholders.

### 8. Migración segura

- El índice único de un pendiente por origen puede fallar si una base existente ya tiene dos pendientes. Antes de crearlo, deja uno activo y cancela/expira los demás, o falla con un mensaje claro y un script de limpieza.
- `monto_reembolsado` debe agregarse con default 0 y check `<= monto`.
- `credenciales_pago` debe migrar sin perder filas; si quitas `webhook_secret_encrypted`, hazlo nullable/retrocompatible.
- Mantén el SQL idempotente y prueba `schema.sql → multi-tenant.sql → actualizaciones.sql` dos veces.

### 9. Pruebas y evidencia

- OAuth: state/CSRF, code inválido, refresh, expiración, reconexión, dos orgs.
- Webhook HTTP con secreto de aplicación.
- Reembolsos: parciales, total, pendiente conciliado, sobre-reembolso, webhook parcial/total/contracargo.
- Venta cancelada/entregada/total cambiado y metadata de conflicto.
- P2002 de `pagoVenta`.
- Migración con dos pendientes existentes.
- `npx prisma validate`, `npx tsc --noEmit`, `npm run lint`, `npm run check:pagos-online`, `npm run build`.
- Mantén `next build --webpack` si es necesario; documenta el motivo.

## Criterios de aceptación

- [ ] Cada organización conecta su cuenta con OAuth; no hay tokens manuales en producción.
- [ ] El webhook usa el secreto de la aplicación, no uno por organización.
- [ ] El total reembolsado es uno solo (`montoReembolsado`) y no se puede sobre-reembolsar.
- [ ] Un reembolso pendiente se concilia o se libera; no queda eterno.
- [ ] Una venta cancelada no se acredita y queda en conflicto/reembolso visible.
- [ ] Un P2002 de `pagoVenta` no se confunde con evento duplicado.
- [ ] Reembolsos parciales/totales y contracargos se distinguen.
- [ ] `.env.example`, docs y migraciones actualizados.
- [ ] Pruebas y checks verdes.
- [ ] Sin push, merge, deploy ni credenciales reales.

## Entrega

1. Rama y commits locales.
2. Archivos cambiados.
3. Decisiones y supuestos.
4. Comandos y resultados.
5. Evidencia de OAuth, firma de aplicación, reembolsos, venta cancelada y P2002.
6. Pendientes externos (app de Mercado Pago, redirect URI, sandbox, webhook HTTPS).
7. Riesgos para revisión de Julio.

No avances a CFDI. No hagas push. No despliegues.
