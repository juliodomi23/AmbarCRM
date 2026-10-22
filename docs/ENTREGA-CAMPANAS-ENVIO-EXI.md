# Entrega · Campañas de envío de EXI Chiapas

Rama local `campanas-envio`, creada desde `meta-tech-provider` (`94495f5`). La copia de trabajo está bajo `Exi Chiapas - prospecto/AmbarCRM-campanas-envio`. No hubo merge, deploy, cambios en producción ni envíos reales. El módulo sigue apagado en todas las organizaciones fuera de la base de pruebas desechable.

## Archivos tocados

- Datos y dependencia: `web/prisma/schema.prisma`, `web/prisma/sql/actualizaciones.sql`, `web/package.json`, `web/package-lock.json`.
- Motor y reglas: `web/src/lib/campanas-envio.ts`, `web/src/lib/campanas-envio-fecha.ts`, `web/src/lib/campanas-envio-motor.ts`, `web/src/lib/channel/cloudapi.ts`, `web/src/lib/channel/types.ts`, `web/src/lib/services/ingest.ts`, `web/src/lib/services/config.ts`.
- APIs nuevas: `web/src/app/api/campanas-envio/route.ts`, `config/route.ts`, `preview/route.ts`, `[id]/route.ts`, `[id]/importar/route.ts`, `[id]/exportar/route.ts`, `web/src/app/api/cron/campanas-envio/route.ts`.
- APIs y configuración existentes: `web/src/app/api/ajustes/route.ts`, `web/src/app/api/meta/webhook/route.ts`, `web/src/lib/modulos-catalogo.ts`, `web/src/lib/modulos-plataforma.ts`, `web/src/app/(app)/configuracion/page.tsx`, `web/src/app/(app)/configuracion/clientes/[id]/page.tsx`, `web/src/components/config/ConfiguracionCliente.tsx`, `web/src/components/config/tabs/TabAutomatizaciones.tsx`, `web/src/components/config/tabs/TabClientes.tsx`.
- Interfaz nueva: `web/src/app/(app)/campanas-envio/page.tsx`, `web/src/components/campanas-envio/CampanasEnvioPanel.tsx`.
- Pruebas y documentación: `web/scripts/check-campanas-envio.ts`, `MODULOS.md`, `docs/CAMPANAS-ENVIO-EXI.md`, este archivo.

`/difusion` y `web/src/app/api/difusion/route.ts` no cambiaron.

## Validación ejecutada

- Prisma: esquema válido; `actualizaciones.sql` pasó dos veces en PostgreSQL 16 aislado. Se aplicó RLS con el rol `crm_app` sin `BYPASSRLS`.
- La regresión `check-campanas-envio.ts` pasó con Graph simulado y sin tokens reales. Cubrió CSV/XLSX, preview, días/ventana/zona, tope compartido, dos ejecuciones simultáneas, reinicio, códigos 131050/131049/131026/131042 y token rechazado, pausa con 7 fallos de 20, baja, RLS y módulo apagado. La aserción de conversión de fecha agregada al final se validó aparte con `tsx -e`.
- `npx tsc --noEmit`, `npm run lint`, `git diff --check`: sin errores. Los últimos ajustes de importación y UI pasaron `tsc` y ESLint dirigidos.
- `npx next build --webpack`: pasó, incluidas las rutas nuevas y el paquete de ExcelJS para navegador, antes de los ajustes finales de importación y fecha. Esos ajustes pasaron TypeScript y ESLint.
- El contenedor PostgreSQL desechable se retiró después de la prueba.

## Decisiones de implementación

- Se usa ExcelJS para la primera hoja de XLSX; evita `xlsx@0.18.5` y permite mantener el parseo en navegador. El servidor valida de nuevo las filas JSON.
- El canal se bloquea en PostgreSQL antes de contar y reservar la tanda. Así varias campañas del mismo canal comparten el tope del día en la zona de la campaña. Los intentos fallidos también consumen el tope del día, una opción conservadora para la calidad del número.
- La importación procesa lotes de 200 y usa inserciones masivas con `skipDuplicates`; puede repetirse si se interrumpe. La campaña solo se lanza con una confirmación registrada.
- Una baja detectada en `ingestarEntrante` sale antes de horario, bienvenida y bot para que ese mismo mensaje no reciba respuesta automática.
- `fechaInicio` ingresada como fecha/hora local se interpreta en la zona seleccionada, no en la zona del navegador.
- Si Graph aceptó un mensaje pero la aplicación cayó antes de guardar el ID de Meta, la recuperación automática a los 10 minutos podría repetirlo. Ese intervalo no puede garantizar exactamente una entrega sin idempotencia del proveedor; revisar el reporte tras una caída a mitad de lote.

## Sin verificar con Meta real

No se llamó a Graph real ni se enviaron mensajes. Quedan pendientes la confirmación de la plantilla real de EXI, su tarifa efectiva, respuesta exacta de cada error, eventos de entregado/leído en su WABA y la operación del cron n8n en producción. El workflow está documentado, pero no fue creado ni activado.

`npm audit --omit=dev` señaló una advertencia moderada en `uuid`, dependencia transitiva de ExcelJS, y advertencias altas preexistentes en la cadena NextAuth/Nodemailer. No se aplicó `npm audit fix --force` porque propone cambios incompatibles fuera del alcance.
