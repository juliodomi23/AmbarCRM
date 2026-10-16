# Messenger: app de Meta por canal · 15-oct-2026

Rama `canales-messenger-api`. Cambios locales, sin push, deploy ni acceso a producción o a
`ambarcrm-db`. No se añadieron dependencias ni se modificaron archivos de esquema SQL o Prisma.
El secreto y el ID viven en `canales_whatsapp.config`.

## Archivos

- `web/src/lib/services/canales.ts`: credenciales opcionales y duplicados.
- `web/src/lib/services/config.ts`: lista pública con `appId`, sin secreto.
- `web/src/components/config/CanalExterno.tsx`: formulario Messenger.
- `web/src/app/api/messenger/webhook/route.ts`: autenticación por entrada.
- `web/src/lib/channel/messenger.ts`: normalización de ecos con ID explícito.
- `web/prisma/scripts/test-canales-messenger.ts`: pruebas con Graph simulado.
- `web/prisma/scripts/test-canales-e2e.ts`: cobertura HTTP adicional pendiente de ejecución.
- `docs/despliegue-bot.md`, `docs/canales-decisiones.md` y este informe.

## Entorno

PostgreSQL 16 desechable en `127.0.0.1:55450`, contenedor
`ambarcrm-messenger-appsecret-prueba`. Preparado con `schema.sql` → `multi-tenant.sql` →
`actualizaciones.sql` (tres ejecuciones). Sin `prisma db push`. La app y las pruebas usan
`crm_app` sin SUPERUSER ni BYPASSRLS; el dueño solo prepara el esquema y ejecuta la auditoría
de aislamiento. Credenciales, clave de cifrado y configuración de Meta exclusivas de prueba.
Al terminar se eliminó el contenedor junto con su volumen desechable. La app local no llegó
a arrancar y se verificó que no quedara ningún servidor escuchando en el puerto 3118.

## Cobertura

- Secreto de app propio cifrado; ID en claro; alta, edición, conservación al omitir o dejar
  vacíos y renovación. Respuestas, listas y bitácora sin secreto ni cifrado, antes y después
  de procesar eventos. Entradas inválidas rechazadas.
- Firma propia aceptada; global rechazada para el canal con secreto propio. Sin secreto propio,
  la firma global sigue funcionando. Firma ausente, incorrecta, cuerpo alterado y cifrado ilegible
  se rechazan sin escrituras ni llamadas a Graph.
- Dos páginas de empresas distintas en el mismo cuerpo: se firma con cada secreto por separado
  y solo se guarda la página autorizada. Si ninguna autoriza, 401 sin escrituras. Páginas
  desconocidas: 200 sin procesamiento, incluso con firma incorrecta.
- Eco con ID propio, incluido ID numérico del evento, omitido sin cambiar la conversación.
  Ecos de otras apps, incluida la global cuando el canal tiene su propio ID, guardados salientes
  sin reabrir la ventana. Proveedor y webhook usan el ID del canal con respaldo global.
- Página duplicada en la misma empresa o en otra: 409 legible sin suscripción a Meta. Editar
  una conexión para tomar otra página también se rechaza. La edición de la misma página funciona.
- Carrera de dos empresas tras consultar ambas la disponibilidad: una conexión creada y un
  409 legible. Se usa el índice único existente, sin introducir una protección SQL nueva.
  Prisma imprime el error UNIQUE provocado por la prueba; la aplicación lo transforma en el
  error esperado y la prueba termina correctamente.
- Se conservan las regresiones de PSID, deduplicación, perfil denegado, acuses, ventanas,
  envíos de texto/adjuntos, bot, token vencido y media firmada. Graph está simulado y ninguna
  llamada de estas pruebas llega a Meta.

## Resultados

- `npx tsc --noEmit`: OK.
- `npm run build`: OK, Prisma generado, compilación, TypeScript y 57 páginas generadas.
- `test-canales-base.ts`, `test-canales-api.ts`, `test-canales-messenger.ts`: OK.
- `test-aislamiento.ts`: OK, lectura y escritura en 80 tablas.
- `scripts/check-seguridad.ts` y `scripts/check-canales-ui.ts`: OK.
- ESLint de los siete archivos TypeScript/TSX modificados: OK.
- `test-canales-e2e.ts`: ampliado con altas/ediciones duplicadas por HTTP y ausencia del
  secreto en HTML/RSC de Configuración; **no ejecutado**. La revisión automática rechazó
  `npx next start -H 127.0.0.1 -p 3118` con el motivo «blocked by policy». No se intentó
  arrancar el servidor por otro medio.

## Límites

No se probaron la página SEMBID real, App Review, tokens, permisos de Meta ni HUMAN_AGENT
reales. No se hizo una prueba interactiva en navegador. La regresión de esta sesión se limita
a canales, aislamiento y seguridad; no se ejecutaron todas las pruebas de los demás módulos
ni la integración con Aurum real.

Commits de implementación: `4716d0f` (configuración/formulario), `3201760` (firma por página),
`0c5d4a5` (ecos por ID de app), `ce66cb2` (duplicados y carrera). Documentación y cobertura
adicional se guardan en un quinto commit `feat(canales)`.
