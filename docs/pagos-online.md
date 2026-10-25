# Pagos en línea — ADR y operación

## Decisión

Se adopta Mercado Pago Checkout Pro para México. Encaja con el mercado objetivo, permite enviar un enlace alojado por el proveedor y evita que AmbarCRM procese datos de tarjeta. Stripe se conserva como adaptador futuro: su API es sólida, pero no se implementa en esta fase para no duplicar integración, conciliación y operación antes de validar el flujo principal.

La aplicación usa la interfaz `ProveedorPago`; `ProveedorMercadoPago` llama las APIs HTTP con `fetch` nativo y `ProveedorMock` cubre pruebas sin red. No se agregó una dependencia.

## Flujo

1. Una venta vigente solicita checkout. El servidor vuelve a leer total y moneda; ignora cualquier monto del navegador.
2. Se crea `pagos_online` con una clave idempotente y el índice parcial garantiza un solo pago pendiente por venta.
3. El cliente abre o copia la URL del checkout alojado.
4. Mercado Pago firma el webhook. AmbarCRM valida HMAC, `x-request-id`, `data.id` y una ventana máxima de cinco minutos; luego consulta el pago directamente al proveedor.
5. En una transacción con contexto de organización se bloquean el pago y la venta, se registra `eventos_pago` y se comparan monto y moneda.
6. Solo una venta todavía `pendiente`, con el mismo total, pasa a `pagada`. Un pago tardío sobre una venta cancelada, avanzada o con total modificado no acredita la venta: queda marcado como conflicto y se intenta reembolsar automáticamente. Si falla, se crea una tarea de revisión.
7. El cron vuelve a consultar pagos y reembolsos pendientes. Los reembolsos requieren Administrador, Cajero, Ventas o Encargado de tienda.

```text
venta → checkout pendiente → webhook firmado → evento único
                                      ├─ monto/moneda incorrectos → rechazado
                                      └─ aprobado → venta pagada + pago de venta
```

## Modelo e idempotencia

- `pagos_online`: importe `NUMERIC(12,2)`, moneda, origen polimórfico, estado, preferencia, payment id, checkout, expiración y clave idempotente única por organización.
- `eventos_pago`: evento único por organización/proveedor y payload mínimo sin PII.
- `credenciales_pago`: access y refresh token OAuth cifrados AES-256-GCM por organización, vencimiento, usuario del proveedor, scope y estado de reconexión. La API nunca devuelve tokens al navegador.
- `reembolsos_pago`: reserva e idempotencia mientras un reembolso está pendiente. El único total visible y contable es `pagos_online.monto_reembolsado`.
- Las cuatro tablas llevan `org_id`, índices, RLS `USING` + `WITH CHECK` y permisos explícitos para `crm_app`. Pagos y eventos no permiten `DELETE`.
- El evento se procesa dentro de la misma transacción que el origen. Un duplicado concurrente pierde por la restricción única y se responde como duplicado.
- Un estado aprobado no retrocede por una notificación tardía pendiente o rechazada.

## Alcance de origen

El modelo admite `venta`, `cita`, `cotizacion` y `pedido`, pero la API solo acepta `venta` en esta fase. El código actual no define un total cobrable ni un estado pagado homogéneo para los otros tres tipos; inventarlo rompería sus reglas. Se documentan como extensión posterior.

## Variables

```env
PAGOS_PROVEEDOR=mercado_pago
PAGOS_ORG_PILOTO=<id-de-la-unica-org-autorizada-para-fallback>
PAGOS_TOKEN_ENCRYPTION_KEY=<base64-de-32-bytes>
PAGOS_BASE_URL=https://crm.ejemplo.com
PAGOS_PERMITIR_MOCK=0
PAGOS_MOCK_SECRET=<solo-pruebas>
PAGOS_PERMITIR_CREDENCIALES_MANUALES=0
MERCADOPAGO_CLIENT_ID=<id-de-la-aplicacion>
MERCADOPAGO_CLIENT_SECRET=<secreto-de-la-aplicacion>
MERCADOPAGO_REDIRECT_URI=https://crm.ejemplo.com/api/pagos/oauth/callback
MERCADOPAGO_WEBHOOK_SECRET=<firma-global-de-la-aplicacion>
MERCADOPAGO_SANDBOX=1
# Obsoleto; solo fallback transitorio para PAGOS_ORG_PILOTO:
MERCADOPAGO_ACCESS_TOKEN=
```

## Conexión OAuth por organización

El administrador usa **Conectar Mercado Pago**. AmbarCRM crea un `state` firmado ligado a su organización, usuario y cookie HttpOnly, y Mercado Pago devuelve el `authorization_code` exclusivamente a `MERCADOPAGO_REDIRECT_URI`. El callback valida el estado, intercambia el código y cifra access/refresh token. Se solicita `offline_access`; cuando el token está a siete días de vencer se renueva antes de crear el checkout. Un refresh rechazado marca la conexión para reconectar y bloquea nuevos enlaces.

La configuración normal se guarda en `credenciales_pago`. El pegado manual solo existe en desarrollo/piloto con `PAGOS_PERMITIR_CREDENCIALES_MANUALES=1` y siempre se rechaza en producción. `MERCADOPAGO_ACCESS_TOKEN` y `PAGOS_PROVEEDOR` son un fallback de transición que solo funciona si `org_id` coincide exactamente con `PAGOS_ORG_PILOTO`; no existe fallback global multiempresa. El módulo no se activa por defecto.

## Webhook y sandbox

Configura en Mercado Pago la URL HTTPS:

`https://crm.ejemplo.com/api/public/pagos/webhook/mercado_pago/<id-org>`

La organización viaja en el path, no en una query mutable. Solo enruta: no autoriza. La autenticidad usa `MERCADOPAGO_WEBHOOK_SECRET`, que pertenece a la aplicación y no a cada organización; después, los datos finales se consultan a Mercado Pago con el token OAuth de la organización. La aplicación debe suscribir eventos `payment`.

Para pruebas locales usa una credencial `mock` o el fallback acotado con `PAGOS_ORG_PILOTO`, `PAGOS_PROVEEDOR=mock` y `PAGOS_MOCK_SECRET`, siempre con una base PostgreSQL desechable. En producción el mock requiere además `PAGOS_PERMITIR_MOCK=1`. El mock exige `x-mock-timestamp` y `x-mock-signature=HMAC_SHA256(secret, timestamp + "." + cuerpo)`. Antes de producción registra exactamente el redirect URI, configura el webhook HTTPS y completa una prueba sandbox de cobro, parcial, total y contracargo.

## Reembolsos y migración

El disponible se calcula como `monto - montoReembolsado - reservas pendientes`. Un parcial conserva el pago `aprobado`; al llegar al total cambia a `reembolsado`. Los webhooks usan `transaction_amount_refunded`; un contracargo es una incidencia separada y crea revisión. El cron confirma o rechaza reservas pendientes y libera las que el proveedor rechaza.

Los SQL de instalación pueden repetirse. Antes de crear el índice de un checkout pendiente por origen, conservan el más reciente y cancelan duplicados con motivo de migración. También agregan el total reembolsado con su límite, vuelven nullable el secreto legado del webhook y añaden las columnas OAuth sin borrar credenciales existentes. Ejecuta `schema.sql`, `multi-tenant.sql` y `actualizaciones.sql` dos veces en una copia o base desechable antes de producción.

## Pruebas

```bash
npx prisma validate
npx tsc --noEmit
npm run lint
npx tsx scripts/check-pagos-online.ts
npm run build
```

El check puro valida firmas, replay y reglas del adaptador. El E2E requiere `DATABASE_URL` y `ADMIN_DATABASE_URL` apuntando exclusivamente a `localhost/pagos_test`; valida la ruta HTTP, dos eventos concurrentes distintos, checkout concurrente, pagos tardíos, reembolsos parciales acumulativos, cron tolerante a fallos y RLS con dos empresas.

## Riesgos y operación

- `Number` se usa únicamente en el borde JSON que Mercado Pago exige como número. Cálculo, persistencia y comparación permanecen en `Decimal/NUMERIC`.
- Rotar el secreto global de webhook requiere actualizar la variable de la aplicación y la configuración de Mercado Pago de forma coordinada.
- No se guardan payloads completos, nombres, correos, tarjetas ni tokens del pagador.
- Antes de producción se debe probar con una cuenta sandbox real, después con un cobro de importe mínimo y un reembolso controlado.
