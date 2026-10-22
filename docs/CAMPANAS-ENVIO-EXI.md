# Campañas de envío de EXI Chiapas

## Encendido y preparación

1. Aplicar la migración `web/prisma/sql/actualizaciones.sql` con el usuario dueño en una base de pruebas y generar Prisma. No ejecutar contra producción durante la validación.
2. En **Configuración → Clientes Ámbar CRM**, abrir la organización 12 (`exi-chiapas`) y activar `Campañas de envío`. La clave `campanas_envio` nace apagada. No se habilita en otras organizaciones.
3. Confirmar que el canal de EXI sea `cloud_api`, conectado y tenga una plantilla de Meta con estado `APPROVED`. La plantilla debe incluir «Responde BAJA para no recibir más mensajes».
4. En **Configuración → Automatizaciones**, ajustar la tarifa estimada de marketing si difiere de US$0.04 por entrega. La cifra es informativa; Meta factura directamente a EXI.

## Flujo de usuario

Se acepta CSV o XLSX de hasta 5 MB y 10,000 filas. El navegador lee la primera hoja de XLSX con **ExcelJS**, mantenida en npm y sin depender de `xlsx@0.18.5`. El servidor revalida todas las filas JSON. Primero se mapean teléfono, nombre, empresa, giro y columnas adicionales para variables. La vista previa muestra 20 filas, conteos y descarga de descartados. Al importar se crean o actualizan contactos y etiquetas de giro y se preparan los destinatarios; aún no se envía nada.

El envío exige plantilla aprobada y confirmación de permiso. Valores iniciales: lunes a viernes, 09:30–17:30 `America/Mexico_City`, 5 mensajes cada 10 minutos, 50 al día. Se puede ajustar por campaña; el límite duro es 150 por día. El tope se comparte entre las campañas de un mismo canal en el día calendario de la zona de la campaña. El reporte distingue pendientes, enviados, entregados, leídos, respondidos, fallidos, omitidos y bajas. Los estados entregado y leído se actualizan desde el webhook existente.

Una respuesta breve `BAJA`, `STOP`, `NO GRACIAS`, `NO ME ESCRIBAN` o `CANCELAR`, sin distinguir acentos o mayúsculas, marca `optOutDifusion`, añade una nota interna y sale de `ingestarEntrante` antes de las ramas de horario y bot. Por ello ese mismo mensaje no genera contestación automática. Una respuesta normal sigue hacia el bot existente.

## Workflow n8n por crear

No se creó ni activó ningún workflow. En el n8n de producción se debe configurar:

1. **Schedule Trigger**: cada minuto.
2. **HTTP Request**: método `POST` a `https://<dominio-del-crm>/api/cron/campanas-envio`.
3. Header `x-api-key`: credencial secreta que coincide con `WA_API_KEY` del CRM. Guardarla en credenciales de n8n, nunca en el export del workflow.
4. Revisar `ok`, `enviados`, `fallidos` y `errores`. Alertar si `ok` es `false`; el cron sigue con las demás campañas aunque una falle.

El proceso solo considera la organización 12 cuando la clave está activa. Reserva una tanda en PostgreSQL antes de llamar a Graph y espera 1.2–3 s entre envíos. Una reserva `enviando` de más de 10 min se devuelve a `pendiente` al siguiente cron. Si Graph aceptó un mensaje y la aplicación cayó antes de guardar su ID, ese caso extremo puede repetirse al recuperar la reserva; Meta no ofrece una clave de idempotencia en este flujo. Revisar el reporte si hubo una caída durante un lote.

`131050` produce baja sin reintento; `131049` permite un único reintento después de 24 h; `131026` marca fallo permanente; `131042` o un token rechazado pausa la campaña. Más de 6 fallos entre los últimos 20 también la pausa. Un administrador debe resolver la causa y reanudarla manualmente.

## Validación

En una base PostgreSQL **nueva y aislada** llamada `campanas_test`, ejecutar `prisma db push`, luego `web/prisma/sql/actualizaciones.sql` y las partes B–E de `web/prisma/sql/multi-tenant.sql`. Crear el rol `crm_app` sin `BYPASSRLS` y darle los permisos de la parte C. Configurar `ADMIN_DATABASE_URL` (dueño) y `DATABASE_URL` (`crm_app`) hacia esa base local. El script rechaza cualquier host distinto de `localhost` o `127.0.0.1` y cualquier otro nombre de base.

Desde `web/`, ejecutar `npm run check:campanas-envio`, `npx prisma validate`, `npx tsc --noEmit` y `npm run lint`. El script simula Graph en memoria y bloquea cualquier otra llamada de red. Cubre CSV/XLSX, vista previa, calendario, topes entre campañas, concurrencia, recuperación, códigos de Meta, pausa por fallos, baja, RLS y módulo apagado. No utilizar un token real ni activar el cron de n8n durante pruebas.
