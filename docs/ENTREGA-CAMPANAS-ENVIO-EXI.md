# Entrega · Campañas de envío de EXI Chiapas

Rama local `campanas-envio`, creada desde `meta-tech-provider` (`94495f5`). La copia de trabajo está bajo `Exi Chiapas - prospecto/AmbarCRM-campanas-envio`. No hubo merge, deploy, cambios en producción ni envíos reales. El módulo sigue apagado en todas las organizaciones fuera de la base de pruebas desechable.

El estado inicial de esta entrega quedó guardado en `ea9283e` antes de aplicar las correcciones de revisión. Los cambios de revisión ajustan:

- Bajas: también se detectan tras una respuesta previa (`respondio`) dentro de los 30 días, sin pasar el mensaje de baja al bot.
- Graph: el cron comprueba horario, pausa y tope antes de consultar plantillas. Una caída temporal queda registrada y solo pausa tras cinco consultas fallidas consecutivas; rechazo de Meta o plantilla retirada sí pausa de inmediato. El lanzamiento devuelve 503 si Meta no está disponible.
- Organizaciones: no hay ID 12 fijo en el cron ni en `ingestarEntrante`; el catálogo restringe `campanas_envio` a la org 12 y la clave nace apagada.
- Variables: la vista previa y la importación rechazan celdas vacías requeridas; el motor omite una variable vacía sin llamar a Graph.
- Calidad: `131026` permanece como fallo reportado, pero no cuenta para el umbral de siete fallos de los últimos veinte.
- Contactos: la importación conserva nombre y empresa reales existentes y solo rellena campos vacíos o el nombre igual al teléfono.

## Archivos tocados

- Datos y dependencia: `web/prisma/schema.prisma`, `web/prisma/sql/actualizaciones.sql`, `web/package.json`, `web/package-lock.json`.
- Motor y reglas: `web/src/lib/campanas-envio.ts`, `web/src/lib/campanas-envio-fecha.ts`, `web/src/lib/campanas-envio-motor.ts`, `web/src/lib/campanas-envio-plantilla.ts`, `web/src/lib/campanas-envio-importar.ts`, `web/src/lib/channel/cloudapi.ts`, `web/src/lib/channel/types.ts`, `web/src/lib/services/ingest.ts`, `web/src/lib/services/config.ts`.
- APIs nuevas: `web/src/app/api/campanas-envio/route.ts`, `config/route.ts`, `preview/route.ts`, `[id]/route.ts`, `[id]/importar/route.ts`, `[id]/exportar/route.ts`, `web/src/app/api/cron/campanas-envio/route.ts`.
- APIs y configuración existentes: `web/src/app/api/ajustes/route.ts`, `web/src/app/api/meta/webhook/route.ts`, `web/src/lib/modulos-catalogo.ts`, `web/src/lib/modulos-plataforma.ts`, `web/src/app/(app)/configuracion/page.tsx`, `web/src/app/(app)/configuracion/clientes/[id]/page.tsx`, `web/src/components/config/ConfiguracionCliente.tsx`, `web/src/components/config/tabs/TabAutomatizaciones.tsx`, `web/src/components/config/tabs/TabClientes.tsx`.
- Interfaz nueva: `web/src/app/(app)/campanas-envio/page.tsx`, `web/src/components/campanas-envio/CampanasEnvioPanel.tsx`.
- Pruebas y documentación: `web/scripts/check-campanas-envio.ts`, `MODULOS.md`, `docs/CAMPANAS-ENVIO-EXI.md`, este archivo.

`/difusion` y `web/src/app/api/difusion/route.ts` no cambiaron.

## Validación ejecutada

- Prisma: esquema válido; `actualizaciones.sql` pasó dos veces en PostgreSQL 16 aislado. Se aplicó RLS con el rol `crm_app` sin `BYPASSRLS`.
- La regresión completa `check-campanas-envio.ts` pasó en PostgreSQL 16 aislado con Graph simulado y sin tokens reales. Además de CSV/XLSX, fecha, calendario, tope compartido, concurrencia, recuperación y errores previos, cubrió baja directa y tras `respondio`, cero consultas Graph fuera de ventana y entre tandas, caída temporal de Graph y quinto fallo consecutivo, restablecimiento del contador, plantilla retirada/4xx, respuesta 503 para lanzamiento, variables vacías en vista previa y motor, guardado real de importación sin pisar contactos, exclusión de `131026` del umbral, siete fallos de otro código y RLS. La revisión final verifica que la org 13 sigue bloqueada aunque tenga una bandera insertada directamente en la BD de prueba y que reanudar tras cinco fallos reinicia el contador. Una sustitución temporal del catálogo solo en memoria del script confirma que el cron no tiene un filtro 12 propio.
- `npx tsc --noEmit`, `npm run lint`, `npx prisma validate`, `git diff --check`: sin errores tras las correcciones.
- `npx next build --webpack`: pasó, incluidas las rutas nuevas y el paquete de ExcelJS para navegador, antes de los ajustes finales de importación y fecha. Esos ajustes pasaron TypeScript y ESLint.
- El contenedor PostgreSQL desechable se retiró después de la prueba.

## Decisiones de implementación

- Se usa ExcelJS para la primera hoja de XLSX; evita `xlsx@0.18.5` y permite mantener el parseo en navegador. El servidor valida de nuevo las filas JSON.
- El canal se bloquea en PostgreSQL antes de contar y reservar la tanda. Así varias campañas del mismo canal comparten el tope del día en la zona de la campaña. Los intentos fallidos también consumen el tope del día, una opción conservadora para la calidad del número.
- La importación procesa lotes de 200 y usa inserciones masivas con `skipDuplicates`; puede repetirse si se interrumpe. La campaña solo se lanza con una confirmación registrada.
- Una baja detectada en `ingestarEntrante` sale antes de horario, bienvenida y bot para que ese mismo mensaje no reciba respuesta automática.
- El contador persistente `fallosConsultaMeta` se incrementa solo ante `no_disponible` y vuelve a cero al consultar plantillas correctamente. El umbral de calidad mantiene los últimos 20 intentos con `enviadoAt` como ventana, excluye omisiones sin envío y excluye `131026` solo del numerador de fallos que pausan.
- `fechaInicio` ingresada como fecha/hora local se interpreta en la zona seleccionada, no en la zona del navegador.
- Si Graph aceptó un mensaje pero la aplicación cayó antes de guardar el ID de Meta, la recuperación automática a los 10 minutos podría repetirlo. Ese intervalo no puede garantizar exactamente una entrega sin idempotencia del proveedor; revisar el reporte tras una caída a mitad de lote.

## Sin verificar con Meta real

No se llamó a Graph real ni se enviaron mensajes. Quedan pendientes la confirmación de la plantilla real de EXI, su tarifa efectiva, respuesta exacta de cada error, eventos de entregado/leído en su WABA y la operación del cron n8n en producción. El workflow está documentado, pero no fue creado ni activado.

`npm audit --omit=dev` señaló una advertencia moderada en `uuid`, dependencia transitiva de ExcelJS, y advertencias altas preexistentes en la cadena NextAuth/Nodemailer. No se aplicó `npm audit fix --force` porque propone cambios incompatibles fuera del alcance.
