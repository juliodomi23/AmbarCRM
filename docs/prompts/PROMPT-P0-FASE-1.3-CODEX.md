# Prompt para Codex — Fase 1.3: cierre de pagos

> Copia todo este archivo en Codex. Esta fase cierra los huecos que quedaron en `443f775`.
> No implementa CFDI ni otras fases. No rehagas lo que ya funciona.

## Contexto

- Repo: AmbarCRM (Next.js 16, TypeScript, Prisma, PostgreSQL 16, multi-tenant con RLS).
- Rama base: `codex/p0-fase-1.2-pagos` (commit `443f775`).
- Rama nueva: `codex/p0-fase-1.3-pagos`.
- No hagas push, merge ni deploy.
- No uses credenciales reales. Usa sandbox/mocks y variables documentadas.

## Lectura obligatoria

1. `PLAN-P0-COMPETITIVIDAD.md` (Fase 1).
2. `docs/pagos-online.md`.
3. `web/src/lib/pagos/oauth.ts`, `proveedor.ts`, `mercado-pago.ts`, `servicio-endurecido.ts`.
4. `web/src/app/api/pagos/oauth/*`, `web/src/app/api/pagos/credenciales`, `web/src/app/api/pagos/[id]/reembolso`.
5. `web/src/components/config/PagosConfigSeguro.tsx`, `ConfiguracionCliente.tsx`.
6. `web/src/components/retail/CobroEnLinea.tsx`.
7. `web/prisma/scripts/test-pagos-online-e2e.ts` y `web/scripts/check-pagos-online.ts`.
8. Documentación oficial de Mercado Pago: authorization URL (`platform_id`), `/oauth/token`, `test_token`, PKCE y webhooks.

## Lo que ya está bien y NO debes rehacer

- OAuth por organización, tokens cifrados, refresh y reconexión.
- Webhook con secreto global de aplicación y path con organización.
- Un solo pendiente por venta, concurrencia de checkout y `pagoVenta` con `upsert`.
- Venta cancelada/avanzada: conflicto y reembolso automático.
- Acumulado único `montoReembolsado`, reservas pendientes, contracargos separados y cron tolerante.
- RLS, FK compuesta, bloqueo de credenciales manuales en producción y menú config-only.
- UI de reintento, regeneración de enlace, reembolso inline y badge de revisión.

## Correcciones obligatorias

### 1. OAuth real: `platform_id` y sandbox

En `web/src/lib/pagos/oauth.ts`:

- Agrega `platform_id=mp` a la URL de autorización. Los docs de Mercado Pago lo incluyen:
  `https://auth.mercadopago.com/authorization?client_id=...&response_type=code&platform_id=mp&state=...&redirect_uri=...`
- En el intercambio `/oauth/token`, envía `test_token: "true"` cuando se esté probando sandbox. Agrega `MERCADOPAGO_TEST_TOKEN=0` (o usa `MERCADOPAGO_SANDBOX=1`) y documenta la diferencia.
- Agrega una prueba que verifique `platform_id` en la URL y el `test_token` en el cuerpo del token cuando el modo sandbox esté activo.
- Si se habilita PKCE en la app de Mercado Pago, implementa `code_verifier`/`code_challenge` S256 y su validación; si no, documenta explícitamente que PKCE debe quedar desactivado en el panel de Mercado Pago. No dejes un flujo que falle si el panel tiene PKCE activo.

### 2. Error de red en reembolsos (bloqueante)

En `servicio-endurecido.ts`, `reembolsarPago` hoy marca la reserva como `rechazado` si el proveedor lanza un error de red. Eso puede provocar doble reembolso si el proveedor sí procesó la operación y se perdió la respuesta.

- En error de red/timeout: deja la reserva `pendiente` (o un estado `reintentar`), guarda el motivo y reintenta con **la misma idempotency key**.
- Solo marca `rechazado` cuando el proveedor responda explícitamente `rejected`/`cancelled`.
- Si no hay referencia del reembolso, no la marques rechazada automáticamente por tiempo; deja revisión/alerta y reintenta de forma segura.
- Agrega columnas/campos si hacen falta (`ultimoError`, `reintentarAt`, `intentos`) y actualiza la migración.
- Pruebas: proveedor que lanza error después de procesar, reintento con la misma clave, un solo reembolso; proveedor que rechaza explícitamente.

### 3. UI de reembolso: estados reales

En `CobroEnLinea.tsx`:

- Hoy muestra “Reembolso registrado” sin importar el estado del proveedor.
- Lee `resultado.estado`:
  - `aprobado`: “Reembolso aprobado”.
  - `pendiente`: “Reembolso en proceso”; no cierres el formulario como si estuviera terminado.
  - `rechazado`: muestra error y conserva el formulario para reintentar.
- Refresca la venta después de cada resultado.
- Si el pago está en revisión/conflicto, muestra el motivo cuando esté disponible.
- No permitas solicitar más que el disponible que muestra el servidor; el servidor sigue siendo la autoridad.

### 4. Feedback del callback OAuth

- El callback redirige a `/configuracion?tab=modulos&pagos=conectado|error`.
- `ConfiguracionCliente` o `TabModulos` debe leer `pagos` y mostrar un toast/aviso:
  - `conectado`: “Mercado Pago conectado”.
  - `error`: “No se pudo conectar Mercado Pago; revisa la configuración”.
- Limpia el parámetro de la URL después de mostrarlo.
- Si el callback falla por sesión expirada, redirige a login en vez de devolver JSON 401.

### 5. Webhooks de reembolso sin monto y metadata de conflicto

- Si Mercado Pago reporta `refunded` sin `transaction_amount_refunded` o con 0:
  - No lo trates como aprobado silencioso.
  - Crea una tarea de revisión y conserva el pago en un estado seguro (`aprobado` con conflicto o `reembolsado` solo si el monto es verificable).
- Cuando un reembolso externo llegue al total, limpia `metadata.conflicto` y `metadata.requiereReembolso` (o marca el conflicto como resuelto) para que la UI no siga mostrando “en revisión”.
- No marques un contracargo como reembolso; ya está separado, consérvalo.
- Pruebas: `refunded` sin monto, `refunded` parcial, `refunded` total externo, contracargo y metadata final.

### 6. Errores de configuración claros

- Si falta `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_CLIENT_ID/SECRET/REDIRECT_URI` o `PAGOS_TOKEN_ENCRYPTION_KEY`, devuelve un `409/503` con mensaje claro (“Pagos no configurados”), no un 500 genérico.
- `obtenerProveedorPago` debe convertir esos casos a `ErrorConfiguracionPagos`.
- `PagosConfigSeguro` debe mostrar el error de configuración, no quedarse en “Consultando conexión…”.

### 7. Robustez menor

- En `PagosConfigSeguro`, envuelve `fetch` de credenciales y `desconectar` en try/catch/finally para que `cargando` no quede colgado.
- Valida que el monto de reembolso tenga máximo 2 decimales y sea positivo antes de enviarlo.
- En `pagos/resultado`, evita afirmar un estado definitivo solo por el query param; muestra “Estamos confirmando” o usa un token de pago. No es bloqueante, pero no debe confundir.
- Revisa que `pagos_en_linea` siga oculto del menú y que `Configuración → Módulos` sea el único acceso.

### 8. Pruebas y evidencia

- `check:pagos-online`: `platform_id`, `test_token`, PKCE (si aplica), firma de aplicación.
- E2E PostgreSQL:
  - OAuth callback/estado (si se puede simular sin red).
  - Error de red de reembolso y reintento idempotente.
  - `refunded` sin monto, parcial, total y contracargo.
  - Metadata de conflicto limpia tras reembolso total.
  - Pago tardío en venta cancelada y reembolso automático.
  - `pagoVenta` upsert.
  - RLS con dos empresas.
- Ejecuta: `npx prisma validate`, `npx tsc --noEmit`, `npm run lint`, `npm run check:pagos-online`, `npm run build`.
- Mantén `next build --webpack` y documenta el motivo; no cambies otras partes del build.

## Criterios de aceptación

- [ ] La URL de autorización incluye `platform_id=mp`.
- [ ] El flujo sandbox usa `test_token` correctamente o queda documentado y probado.
- [ ] PKCE está implementado o explícitamente desactivado en la app y documentado.
- [ ] Un error de red en reembolso no marca rechazado ni permite doble reembolso.
- [ ] La UI muestra aprobado/pendiente/rechazado real y no miente.
- [ ] El callback OAuth muestra confirmación/error al usuario.
- [ ] Un reembolso sin monto genera revisión; un total limpia el conflicto.
- [ ] Los errores de configuración devuelven 409/503 claros.
- [ ] Pruebas y checks verdes.
- [ ] Sin push, merge, deploy ni credenciales reales.

## Entrega

1. Rama y commits locales.
2. Archivos cambiados.
3. Decisiones y supuestos.
4. Comandos y resultados.
5. Evidencia de OAuth real, reembolso con error de red, webhooks y UI.
6. Pendientes externos (app de Mercado Pago, redirect URI, sandbox, webhook HTTPS).
7. Riesgos para revisión de Julio.

No avances a CFDI. No hagas push. No despliegues.
