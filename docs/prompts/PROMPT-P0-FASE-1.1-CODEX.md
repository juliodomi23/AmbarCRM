# Prompt para Codex — Fase 1.1: cierre y endurecimiento de pagos

> Copia todo este archivo en Codex. Esta fase corrige los hallazgos de la revisión de la Fase 1.
> No implementa CFDI ni ninguna otra fase del P0.

## Contexto

- Repo: AmbarCRM (Next.js 16, TypeScript, Prisma, PostgreSQL 16, multi-tenant con RLS).
- Rama base: `codex/p0-fase-1-pagos` (commit `e559f25`).
- Rama nueva: `codex/p0-fase-1.1-pagos`.
- No hagas push, merge ni deploy.
- No uses credenciales reales. Usa mocks/sandbox y variables de entorno documentadas.

## Lectura obligatoria

1. `PLAN-P0-COMPETITIVIDAD.md` (Fase 1).
2. `docs/pagos-online.md`.
3. `web/src/lib/pagos/servicio.ts`, `mercado-pago.ts`, `proveedor.ts`, `firmas.ts`, `tipos.ts`.
4. `web/src/app/api/pagos`, `web/src/app/api/public/pagos`, `web/src/app/api/cron/pagos-pendientes`.
5. `web/src/app/(app)/ventas/page.tsx`, `web/src/components/retail/CobroEnLinea.tsx`, `VentasCliente.tsx`.
6. `web/src/components/config/PagosConfig.tsx`, `web/src/app/api/modulos/route.ts`.
7. `web/src/lib/meta/credentials.ts` (patrón de cifrado AES-256-GCM).
8. `web/prisma/schema.prisma`, `web/prisma/sql/actualizaciones.sql`, `web/prisma/sql/multi-tenant.sql`.
9. `web/prisma/scripts/test-pagos-online-e2e.ts` y `web/scripts/check-pagos-online.ts`.

## Objetivo

Cerrar los bloqueantes de la Fase 1 y dejar pagos listo para un piloto real de **una sola empresa**, con camino claro a multiempresa. No agregues features nuevas fuera de este alcance.

## Decisión de recaudación

Asume **OAuth por organización** (cada negocio conecta su propia cuenta de Mercado Pago). Es el modelo recomendado para un CRM multiempresa.

- Mercado Pago **no tiene un “embedded signup”** tipo Meta. El equivalente correcto es OAuth con `authorization_code`.
- Si Julio confirma una cuenta central, detente y pide el ajuste; no implementes liquidación central en esta fase.
- No habilites multiempresa con un token global. El access token es por organización; el secreto del webhook es por aplicación.

## Bloqueantes a corregir

### A. OAuth por organización (equivalente a “embedded signup”)

Mercado Pago no tiene embedded signup; usa OAuth con `authorization_code`.

- `GET /api/pagos/oauth/iniciar`: redirige a `https://auth.mercadopago.com/authorization` con `client_id`, `redirect_uri`, `response_type=code`, `state` firmado y `scope=offline_access` para obtener refresh token.
- `GET /api/pagos/oauth/callback`: valida `state` (CSRF), intercambia el `code` en `/oauth/token` con `client_id`, `client_secret`, `code`, `grant_type=authorization_code` y `redirect_uri`; guarda `access_token`, `refresh_token`, `expires_in`, `user_id` y conexión por organización.
- Renueva el access token antes de su vencimiento (180 días) con `refresh_token` (6 meses). Si falla, marca la conexión como “reconectar” y bloquea checkouts.
- “Desconectar” borra credenciales y desactiva checkouts.
- `MERCADOPAGO_WEBHOOK_SECRET` es **por aplicación**, no por organización. El access token sí es por organización.
- `obtenerProveedorPago(orgId)` lee el token de la organización; si no hay conexión, responde “pagos no configurados” (409). No caigas al token global.
- Guarda credenciales en `credenciales_pago` con RLS, cifradas con AES-256-GCM (patrón de `web/src/lib/meta/credentials.ts`) y una llave dedicada `PAGOS_TOKEN_ENCRYPTION_KEY`.
- UI en `PagosConfig`: “Conectar Mercado Pago”, cuenta conectada, vencimiento, “Reconectar” y “Desconectar”. Nunca devuelvas tokens al navegador.
- Credenciales manuales solo para desarrollo/piloto detrás de `PAGOS_PERMITIR_CREDENCIALES_MANUALES=1`.
- Variables nuevas: `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_REDIRECT_URI`, `MERCADOPAGO_WEBHOOK_SECRET`, `PAGOS_TOKEN_ENCRYPTION_KEY`, `PAGOS_BASE_URL`.
- Pruebas: state inválido/CSRF, code inválido, refresh, token expirado, reconexión, dos organizaciones con tokens distintos, RLS.

### B. Reembolsos con un solo total

- Usa **un solo campo acumulado** `monto_reembolsado` en `pagos_online` como fuente de verdad. No agregues una tabla de reembolsos visible ni múltiples campos.
- Cada reembolso incrementa el total de forma atómica; rechaza si supera `monto`.
- Idempotencia por intento de reembolso para no contar dos veces.
- Reembolso total: estado `reembolsado`. Reembolso parcial: sigue `aprobado` con `monto_reembolsado` actualizado.
- Para auditoría, registra un evento `refund` en `eventos_pago`; no lo uses como segunda fuente de verdad.
- UI: “Reembolsado $X de $Y” y un solo formulario de reembolso.
- Pruebas: parcial + parcial = total; tercero rechazado; duplicado idempotente; RLS.

### C. Concurrencia de checkout y múltiples enlaces

- Agrega un índice único parcial: un solo pago `pendiente` por `(org_id, origen_tipo, origen_id)`.
- `crearCheckoutVenta` debe capturar `P2002` y devolver el pago pendiente existente en lugar de un 500.
- Valida que la clave de idempotencia corresponda al mismo origen; si no, rechaza.
- Si el pago existente está `rechazado` o `cancelado`, permite un nuevo intento con una clave nueva.
- Pruebas: dos checkouts simultáneos → uno pendiente; reintento tras rechazo; misma clave con otro origen → rechazo.

### D. Estado de la venta y pagos tardíos

- Dentro de la transacción, bloquea la venta con `FOR UPDATE`.
- **Una venta cancelada no acepta pagos tardíos:** no la marques `pagada`; registra el pago como `aprobado` con `metadata.conflicto="venta_cancelada"` y `requiere_reembolso=true`; intenta el reembolso automático si hay credenciales y, si falla, crea una alerta/tarea.
- No regreses ventas `preparando`, `lista` o `entregada` a `pagada`; registra el conflicto y deja el pago para revisión/reembolso.
- Solo pasa a `pagada` si el estado actual es `pendiente` (o el estado inicial definido).
- Si el total actual de la venta cambió respecto al pago, no acredites; deja conflicto y revisión.
- Pruebas: venta cancelada + pago tardío; venta entregada + segundo pago; total cambiado.

### E. Enrutamiento del webhook

- No dependas de `?org=` en la URL del webhook; Mercado Pago puede alterar la query.
- Usa la organización en el path: `/api/public/pagos/webhook/mercado_pago/[org]`.
- La firma se valida con `MERCADOPAGO_WEBHOOK_SECRET` (secreto de la aplicación). El `org` del path solo enruta; la autenticidad la da la firma y la consulta del pago.
- Actualiza `notification_url` y la documentación.
- Pruebas HTTP de la ruta: firma válida, firma inválida, organización incorrecta, proveedor incorrecto, evento duplicado.

### F. Cron de conciliación

- Envuelve cada organización en try/catch; un error no debe abortar el resto.
- Salta organizaciones sin credenciales o sin módulo activo.
- Registra motivo del error y pago afectado.
- Prueba con una organización sin credenciales y otra con pago pendiente.

### G. UI de cobro

- `CobroEnLinea` debe mostrar monto, proveedor, estado y monto reembolsado.
- Permite reintentar cuando el pago esté `rechazado` o `cancelado`.
- Permite regenerar enlace si el checkout expiró.
- Evita `window.open` después de un `await` que el navegador pueda bloquear; abre una pestaña síncrona o usa navegación/link.
- Agrega acción de reembolso para puestos permitidos.
- `ventas/page.tsx`: elige el pago correcto por venta (pendiente primero, luego el más reciente), no uses un `Map` que se sobrescribe; consulta solo pagos de las ventas listadas.

### H. Mock y producción

- Bloquea el proveedor `mock` cuando `NODE_ENV=production` salvo `PAGOS_PERMITIR_MOCK=1`.
- Valida también en `/api/modulos`.
- Muestra advertencia visible en la UI.

### I. Pruebas y evidencia

- Agrega pruebas de ruta HTTP para webhook (no solo servicio).
- Agrega concurrencia con **dos eventos distintos** para el mismo pago, no solo el mismo evento repetido.
- Agrega reembolsos parciales acumulativos, checkouts simultáneos, venta cancelada, cron con error por organización y RLS con dos empresas.
- Ejecuta: `npx prisma validate`, `npx tsc --noEmit`, `npm run lint`, `npm run check:pagos-online`, `npm run build`.
- Mantén `next build --webpack` si es necesario; documenta el motivo y no cambies otras partes del build.

### J. RLS y permisos

- Revoca `DELETE` innecesario sobre `pagos_online` y `eventos_pago` al rol `crm_app`; conserva lo que la app realmente usa.
- Si es viable, agrega FK compuesta `(org_id, pago_id)` en `eventos_pago` para impedir cruces de empresa.
- Agrega rate limit al checkout por organización/usuario.
- No registres secretos ni PII en logs.

### K. Menú y UX

- `pagos_en_linea` apunta a `/ventas` y duplica el menú “Ventas”. Corrige: crea una página dedicada de pagos o marca el módulo como configuración sin entrada de menú.
- La página pública de resultado no debe afirmar “Pago recibido” solo por el query param; usa un token o muestra “Estamos confirmando”.

## Criterios de aceptación

- [ ] Cada organización conecta su cuenta por OAuth y sus tokens quedan cifrados.
- [ ] No se puede sobre-reembolsar ni duplicar reembolsos; el total reembolsado es uno solo.
- [ ] Dos checkouts simultáneos no crean dos pendientes.
- [ ] Una venta cancelada no revive ni acepta pagos tardíos: no se acredita y queda en conflicto/reembolso.
- [ ] El webhook se enruta por path y valida la firma de la aplicación.
- [ ] El cron continúa si una organización falla.
- [ ] La UI permite reintentar, copiar/regenerar enlace y reembolsar según permisos.
- [ ] Mock bloqueado en producción.
- [ ] Pruebas HTTP, concurrencia, reembolsos, RLS y cron aprobadas.
- [ ] `prisma validate`, `tsc`, ESLint, check y build aprobados.
- [ ] Sin push, merge, deploy ni credenciales reales.

## Entrega

Responde con:

1. Rama y commits locales.
2. Archivos cambiados.
3. Decisiones y supuestos.
4. Comandos y resultados.
5. Evidencia de RLS, concurrencia y reembolsos.
6. Pendientes externos (client_id/client_secret de la aplicación, redirect URI, webhook HTTPS, cuenta piloto).
7. Riesgos para la revisión de Julio.

No avances a CFDI. No hagas push. No despliegues.
