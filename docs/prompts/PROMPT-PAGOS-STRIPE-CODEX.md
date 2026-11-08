# Prompt para Codex — Stripe como segundo proveedor de pagos en línea

> Copia todo este archivo en Codex. Continúa el módulo `pagos_en_linea` (Mercado Pago ya funciona en producción en modo prueba). Este prompt también prepara el terreno para más proveedores (ver `PROMPT-PAGOS-OTROS-PROVEEDORES-CODEX.md`, que se ejecuta **después** de este).

---

## QUÉ HAY QUE HACER

Agregar **Stripe** como proveedor de cobros en línea, sin romper Mercado Pago, y dejar el código listo para sumar más proveedores sin copiar y pegar.

Fuera de alcance: anticipos de citas, cotizaciones, suscripciones recurrentes, Stripe Terminal, otros proveedores, CFDI, calendario. No agregues dependencias que no hagan falta.

## Rol

Ingeniero senior full-stack en **AmbarCRM** (Next.js 16 App Router, TypeScript, React 19, Prisma 5.22, PostgreSQL 16, Tailwind, NextAuth; multi-tenant con `org_id` y RLS). Julio solo revisa: tú implementas, pruebas y entregas evidencia.

Lee antes de tocar código: `web/AGENTS.md` (esta versión de Next.js tiene cambios; consulta `web/node_modules/next/dist/docs/`), `MULTI-TENANT.md`, `docs/pagos-online.md`.

Rama: crea `codex/pagos-stripe` desde `meta-tech-provider` (es la que despliega a producción). No hagas push a `meta-tech-provider` ni a `main`.

## Verifica contra la documentación oficial de Stripe

No confíes en tu memoria: antes de escribir código, consulta la documentación vigente de Stripe y anota en tu entrega lo que confirmaste:
- **Stripe Connect con cuentas Standard y OAuth** (cada cliente de AmbarCRM conecta su propia cuenta de Stripe y el dinero va directo a ellos). Si la documentación indica que OAuth para Standard está deprecado o cambió, propón la alternativa vigente (por ejemplo, onboarding por Account Links) y **detente a avisar** antes de implementarla.
- **Checkout Sessions** en modo `payment`, con la cuenta conectada (`Stripe-Account`), moneda `mxn`, `client_reference_id` / `metadata.pagoId`, `expires_at` e idempotencia.
- **Webhooks de Connect**: verificación de firma (`Stripe-Signature`, tolerancia de tiempo), eventos que cuentan (`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`), y cómo llega el id de la cuenta conectada en el evento.
- **Reembolsos** totales y parciales con idempotencia, y cómo consultar su estado.
- Pagos con OXXO y SPEI en México: **no los actives** en esta tarea, pero documenta qué cambiaría (pagos asíncronos).

Usa `fetch` contra la API REST con `Authorization: Bearer` en lugar de agregar el SDK `stripe`, salvo que la verificación de firma o la complejidad justifiquen el SDK; si lo agregas, explica por qué en la entrega.

## Estado actual (verificado en el código)

- `web/src/lib/pagos/tipos.ts`: interfaz `ProveedorPago` con `clave: "mercado_pago" | "mock"`, `crearCheckout`, `verificarWebhook`, `consultarPago`, `reembolsar`, `consultarReembolso`.
- `web/src/lib/pagos/proveedor.ts`: `obtenerProveedorPago(orgId)` está **atado a Mercado Pago** (busca la credencial activa más reciente, renueva token de MP, exige `MERCADOPAGO_WEBHOOK_SECRET`). `validarConfiguracionPagosAplicacion()` también asume MP.
- `web/src/lib/pagos/oauth.ts`: OAuth, state firmado, cookie `ambar_pagos_oauth`, `guardarTokensOAuth`, `renovarCredencialMercadoPago`; todo con `proveedor: "mercado_pago"` fijo.
- `web/src/lib/pagos/mercado-pago.ts`, `mock.ts`, `firmas.ts`, `credenciales.ts` (AES-256-GCM, `PAGOS_TOKEN_ENCRYPTION_KEY`), `servicio-endurecido.ts` (flujo de cobro, webhook, conciliación, reembolsos, idempotencia).
- Rutas: `src/app/api/pagos/{checkout,credenciales,oauth/iniciar,oauth/callback,[id]/reembolso}` y `src/app/api/public/pagos/webhook/[proveedor]/[org]/route.ts`. El webhook por org ya existe y la ruta legacy sin org responde 410.
- Hay `strings` `"mercado_pago"` duplicados en `api/modulos/route.ts`, `api/pagos/credenciales/route.ts`, `components/ar/RegistrarPago.tsx`, `components/retail/CobroEnLinea.tsx` y `lib/contratos-cobros.ts`. Revísalos.
- Tabla `credenciales_pago`: `@@unique([orgId, proveedor])`, columnas `access_token_encrypted`, `refresh_token_encrypted`, `webhook_secret_encrypted`, `user_id`, `scope`, `public_key`, `sandbox`, `activo`, `requiere_reconexion`, `expires_at`. Una org puede tener una fila por proveedor.
- Hoy solo se acepta `origenTipo: "venta"` (`servicio-endurecido.ts`).

## Diseño

1. **Registro de proveedores** (sin sobre-ingeniería): un mapa `clave → fábrica` en un solo archivo, que reemplace los `if` de `proveedor.ts`. `obtenerProveedorPago(orgId, clave?)` resuelve la credencial de esa clave; sin clave, usa el **proveedor predeterminado de la org** (ver punto 2). Mercado Pago debe seguir comportándose igual, con sus mismas pruebas.
2. **Proveedor por organización:** una org puede tener credenciales de varios proveedores, pero un solo predeterminado. Guárdalo en la `config` de `modulos_org` (`pagos_en_linea.config.proveedor`, que `api/modulos` ya valida) y amplía esa validación a `mercado_pago | stripe | mock`. Sin migración de columnas si no hace falta. El cobro existente (`PagoOnline.proveedor`) conserva el proveedor con el que se creó, para que webhooks y reembolsos usen el correcto aunque después se cambie el predeterminado.
3. **Credenciales Stripe:** `proveedor = "stripe"`; guarda el `stripe_user_id` (`acct_...`) en `user_id` y el token que corresponda según la doc, siempre cifrado con `cifrarCredencialPago`. Nunca devuelvas tokens por API.
4. **Webhook:** el secreto de firma de Connect es **de la plataforma**, no de la org: variable `STRIPE_WEBHOOK_SECRET`. Mantén la ruta `/api/public/pagos/webhook/stripe/<orgId>` y verifica que el id de cuenta del evento coincida con la credencial de esa org; si no coincide, rechaza. Respeta la ventana de tolerancia de la firma y la deduplicación de eventos que ya usa `servicio-endurecido.ts`.
5. **UI:** en `PagosConfig` (Configuración → Módulos → Pagos en línea): mostrar el estado de cada proveedor, botón **Conectar Stripe** / **Conectar Mercado Pago**, desconectar, y elegir el predeterminado. Solo admin. Si falta alguna variable de entorno, mostrar un mensaje claro (no un 500).
6. **Variables de entorno nuevas** (agrégalas a `.env.example` y al bloque `app` de `docker-compose.yml`, con `${VAR:-}`, porque el compose solo pasa al contenedor las variables que lista):
   `STRIPE_CLIENT_ID`, `STRIPE_SECRET_KEY` (de la plataforma), `STRIPE_WEBHOOK_SECRET`, `STRIPE_REDIRECT_URI`, y las que la doc exija. Nombra cada una con un comentario de una línea en `.env.example`. No pongas valores reales.
7. **Montos:** Stripe usa la unidad mínima (centavos). Convierte con aritmética de enteros o `Decimal`, nunca con `Number` flotante; cubre redondeo y montos como `1500.00`, `0.50` y `99999.99` con pruebas.

## Seguridad

- Ningún secreto en el repo, en logs ni en respuestas de API. Revisa que los mensajes de error de Stripe no filtren tokens.
- Aislamiento por org (RLS): una org nunca usa las credenciales de otra. Cubre con una prueba.
- Webhook sin firma válida o con cuenta que no corresponde → 4xx y sin efectos.
- Mock bloqueado en producción como hasta ahora.
- El `state` de OAuth sigue ligado a org y usuario; reutiliza `crearStateOAuth`/`validarStateOAuth` generalizándolos, no los dupliques.

## Pruebas (obligatorias)

Sin tocar Stripe real (no hay llaves): crea un **Stripe falso** a nivel de `fetch` o de proveedor para los tests, en el estilo de `mock.ts`. Extiende `check:pagos-online` y el e2e (`web/prisma/scripts/test-pagos-online-e2e.ts`) con base **desechable** (no la `5433` de Julio, ni producción). Como mínimo:

1. Regresión completa de Mercado Pago: todo lo que pasaba antes sigue pasando.
2. Crear checkout con Stripe: monto en centavos correcto, moneda `mxn`, `metadata.pagoId`, idempotencia (mismo `idempotencyKey` no crea dos sesiones).
3. Webhook válido marca el pago `aprobado`; firma inválida, firma vencida y evento duplicado no producen efectos duplicados.
4. Webhook con cuenta conectada que no coincide con la org → rechazado.
5. Pago expirado, rechazado y asíncrono fallido.
6. Reembolso total, parcial y repetido (idempotente); contracargo (`charge.dispute.created`) marca el pago como contracargo.
7. Una org con dos proveedores conectados: el predeterminado se usa para cobros nuevos; un pago ya creado con el otro sigue reembolsándose con el suyo.
8. RLS: la org B no ve credenciales ni pagos de la org A.
9. Conversión de montos a centavos (los casos del punto 7 del diseño).

Corre además `npm run lint`, `npx tsc --noEmit` y las pruebas de pagos, citas y calendario existentes. **No** ejecutes nada contra producción.

## Documentación

Actualiza `docs/pagos-online.md` (proveedores, variables, webhook de Stripe, cómo probar con la CLI de Stripe en local, límites conocidos). No dejes `console.log` ni código muerto.

## Entrega

Al terminar, **detente** y entrega: lista de archivos tocados, lo que confirmaste en la documentación de Stripe (con el enlace de cada punto), decisiones donde el prompt y el código no coincidieron (gana el código), salida de las pruebas, y una lista de **qué tiene que hacer Julio** en Stripe (crear cuenta, activar Connect, registrar el webhook de Connect con la URL exacta, qué eventos marcar, de dónde sale cada variable). No hagas push ni merge.
