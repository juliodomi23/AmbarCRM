# Prompt para Codex — Evaluar e integrar más proveedores de pago (Conekta, OpenPay, PayPal, Clip)

> Copia todo este archivo en Codex. **Ejecútalo después de `PROMPT-PAGOS-STRIPE-CODEX.md`** ya revisado y fusionado: depende del registro de proveedores y del "proveedor predeterminado por organización" que ese prompt crea. Si esa rama aún no existe, detente y avisa.

---

## Cómo funciona este prompt: dos fases con parada

- **Fase 1 (solo investigación, sin código):** produce un informe comparativo.
- **Parada.** Julio elige qué proveedores se integran.
- **Fase 2 (implementación):** solo de los proveedores que Julio haya elegido **por escrito en este mismo chat**. No implementes ninguno sin esa elección.

## Contexto

AmbarCRM cobra en línea hoy con Mercado Pago y (tras el otro prompt) Stripe. Cada cliente del CRM (clínica, retail, etc.) debe cobrar **a su propia cuenta**, no a la de Ámbar Rojo, y la integración debe poder conectarse **sin que Julio copie llaves a mano por cada cliente**. Moneda MXN, clientes en México.

Lee antes: `web/AGENTS.md`, `MULTI-TENANT.md`, `docs/pagos-online.md`, `web/src/lib/pagos/*` y la rama `codex/pagos-stripe` (registro de proveedores, interfaz `ProveedorPago`).

## Fase 1 — Informe (sin tocar código)

Para **cada uno** de: **Conekta, OpenPay (BBVA), PayPal, Clip**, investiga en su **documentación oficial vigente** (cita el enlace de cada afirmación; si algo no lo encuentras, escribe "no verificado", no lo supongas):

1. **Modelo multi-comercio:** ¿existe una forma oficial de que una plataforma conecte las cuentas de sus clientes (OAuth, marketplace, partner, sub-merchants) o solo hay llaves por comercio? ¿Se puede evitar que el cliente pegue llaves secretas a mano?
2. **Checkout alojado:** ¿hay página de pago alojada por el proveedor con URL de retorno y expiración? ¿O hay que construir el formulario (y entonces el alcance de PCI y de tarjeta en nuestro frontend)?
3. **Webhooks:** firma, eventos disponibles, reintentos, y cómo se identifica a qué comercio pertenece el evento.
4. **Reembolsos** totales y parciales, idempotencia y consulta de estado.
5. **Métodos de pago en México:** tarjeta, OXXO, SPEI, otros; cuáles son síncronos y cuáles asíncronos.
6. **Contracargos:** cómo se notifican.
7. **Sandbox:** cómo se prueba sin dinero real y cómo se simulan aprobado, rechazado y reembolso.
8. **Costos y requisitos** públicos para el comercio (comisión publicada, alta, verificación). Solo lo publicado; no estimes.
9. **Esfuerzo de integración** con nuestra interfaz `ProveedorPago` (chica/mediana/grande) y qué partes **no encajan** (por ejemplo, si no hay checkout alojado o no hay OAuth).
10. **Estado del producto:** señales de deprecación, cambios recientes, o si un cambio de propietario afecta a la API.

Entrega el informe como `docs/pagos-proveedores-comparativa.md`: una tabla comparativa (filas = los 10 puntos, columnas = proveedores, más Mercado Pago y Stripe como referencia) y una sección de **recomendación razonada** con orden de integración y el criterio ("si un cliente ya usa X, conviene Y"). Señala claramente cualquier proveedor que **no** recomiendes integrar y por qué.

**Detente aquí.** Reporta a Julio y espera su elección.

## Fase 2 — Implementación (solo los elegidos)

Por cada proveedor elegido, sigue exactamente el patrón de Stripe:

1. Un archivo `web/src/lib/pagos/<proveedor>.ts` que implemente `ProveedorPago`, registrado en el registro de proveedores. Amplía el tipo `clave` y las validaciones de `api/modulos` y `api/pagos/credenciales`.
2. Conexión del cliente por el mecanismo que el informe confirmó (OAuth o equivalente). Si el proveedor **solo** permite llaves por comercio, **no** habilites el flujo manual en producción sin que Julio lo decida: `PAGOS_PERMITIR_CREDENCIALES_MANUALES` está en `0` a propósito. Propón el flujo y detente.
3. Webhook en `/api/public/pagos/webhook/<proveedor>/<orgId>` con verificación de firma, deduplicación y comprobación de que el comercio del evento corresponde a la org.
4. Credenciales cifradas con `cifrarCredencialPago`; nunca en logs ni en respuestas.
5. Variables de entorno nuevas en `.env.example` y en el bloque `app` de `docker-compose.yml` (con `${VAR:-}`; el compose solo pasa las variables que lista). Sin valores reales.
6. UI: una tarjeta más en `PagosConfig` con conectar, desconectar y elegir como predeterminado.
7. Montos en la unidad que pida cada API, con aritmética exacta.
8. Pruebas con un servicio falso (no hay llaves reales), sobre base **desechable**, con los mismos 9 casos del prompt de Stripe adaptados al proveedor, más la regresión de Mercado Pago y Stripe. `npm run lint` y `npx tsc --noEmit` limpios.
9. Actualiza `docs/pagos-online.md`.

Un proveedor por rama (`codex/pagos-<proveedor>`), un PR chico cada uno. Sin push ni merge.

## Reglas generales

- Solo documentación oficial; cita el enlace. "No verificado" es una respuesta válida y preferible a una suposición.
- Nada contra producción ni contra la base `5433` de Julio. Ningún secreto en el repo.
- No tocar anticipos de citas, cotizaciones, CFDI ni calendario.
- Si algo del código contradice este prompt, gana el código y lo señalas.

## Entrega

- **Fase 1:** ruta del informe, resumen de 8 líneas y la recomendación.
- **Fase 2 (por proveedor):** archivos tocados, enlaces a la documentación usada, salida de las pruebas, y qué debe hacer Julio en el panel del proveedor (cuenta, credenciales de pruebas, URL exacta del webhook y eventos a marcar).
