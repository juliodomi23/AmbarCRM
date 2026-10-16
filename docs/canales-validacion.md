# Entrega de canales Messenger y API

Rama: `canales-messenger-api`, desde `modulos-fase-2`. Trabajo local, sin push, deploy ni acceso a producción o `ambarcrm-db`. No se modificaron los planes/prompts sin seguimiento del usuario. No se añadieron dependencias.

## Commits por fase

| Fase | Commit | Resultado |
|---|---|---|
| 0 · lectura | `e2d0dce` | Resumen y archivos previstos, sin código |
| 1 · base | `2e2c8c9` | Identidad por canal, destinatario genérico y SQL idempotente |
| 2 · API | `8352e1e` | Entrada autenticada, salida firmada, reintentos y configuración |
| 3 · Messenger | `8e3a1fb` | Firma, PSID, ecos/acuses, conexión y ventanas |
| 4 · UI y cierre | Commit que contiene este informe | Selector, iconos y banner; corrección de identidad externa en GET v1, sin cambiar su estructura |

## Comprobaciones realizadas

Cada fase tuvo `tsc --noEmit`, `npm run build`, `test-aislamiento.ts` y `scripts/check-seguridad.ts` en verde antes de avanzar. Aislamiento: lectura/escritura de **80 tablas**, con rol `crm_app` sin privilegios de dueño. Se repitió el build y la regresión del bot después de la corrección final de GET v1.

- `test-canales-base.ts`: proveedor falso responde sin teléfono; identidad e idempotencia por canal; asociación posterior del teléfono y reutilización desde WhatsApp. **OK**.
- `test-canales-api.ts`: HMAC válido/alterado; HTTPS/IP privada/DNS privado/redirección; tres reintentos crecientes; 8 entradas concurrentes → 1 mensaje y 1 dispatch; claves cruzadas → 401; respuesta del bot sin teléfono; GET conserva identificador externo; notas privadas; estado fallido; secreto oculto y regeneración. **OK**.
- `test-canales-messenger.ts`: GET de verificación, firma incorrecta rechazada antes de JSON y sin escritura; PSID repetido; perfil sin permiso; dos empresas; eco saliente; eco propio omitido; acuses monotónicos; límites de 24 h/7 días; texto antes de media; bot fuera de ventana fallido; token vencido desconecta; URL de media firmada/alterada/vencida. **OK**, Graph simulado.
- `test-bot-api.ts` y `test-webhook-manual.ts`: **OK**. Incluyen 250 peticiones simultáneas entre empresas sin fugas y regresión de permisos, notas y bitácora. Los errores RLS/UNIQUE que aparecen en su salida corresponden a rechazos esperados por las pruebas.
- Los **33** `scripts/check-*.ts`, incluido `check-canales-ui.ts`: **OK**. El de UI comprueba selector, separación de ventanas, datos al renderizar/refrescar y exclusiones exactas del proxy.
- ESLint sobre proveedores, utilidades/servicios nuevos y componentes nuevos de configuración/iconos: **OK**.
- **23** pruebas adicionales de BD/concurrencia: **OK** (lista abajo).
- `actualizaciones.sql` repetido varias veces, incluidas dos ejecuciones finales con bandejas nuevas existentes: **OK**; conteos y estados activos/conectados por proveedor idénticos antes y después.

BD usada: contenedor propio `ambarcrm-canales-prueba`, PostgreSQL 16, `127.0.0.1:55450`, creado con `schema.sql` → `multi-tenant.sql` → `actualizaciones.sql`. No se usó `prisma db push`. El contenedor se elimina al cerrar la sesión.

Pruebas adicionales ejecutadas:

```text
test-caja-dinero.ts                 test-cobros-db.ts
test-concurrencia-caja-a2.ts         test-concurrencia-caja.ts
test-concurrencia-cobros.ts          test-concurrencia-cotizaciones.ts
test-concurrencia-nota-credito.ts    test-concurrencia-pedidos.ts
test-concurrencia-resenas.ts         test-concurrencia-retail.ts
test-concurrencia-sinred.ts          test-concurrencia-varias-cajas.ts
test-cotizaciones-zona.ts            test-cupos-concurrentes.ts
test-paridad-precios.ts              test-precios-promociones.ts
test-referencias.ts                  test-reportes-cuadre.ts
test-reservas-concurrentes.ts        test-sql-inventario-negativo.ts
test-total-cobrado-cliente.ts        test-tours-dinero.ts
test-vencimiento-pedidos.ts
```

## Decisiones, entorno y SQL pendiente

Detalles en [canales-decisiones.md](canales-decisiones.md), ejemplos HTTP y firma en [canal-api.md](canal-api.md), variables y migración en [despliegue-bot.md](despliegue-bot.md).

Decisiones principales: identidad externa acotada a la bandeja; sin fusión automática de contactos; transacción corta antes de efectos externos; API con 1 intento + 3 reintentos; enlaces de media de Messenger firmados por 15 minutos; automatizaciones/bots sujetos a 24 h y asesores a 7 días; plantillas y programación solo en WhatsApp.

Variable nueva: **`MESSENGER_VERIFY_TOKEN`**. Se reutilizan `META_APP_SECRET`, `META_APP_ID`, `META_GRAPH_VERSION` (default existente `v26.0`), `META_TOKEN_ENCRYPTION_KEY` y `NEXTAUTH_URL` (HTTPS público para media).

En una BD existente habrá que aplicar manualmente `web/prisma/sql/actualizaciones.sql` como dueño cuando se autorice la migración: enum `messenger/api`; `contactos.canal_id/identificador_externo` e índice UNIQUE parcial; `mensajes.canal_id`, UNIQUE compuesta y trigger; `conversaciones.ultimo_entrante_at` con backfill; índice de página activa y función `resolve_org_by_page` con permisos restringidos. Se mantienen las tablas existentes con RLS/GRANT. No se aplicó nada fuera de la BD desechable.

## Límites de la verificación

- No se hicieron llamadas reales a Meta ni pruebas con la página, permisos HUMAN_AGENT o bot SEMBID reales. Un workflow que asuma teléfono obligatorio tendrá que admitir `phone_number: null`; el identificador externo sí está disponible en el webhook y en GET v1.
- Se añadió `test-canales-e2e.ts` para HTTP con login y UI renderizada, pero **no se ejecutó**: la revisión automática rechazó arrancar el servidor local `127.0.0.1:3118` con el motivo genérico **«blocked by policy»**. No se intentó sortear ese rechazo. Tampoco se ejecutaron las demás pruebas `*-e2e.ts` ni una inspección visual interactiva.
- `test-lealtad-aurum.ts` necesita un Aurum real y quedó fuera. Algunas pruebas AR existentes exigen explícitamente el puerto 55453/seed de otro trabajo; no se alteraron esas protecciones ni se usó ese contenedor.
- Se conserva el límite del pipeline actual: si el proceso termina después del commit y antes del dispatch, el mensaje permanece guardado pero no hay una cola durable que recupere ese efecto. No se agregó esa infraestructura al alcance.

Implementación disponible para revisión; las pruebas HTTP e integración real indicadas siguen pendientes. No hacer merge ni desplegar basándose solo en las comprobaciones locales.

## Archivos tocados

```text
docs/canal-api.md
docs/canales-decisiones.md
docs/canales-fase-0.md
docs/despliegue-bot.md
schema.sql
web/prisma/schema.prisma
web/prisma/scripts/test-canales-api.ts
web/prisma/scripts/test-canales-base.ts
web/prisma/scripts/test-canales-e2e.ts
web/prisma/scripts/test-canales-messenger.ts
web/prisma/sql/actualizaciones.sql
web/scripts/check-canales-ui.ts
web/src/app/(app)/chat/page.tsx
web/src/app/api/canal-api/[canalId]/mensajes/route.ts
web/src/app/api/canales/[id]/route.ts
web/src/app/api/canales/route.ts
web/src/app/api/conversaciones/route.ts
web/src/app/api/media/[archivo]/route.ts
web/src/app/api/mensajes/enviar/route.ts
web/src/app/api/messenger/webhook/route.ts
web/src/app/api/meta/webhook/route.ts
web/src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/messages/route.ts
web/src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/route.ts
web/src/components/chat/ChatCliente.tsx
web/src/components/chat/IconoCanal.tsx
web/src/components/config/CanalExterno.tsx
web/src/components/config/Canales.tsx
web/src/components/config/ConfiguracionCliente.tsx
web/src/lib/api-webhook.ts
web/src/lib/canal-api-auth.ts
web/src/lib/channel/api.ts
web/src/lib/channel/destinatario.ts
web/src/lib/channel/index.ts
web/src/lib/channel/media-publica.ts
web/src/lib/channel/messenger.ts
web/src/lib/channel/types.ts
web/src/lib/services/bots.ts
web/src/lib/services/canales.ts
web/src/lib/services/config.ts
web/src/lib/services/ingest.ts
web/src/proxy.ts
docs/canales-validacion.md
```
