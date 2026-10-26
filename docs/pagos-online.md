# Pagos en línea — ADR y operación

## Decisión

Mercado Pago Checkout Pro sigue disponible para México y Stripe se incorpora como segundo proveedor. Ambos alojan el formulario de pago y evitan que AmbarCRM procese datos de tarjeta. Cada organización guarda sus credenciales por proveedor y elige un proveedor predeterminado para los cobros nuevos.

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
- `credenciales_pago`: Mercado Pago guarda sus tokens OAuth cifrados AES-256-GCM; Stripe guarda solo el `acct_...` en `user_id`, el modo test/live y los estados de onboarding. La API nunca devuelve tokens al navegador.
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
MERCADOPAGO_TEST_TOKEN=1
MERCADOPAGO_PKCE=0
# Obsoleto; solo fallback transitorio para PAGOS_ORG_PILOTO:
MERCADOPAGO_ACCESS_TOKEN=
```

## Conexión OAuth por organización

El administrador usa **Conectar Mercado Pago**. AmbarCRM crea un `state` firmado ligado a su organización, usuario y cookie HttpOnly, añade `platform_id=mp`, y Mercado Pago devuelve el `authorization_code` exclusivamente a `MERCADOPAGO_REDIRECT_URI`. El callback valida el estado, intercambia el código y cifra access/refresh token. Se solicita `offline_access`; cuando el token está a siete días de vencer se renueva antes de crear el checkout. Un refresh rechazado marca la conexión para reconectar y bloquea nuevos enlaces.

`MERCADOPAGO_TEST_TOKEN=1` envía `test_token: "true"` al crear la credencial OAuth; si la variable se omite, hereda `MERCADOPAGO_SANDBOX`. No uses un test token para cobros productivos. PKCE es opcional pero debe coincidir con el panel de Mercado Pago: con `MERCADOPAGO_PKCE=1`, AmbarCRM genera `code_verifier`, envía `code_challenge` S256 y conserva el verificador en la cookie HttpOnly hasta el callback. Con `MERCADOPAGO_PKCE=0`, PKCE debe quedar desactivado en la aplicación de Mercado Pago.

La configuración normal se guarda en `credenciales_pago`. El pegado manual solo existe en desarrollo/piloto con `PAGOS_PERMITIR_CREDENCIALES_MANUALES=1` y siempre se rechaza en producción. `MERCADOPAGO_ACCESS_TOKEN` y `PAGOS_PROVEEDOR` son un fallback de transición que solo funciona si `org_id` coincide exactamente con `PAGOS_ORG_PILOTO`; no existe fallback global multiempresa. El módulo no se activa por defecto.

## Webhook y sandbox

Configura en Mercado Pago la URL HTTPS:

`https://crm.ejemplo.com/api/public/pagos/webhook/mercado_pago/<id-org>`

La organización viaja en el path, no en una query mutable. Solo enruta: no autoriza. La autenticidad usa `MERCADOPAGO_WEBHOOK_SECRET`, que pertenece a la aplicación y no a cada organización; después, los datos finales se consultan a Mercado Pago con el token OAuth de la organización. La aplicación debe suscribir eventos `payment`.

Para pruebas locales usa una credencial `mock` o el fallback acotado con `PAGOS_ORG_PILOTO`, `PAGOS_PROVEEDOR=mock` y `PAGOS_MOCK_SECRET`, siempre con una base PostgreSQL desechable. En producción el mock requiere además `PAGOS_PERMITIR_MOCK=1`. El mock exige `x-mock-timestamp` y `x-mock-signature=HMAC_SHA256(secret, timestamp + "." + cuerpo)`. Antes de producción registra exactamente el redirect URI, configura el webhook HTTPS y completa una prueba sandbox de cobro, parcial, total y contracargo.

## Reembolsos y migración

El disponible se calcula como `monto - montoReembolsado - reservas pendientes`. Un parcial conserva el pago `aprobado`; al llegar al total cambia a `reembolsado`. Los webhooks usan `transaction_amount_refunded`; un contracargo es una incidencia separada y crea revisión. Si una llamada de reembolso pierde la respuesta por red, la reserva permanece pendiente con error, intentos y fecha de reintento: el cron repite con la misma clave de idempotencia. Solo una respuesta explícita `rejected`/`cancelled` libera la reserva como rechazada.

Los SQL de instalación pueden repetirse. Antes de crear el índice de un checkout pendiente por origen, conservan el más reciente y cancelan duplicados con motivo de migración. También agregan el total reembolsado con su límite, vuelven nullable el secreto legado del webhook y añaden las columnas OAuth sin borrar credenciales existentes. Ejecuta `schema.sql`, `multi-tenant.sql` y `actualizaciones.sql` dos veces en una copia o base desechable antes de producción.

## Pruebas

```bash
npx prisma validate
npx tsc --noEmit
npm run lint
npx tsx scripts/check-pagos-online.ts
npm run build
```

El build conserva `next build --webpack` porque la configuración y el conjunto actual de dependencias del proyecto están validados con Webpack; esta fase no cambia el empaquetador.

El check puro valida firmas, replay y reglas del adaptador. El E2E requiere `DATABASE_URL` y `ADMIN_DATABASE_URL` apuntando exclusivamente a `localhost/pagos_test`; valida la ruta HTTP, dos eventos concurrentes distintos, checkout concurrente, pagos tardíos, reembolsos parciales acumulativos, cron tolerante a fallos y RLS con dos empresas.

## Riesgos y operación

- `Number` se usa únicamente en el borde JSON que Mercado Pago exige como número. Cálculo, persistencia y comparación permanecen en `Decimal/NUMERIC`.
- Rotar el secreto global de webhook requiere actualizar la variable de la aplicación y la configuración de Mercado Pago de forma coordinada.
- No se guardan payloads completos, nombres, correos, tarjetas ni tokens del pagador.
- Antes de producción se debe probar con una cuenta sandbox real, después con un cobro de importe mínimo y un reembolso controlado.

## Stripe Connect con cuentas Standard

Stripe usa Connect Onboarding para cuentas `type=standard`, en vez de OAuth. Stripe desaconseja OAuth para nuevas plataformas Connect y recomienda onboarding Standard con Account Links. Account Links crea una cuenta nueva; conectar una cuenta Stripe que ya existía requeriría OAuth y queda pendiente. Referencias: [OAuth y recomendación para cuentas Standard](https://docs.stripe.com/connect/oauth-standard-accounts), [Connect Onboarding Standard](https://docs.stripe.com/connect/standard-accounts).

La plataforma crea la cuenta con `STRIPE_SECRET_KEY`, solicita un Account Link y guarda únicamente el `acct_...` en `credenciales_pago.user_id`. No hay tokens por organización. Las operaciones sobre la cuenta conectada usan la llave secreta de la plataforma y el encabezado `Stripe-Account: acct_...` ([autenticación de cuentas conectadas](https://docs.stripe.com/connect/authentication)). La cuenta debe tener `charges_enabled=true` para crear checkouts. La respuesta de retorno solo indica que el usuario salió del onboarding: el servidor consulta la cuenta y también escucha `account.updated` antes de habilitar cobros.

El state de `return_url` y `refresh_url` queda firmado y ligado a la organización, el administrador y una cookie HttpOnly de diez minutos. Si el Account Link caduca, `/api/pagos/stripe/actualizar` genera otro. La URL base procede de `PAGOS_BASE_URL` o `NEXTAUTH_URL`; no se configura un redirect URI aparte.

Stripe deriva el modo de la llave: `sk_test_` guarda sandbox y `sk_live_` guarda real. Una cuenta creada en modo prueba no se puede usar con la llave live. `STRIPE_PAIS` indica el país ISO 3166-1 alpha-2 enviado al crear la cuenta Standard (por defecto `MX`); debe corresponder al país de la cuenta de plataforma Stripe. Stripe usa el país de la persona o empresa conectada para determinar requisitos de onboarding ([parámetro country de Accounts](https://docs.stripe.com/api/accounts/create)). `STRIPE_SECRET_KEY` nunca se guarda ni se devuelve por API; `STRIPE_WEBHOOK_SECRET` es el secreto del endpoint Connect de la plataforma.

### Checkout, importes y reembolsos

Se crea una Checkout Session `mode=payment`, moneda `mxn`, métodos explícitos `card`, referencia en `client_reference_id` y `metadata[pagoId]`, expiración de 24 horas y `Idempotency-Key`. Stripe recibe montos en centavos; la conversión se hace desde texto decimal con aritmética entera. No se habilitan OXXO ni SPEI en esta fase.

Los reembolsos usan `/v1/refunds` con `payment_intent`, monto entero de centavos para parciales y una clave de idempotencia estable. La aplicación consulta `/v1/refunds/{id}`; estados `pending` y `requires_action` quedan pendientes, `succeeded` se registra como aprobado y `failed`/`canceled` como rechazado. Stripe documenta reembolsos parciales repetidos hasta alcanzar el total ([crear y consultar reembolsos](https://docs.stripe.com/api/refunds/create), [estados de Refund](https://docs.stripe.com/api/refunds/object)).

### Webhooks de Connect y aislamiento

Registra un endpoint Connect en modo **Connected accounts**. Stripe envía esos eventos a un destino común e incluye la cuenta emisora en `event.account`; no asigna un endpoint diferente por cuenta. Por ello el destino de plataforma es:

`https://crm.ejemplo.com/api/public/pagos/webhook/stripe`

La ruta verifica `Stripe-Signature` sobre el cuerpo sin modificar y una tolerancia de cinco minutos. Resuelve `event.account` con una función `SECURITY DEFINER` de alcance limitado que devuelve hasta dos coincidencias; una segunda validación RLS dentro de la organización verifica que el identificador coincida. Se conserva `/api/public/pagos/webhook/stripe/<orgId>` para llamadas por organización y compatibilidad, pero el endpoint global es el que debe configurarse en Stripe para Connect. Stripe describe el alcance y el campo `account` en [Connect webhooks](https://docs.stripe.com/connect/webhooks).

Marca estos eventos en el endpoint:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`
- `account.updated`
- `account.application.deauthorized`

Los eventos se deduplican con la clave única existente de `eventos_pago`. Una firma inválida o una cuenta no registrada/reconciliada responde 4xx sin acreditar un cobro. `account.application.deauthorized` marca la credencial para reconectar. Los tipos y sus semánticas están en la [referencia de eventos de Stripe](https://docs.stripe.com/api/events/types).

### OXXO y SPEI

No están habilitados: el Checkout envía explícitamente solo `card`. OXXO requiere mostrar un voucher y confirmar el pago después; Stripe informa la emisión y el éxito con eventos asíncronos. Además, Stripe indica que OXXO no permite reembolsos de la forma usual ([OXXO](https://docs.stripe.com/payments/oxxo)).

SPEI se ofrece mediante transferencias bancarias MXN (`mx_bank_transfer`/Customer Balance), con una cuenta virtual e importe recibido que puede diferir del esperado; Checkout requiere un Customer y la conciliación es asíncrona. Para activarlo habría que crear/guardar Customer por cliente, manejar saldos, transferencias parciales o excedentes y usar eventos de éxito/fallo asíncronos ([transferencias bancarias y soporte Connect](https://docs.stripe.com/payments/bank-transfers)). Ninguno se activa al habilitarlos en el Dashboard: requiere cambio explícito de código y pruebas.

### Variables y operación

```env
STRIPE_SECRET_KEY=sk_test_... # o sk_live_... en real
STRIPE_PAIS=MX
STRIPE_WEBHOOK_SECRET=whsec_...
PAGOS_BASE_URL=https://crm.ejemplo.com
PAGOS_TOKEN_ENCRYPTION_KEY=<base64 de 32 bytes>
```

En Stripe, activa Connect y revisa la identidad visual del onboarding Standard. En Webhooks crea el destino anterior, selecciona **Connected accounts**, marca los ocho eventos de la lista y copia su signing secret `whsec_...` a `STRIPE_WEBHOOK_SECRET`. Guarda la llave de plataforma de prueba en `STRIPE_SECRET_KEY` para empezar; después de verificar, cambia ambas variables al modo live y redepliega. El modo del registro se toma de la llave activa.

Para recibir eventos locales, inicia AmbarCRM y corre:

```bash
stripe listen --forward-connect-to localhost:3000/api/public/pagos/webhook/stripe
```

Copia el `whsec_...` que imprime Stripe CLI a `STRIPE_WEBHOOK_SECRET` del entorno local. Es distinto al secreto del endpoint del Dashboard. El comando oficial se documenta en [Stripe CLI: escuchar eventos Connect](https://docs.stripe.com/cli/listen).

La acción **Desconectar** quita la asociación local de AmbarCRM. Las cuentas Standard live no se pueden borrar mediante la API cuando Stripe es responsable de los saldos negativos ([restricciones de eliminación de cuentas](https://docs.stripe.com/api/accounts/delete)); para revocar Connect en la plataforma, el cliente debe administrar su conexión desde Stripe. Un onboarding posterior puede crear otra cuenta nueva.
