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
6. Solo una venta todavía `pendiente`, con el mismo total, pasa a `pagada`. Un pago tardío de una venta cancelada o avanzada queda aprobado y crea una tarea de revisión sin acreditar la venta.
7. El cron vuelve a consultar pagos pendientes. Los reembolsos requieren Administrador, Cajero, Ventas o Encargado de tienda.

```text
venta → checkout pendiente → webhook firmado → evento único
                                      ├─ monto/moneda incorrectos → rechazado
                                      └─ aprobado → venta pagada + pago de venta
```

## Modelo e idempotencia

- `pagos_online`: importe `NUMERIC(12,2)`, moneda, origen polimórfico, estado, preferencia, payment id, checkout, expiración y clave idempotente única por organización.
- `eventos_pago`: evento único por organización/proveedor y payload mínimo sin PII.
- `credenciales_pago`: secretos cifrados AES-256-GCM por organización y proveedor. La API solo devuelve el estado “configurado”.
- `reembolsos_pago`: cada parcial con importe, estado, referencia e idempotencia; `pagos_online.monto_reembolsado` mantiene el acumulado.
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
MERCADOPAGO_ACCESS_TOKEN=<secreto-del-servidor>
MERCADOPAGO_WEBHOOK_SECRET=<firma-secreta-del-webhook>
MERCADOPAGO_SANDBOX=1
PAGOS_BASE_URL=https://crm.ejemplo.com
PAGOS_MOCK_SECRET=<solo-pruebas>
PAGOS_PERMITIR_MOCK=0
```

La configuración normal se guarda desde Configuración en `credenciales_pago`; los secretos se cifran y nunca se devuelven al navegador. Las variables `MERCADOPAGO_*` y `PAGOS_PROVEEDOR` son únicamente un fallback de transición y solo funcionan si el `org_id` coincide exactamente con `PAGOS_ORG_PILOTO`. No existe fallback global multiempresa. El módulo no se activa por defecto.

## Webhook y sandbox

Configura en Mercado Pago la URL HTTPS:

`https://crm.ejemplo.com/api/public/pagos/webhook/mercado_pago/<id-org>`

La organización viaja en el path, no en una query mutable. Solo enruta: no autoriza; la autenticidad depende del secreto propio de esa organización y los datos finales se consultan a Mercado Pago. La cuenta debe suscribir eventos `payment`.

Para pruebas locales usa una credencial `mock` o el fallback acotado con `PAGOS_ORG_PILOTO`, `PAGOS_PROVEEDOR=mock` y `PAGOS_MOCK_SECRET`, siempre con una base PostgreSQL desechable. En producción el mock requiere además `PAGOS_PERMITIR_MOCK=1`. El mock exige `x-mock-timestamp` y `x-mock-signature=HMAC_SHA256(secret, timestamp + "." + cuerpo)`.

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
- Rotar el secreto de webhook requiere guardar la nueva credencial y actualizar la integración de Mercado Pago de forma coordinada.
- No se guardan payloads completos, nombres, correos, tarjetas ni tokens del pagador.
- Antes de producción se debe probar con una cuenta sandbox real, después con un cobro de importe mínimo y un reembolso controlado.
