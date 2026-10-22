# Campañas de envío de EXI Chiapas

## Encendido y preparación

1. Aplicar la migración `web/prisma/sql/actualizaciones.sql` con el usuario dueño en una base de pruebas y generar Prisma. No ejecutar contra producción durante la validación.
2. En **Configuración → Clientes Ámbar CRM**, abrir la organización 12 (`exi-chiapas`) y activar `Campañas de envío`. La clave `campanas_envio` nace apagada y `soloOrgId: 12` impide mostrarla o activarla para otra organización.
3. Confirmar que el canal de EXI sea `cloud_api`, conectado y tenga una plantilla de Meta con estado `APPROVED`. La plantilla debe incluir «Responde BAJA para no recibir más mensajes».
4. En **Configuración → Automatizaciones**, ajustar la tarifa estimada de marketing si difiere de US$0.04 por entrega. La cifra es informativa; Meta factura directamente a EXI.
5. En `/campanas-envio`, un administrador activa **Envíos** tras confirmar el aviso. El interruptor por organización nace apagado; sin valor guardado también cuenta como apagado. La API guarda el usuario y la fecha de cada cambio.

## Flujo de usuario

Se acepta CSV o XLSX de hasta 5 MB y 10,000 filas de datos. El navegador lee la primera hoja de XLSX con **ExcelJS**, mantenida en npm y sin depender de `xlsx@0.18.5`. En las primeras 15 filas con contenido se detectan encabezados cuando hay al menos tres celdas y un sinónimo de teléfono; si no se detectan, se indica manualmente la fila. Se reconocen `Tel`, `Móvil`, `Contacto publicado`, `Segmento` y otros sinónimos sin distinguir acentos o mayúsculas. Los teléfonos se convierten a `52…` tras quitar extensiones; si hay varios, se toma el primero válido. Nombre, empresa y área se limpian de espacios repetidos. Las áreas equivalentes por mayúsculas o acentos se agrupan bajo su forma más frecuente. Otras columnas, como `Ciudad`, siguen disponibles como variables.

El flujo muestra cinco pasos: subir archivo, revisar columnas, revisar y aceptar, programar y reporte. La vista previa enseña el teléfono original junto al normalizado, conteos y descartados descargables. En **Revisar y aceptar** aparecen el resumen por área y la lista paginada y buscable de números. Todas las áreas empiezan desmarcadas; también pueden excluirse filas individuales. El servidor vuelve a validar archivo, filtros y selección, y solo al aceptar crea contactos, etiquetas y destinatarios para las filas válidas elegidas. La campaña guarda cantidades por área, usuario y fecha de aceptación. Si un contacto ya existe, sus datos solo se rellenan si estaban vacíos o el nombre era el teléfono. Aún no se envía nada.

El envío exige plantilla aprobada y confirmación de permiso. Valores iniciales: lunes a viernes, 09:30–17:30 `America/Mexico_City`, 5 mensajes cada 10 minutos, 50 al día. Se puede ajustar por campaña; el límite duro es 150 por día. El tope se comparte entre las campañas de un mismo canal en el día calendario de la zona de la campaña. El reporte distingue pendientes, enviados, entregados, leídos, respondidos, fallidos, omitidos y bajas. Los estados entregado y leído se actualizan desde el webhook existente.

El interruptor **Envíos: ACTIVOS / PAUSADOS** controla el cron de toda la organización. Si está apagado y hay campañas `programada` o `en_curso`, la pantalla avisa que ninguna enviará hasta activarlo. Apagarlo conserva los estados y destinatarios; al encenderlo, el cron continúa con la ventana, pausa entre tandas y tope diario vigentes. Las bajas por respuesta y los estados del webhook siguen procesándose mientras está apagado.

Una respuesta breve `BAJA`, `STOP`, `NO GRACIAS`, `NO ME ESCRIBAN` o `CANCELAR`, sin distinguir acentos o mayúsculas, marca `optOutDifusion`, añade una nota interna y sale de `ingestarEntrante` antes de las ramas de horario y bot. También funciona si antes hubo una respuesta normal y el destinatario ya está en `respondio`, dentro de los 30 días. Ese mismo mensaje no genera contestación automática. Una respuesta normal sigue hacia el bot existente.

## Workflow n8n

El workflow `AmbarCRM - Campañas de envío (EXI)` permanece activo y llama al cron cada minuto. El control operativo es el interruptor del CRM. Su configuración es:

1. **Schedule Trigger**: cada minuto.
2. **HTTP Request**: método `POST` a `https://<dominio-del-crm>/api/cron/campanas-envio`.
3. Header `x-api-key`: credencial secreta que coincide con `WA_API_KEY` del CRM. Guardarla en credenciales de n8n, nunca en el export del workflow.
4. Revisar `ok`, `enviados`, `fallidos` y `errores`. Alertar si `ok` es `false`; el cron sigue con las demás campañas aunque una falle.

El proceso revisa las organizaciones activas y solo procesa la org 12 cuando tiene el módulo y el interruptor de envíos encendidos. Un cron que empieza con el interruptor apagado no consulta Graph ni modifica campañas o destinatarios. Si se apaga durante una tanda ya iniciada, el motor se detiene entre mensajes y libera las reservas aún no enviadas. Comprueba horario, pausa entre tandas y tope diario antes de consultar plantillas en Graph. Reserva una tanda en PostgreSQL antes de enviar y espera 1.2–3 s entre mensajes. Una reserva `enviando` de más de 10 min se devuelve a `pendiente` en el siguiente cron con envíos activos. Si Graph aceptó un mensaje y la aplicación cayó antes de guardar su ID, ese caso extremo puede repetirse al recuperar la reserva; Meta no ofrece una clave de idempotencia en este flujo. Revisar el reporte si hubo una caída durante un lote.

`131050` produce baja sin reintento; `131049` permite un único reintento después de 24 h; `131026` marca fallo permanente, pero no cuenta para la pausa por calidad; `131042` o un token rechazado pausa la campaña. Siete fallos de otros códigos entre los últimos 20 también la pausan. Una variable vacía en el motor omite al destinatario sin enviar ni contar un fallo. Si Graph no está disponible, el cron registra el error y reintenta sin pausar; tras cinco consultas fallidas consecutivas, pausa con un motivo legible. Al reanudar manualmente, el contador de consultas fallidas vuelve a cero.

## Validación

En una base PostgreSQL **nueva y aislada** llamada `campanas_test`, ejecutar `prisma db push`, luego `web/prisma/sql/actualizaciones.sql` y las partes B–E de `web/prisma/sql/multi-tenant.sql`. Crear el rol `crm_app` sin `BYPASSRLS` y darle los permisos de la parte C. Configurar `ADMIN_DATABASE_URL` (dueño) y `DATABASE_URL` (`crm_app`) hacia esa base local. El script rechaza cualquier host distinto de `localhost` o `127.0.0.1` y cualquier otro nombre de base.

Desde `web/`, ejecutar `npm run check:campanas-envio`, `npx prisma validate`, `npx tsc --noEmit` y `npm run lint`. El script simula Graph en memoria y bloquea cualquier otra llamada de red. Cubre la detección de encabezados en fila 5, teléfonos con extensión o varios números, áreas equivalentes, selección explícita y exclusión de filas; también conserva la regresión de calendario, Graph, topes, concurrencia, bajas, RLS, interruptor, módulo apagado y restricción de la org 13. Solo durante la prueba quita temporalmente `soloOrgId` del catálogo en memoria para confirmar que el cron no tiene un filtro 12 propio, y restaura la restricción al terminar. No utilizar un token real ni activar el cron de n8n durante pruebas.
