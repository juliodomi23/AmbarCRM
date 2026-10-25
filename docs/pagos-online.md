# Pagos en línea — ADR y operación

## Decisión

Se adopta Mercado Pago Checkout Pro para México. Encaja con el mercado objetivo, permite enviar un enlace alojado por el proveedor y evita que AmbarCRM procese datos de tarjeta. Stripe se conserva como adaptador futuro: su API es sólida, pero no se implementa en esta fase para no duplicar integración, conciliación y operación antes de validar el flujo principal.

La aplicación usa la interfaz `ProveedorPago`; `ProveedorMercadoPago` llama las APIs HTTP con `fetch` nativo y `ProveedorMock` cubre pruebas sin red. No se agregó una dependencia.

## Flujo

1. Una venta vigente solicita checkout. El servidor vuelve a leer total y moneda; ignora cualquier monto del navegador.
2. Se crea `pagos_online` con una clave idempotente por venta y se solicita la preferencia al proveedor.
3. El cliente abre o copia la URL del checkout alojado.
4. Mercado Pago firma el webhook. AmbarCRM valida HMAC, `x-request-id`, `data.id` y una ventana máxima de cinco minutos; luego consulta el pago directamente al proveedor.
5. En una transacción con contexto de organización se bloquea el pago, se registra `eventos_pago` y se comparan monto y moneda.
6. Solo un pago aprobado marca la venta como `pagada` y registra `pagos_venta`. La restricción única y el bloqueo evitan doble aplicación.
7. El cron vuelve a consultar pagos pendientes. Los reembolsos requieren Administrador, Cajero, Ventas o Encargado de tienda.

```text
venta → checkout pendiente → webhook firmado → evento único
                                      ├─ monto/moneda incorrectos → rechazado
                                      └─ aprobado → venta pagada + pago de venta
```

## Modelo e idempotencia

- `pagos_online`: importe `NUMERIC(12,2)`, moneda, origen polimórfico, estado, preferencia, payment id, checkout, expiración y clave idempotente única por organización.
- `eventos_pago`: evento único por organización/proveedor y payload mínimo sin PII.
- Ambas tablas llevan `org_id`, FK a `orgs`, índices, RLS `USING` + `WITH CHECK` y permisos explícitos para `crm_app`.
- El evento se procesa dentro de la misma transacción que el origen. Un duplicado concurrente pierde por la restricción única y se responde como duplicado.
- Un estado aprobado no retrocede por una notificación tardía pendiente o rechazada.

## Alcance de origen

El modelo admite `venta`, `cita`, `cotizacion` y `pedido`, pero la API solo acepta `venta` en esta fase. El código actual no define un total cobrable ni un estado pagado homogéneo para los otros tres tipos; inventarlo rompería sus reglas. Se documentan como extensión posterior.

## Variables

```env
PAGOS_PROVEEDOR=mercado_pago
MERCADOPAGO_ACCESS_TOKEN=<secreto-del-servidor>
MERCADOPAGO_WEBHOOK_SECRET=<firma-secreta-del-webhook>
NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY=<llave-publica>
PAGOS_BASE_URL=https://crm.ejemplo.com
PAGOS_MOCK_SECRET=<solo-pruebas>
```

Los secretos nunca se guardan en `modulos_org`. La configuración por empresa contiene proveedor, moneda, modo sandbox, llave pública y puestos permitidos. El módulo no se activa por defecto.

## Webhook y sandbox

Configura en Mercado Pago la URL HTTPS:

`https://crm.ejemplo.com/api/public/pagos/webhook/mercado_pago?org=<id-org>`

La URL generada por checkout ya incluye la organización. Ese parámetro solo enruta: no autoriza; la autenticidad depende de la firma y los datos finales se consultan a Mercado Pago. La cuenta debe suscribir eventos `payment`.

Para pruebas locales usa `PAGOS_PROVEEDOR=mock`, `PAGOS_MOCK_SECRET` y una base PostgreSQL desechable. El mock exige `x-mock-timestamp` y `x-mock-signature=HMAC_SHA256(secret, timestamp + "." + cuerpo)`.

## Pruebas

```bash
npx prisma validate
npx tsc --noEmit
npm run lint
npx tsx scripts/check-pagos-online.ts
npm run build
```

El check puro valida firmas, replay y reglas de estados. El E2E requiere `DATABASE_URL` y `ADMIN_DATABASE_URL` apuntando exclusivamente a `localhost/pagos_test`; valida duplicados, concurrencia, monto/moneda, actualización única y aislamiento RLS.

## Riesgos y operación

- `Number` se usa únicamente en el borde JSON que Mercado Pago exige como número. Cálculo, persistencia y comparación permanecen en `Decimal/NUMERIC`.
- Rotar el secreto de webhook requiere actualizar la variable y la integración de Mercado Pago de forma coordinada.
- No se guardan payloads completos, nombres, correos, tarjetas ni tokens del pagador.
- Antes de producción se debe probar con una cuenta sandbox real, después con un cobro de importe mínimo y un reembolso controlado.
