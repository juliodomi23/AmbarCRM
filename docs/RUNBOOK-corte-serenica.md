# Runbook de corte: Serénica Health Center

Este runbook prepara una migración reversible de Chatwoot a AmbarCRM. Julio ejecuta los pasos que acceden a producción. No se hace el corte hasta que Ricardo Azcorra confirme por escrito.

## Preparación y límites

- El CRM no tiene una columna `giro` en `orgs`. El alta identifica la operación como clínica con los módulos clínicos y la marca `salud`.
- Los servicios duran 60 minutos. El alta fija Valoración inicial en $700 MXN; Los demás servicios quedan en precio 0 (la reserva pública muestra "Precio a consultar"); si Ricardo confirma precios, definir `SERENICA_PRECIO_*` antes del alta.
- El alta requiere tres correos confirmados, una URL HTTPS pública del webhook de n8n y `META_TOKEN_ENCRYPTION_KEY`. No se inventan correos ni se escriben secretos en archivos.
- Los comentarios de publicaciones de Facebook no entran en este corte. La API del CRM procesa mensajes de Messenger, no comentarios de publicaciones.
- El bot puede mandar plantillas aprobadas por `/messages/template`, con variables de texto del cuerpo. Plantillas con variables de encabezado o botones requieren ampliar el endpoint.
- El alta no copia mensajes ni contactos desde Chatwoot. El runbook incluye un diseño para una migración histórica separada.

Variables de entorno que Julio prepara en el entorno seguro del comando:

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión de la app (`crm_app`) a la base destino; el alta escribe usando RLS. |
| `DATABASE_URL_DUENO` | Conexión del dueño para respaldo y SQL; no usarla como `DATABASE_URL` de la app. |
| `DATABASE_URL_RESTAURACION` | Base desechable vacía para ensayar la restauración del respaldo del paso 4. |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | URL pública HTTPS y secreto de sesión de AmbarCRM. |
| `META_TOKEN_ENCRYPTION_KEY` | Clave Base64 de 32 bytes para cifrar el secreto HMAC del bot y credenciales de Meta. |
| `META_WEBHOOK_VERIFY_TOKEN` | Verificación del webhook de WhatsApp Cloud API. |
| `MESSENGER_VERIFY_TOKEN` | Solo si se conecta Messenger; verificación de su webhook. |
| `META_APP_ID`, `META_APP_SECRET` | App global de Meta si el canal no usa credenciales propias. |
| `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_GRAPH_VERSION` | Variables públicas usadas durante el build del SDK Meta. |
| `SERENICA_ADMIN_EMAIL`, `SERENICA_RECEPCION_EMAIL`, `SERENICA_DOCTORA_EMAIL` | Correos proporcionados y confirmados por Julio. |
| `SERENICA_N8N_WEBHOOK_URL` | Webhook de producción de n8n, HTTPS público. |
| `SERENICA_PRECIO_LIMPIEZA`, `SERENICA_PRECIO_ORTODONCIA`, `SERENICA_PRECIO_IMPLANTES`, `SERENICA_PRECIO_EXTRACCIONES` | Opcionales. Precio en MXN con hasta dos decimales; vacío = "Precio a consultar". |

Los límites `BOT_RATE_LIMIT_MAX`, `BOT_RATE_LIMIT_WINDOW_MS`, `BOT_AUTH_FAIL_MAX` y `BOT_AUTH_FAIL_WINDOW_MS` son opcionales. `DATABASE_URL_DUENO` no está en los archivos `.env.example` a propósito: Julio la carga desde su gestor de secretos.

El bot se crea sin canal. Cuando el número de WhatsApp Cloud esté conectado, asignar el canal al bot desde el CRM (sin canal no hay envío de plantillas ni recordatorios) y repetir el paso 11.

## Pasos

| # | Quién | Comando o acción | Resultado esperado | Reversión |
|---|---|---|---|---|
| 1 | Ricardo / Julio | Obtener el “sí” de Ricardo y acordar fecha, hora, responsables y números de prueba. | Aprobación y ventana de corte por escrito. | No iniciar el cambio si falta una aprobación. |
| 2 | Julio | Exportar variables del gestor de secretos y confirmar que `DATABASE_URL` apunta a la base correcta y que el rol no tiene `SUPERUSER` ni `BYPASSRLS`. No pegar URLs ni secretos en tickets o archivos. | App usa `crm_app`; `DATABASE_URL_DUENO` solo queda en la sesión administrativa. | Cerrar la sesión y revocar cualquier credencial que se haya expuesto. |
| 3 | Julio | `pg_dump -Fc "$DATABASE_URL_DUENO" -f "respaldo-serenica-$(date +%Y%m%d-%H%M%S).dump"` | Archivo de respaldo con tamaño mayor que cero. | No seguir si el respaldo falla. |
| 4 | Julio | `pg_restore --list "$RESPALDO_SERENICA" > /dev/null` y restaurar con `pg_restore --exit-on-error --no-owner --dbname="$DATABASE_URL_RESTAURACION" "$RESPALDO_SERENICA"` en una base desechable vacía. | La lista se lee y la restauración de ensayo termina con código 0. | Eliminar solo la base de ensayo si falla; conservar el respaldo. |
| 5 | Julio | Confirmar que la base destino ya tiene el esquema base de AmbarCRM y es multi-tenant. Consultar `docs/verificar-rls.md` usando `DATABASE_URL` en una base desechable o staging. | `crm_app` no tiene `BYPASSRLS` y las políticas RLS están activas. | Detenerse si la base no es multi-tenant o falla RLS. No convertir una base nueva con `prisma db push`; hace falta una ruta aprobada para instalar el esquema base. |
| 6 | Julio | Si la base destino es una instalación existente aún no multi-tenant: `psql "$DATABASE_URL_DUENO" -v ON_ERROR_STOP=1 -f web/prisma/sql/multi-tenant.sql`; inmediatamente después: `psql "$DATABASE_URL_DUENO" -v ON_ERROR_STOP=1 -f web/prisma/sql/actualizaciones.sql`. Si ya es multi-tenant, ejecutar solo el segundo comando. | SQL finaliza sin errores. `actualizaciones.sql` se aplica después de `multi-tenant.sql` porque este último concede privilegios amplios y el primero vuelve a revocar los privilegios restringidos. | Restaurar el respaldo completo si falla una migración; no retirar tablas a mano. |
| 7 | Codex / Julio | En staging/desechable: `npm run check:odontograma` con `ODONTOGRAMA_TEST_DATABASE_URL` apuntando a una base cuyo nombre contenga `test`, `tmp` o `disposable`. Luego: `npx prisma validate`, `npx tsc --noEmit`, `npm run lint`. | Checks en verde; el script de odontograma crea un esquema temporal, repite el DDL y comprueba RLS. | No promover el build hasta resolver errores. No apuntar `ODONTOGRAMA_TEST_DATABASE_URL` a producción. |
| 8 | Julio | Preparar las variables `SERENICA_*` en una sesión segura y revisar el destino con `npm run alta:serenica -- --dry-run`. | Muestra los recursos previstos, la base por nombre y cualquier variable pendiente; `escritura: false`. | Corregir las variables; el dry-run no escribe. |
| 9 | Julio | Solo después del “sí” y con respaldo: `npm run alta:serenica -- --confirmo-produccion`. Ejecutar en una terminal privada sin grabación de salida; guardar las contraseñas iniciales, `apiToken` y `X-AmbarCRM-Signature` directamente en el gestor de secretos. | Organización, módulos, usuarios, doctores, horarios, servicios, embudo, etiquetas y bot quedan creados de forma idempotente. Los secretos se imprimen solo al crear cada usuario/bot por primera vez. | Antes del corte, desactivar el bot nuevo. Cambiar contraseñas y regenerar token/secreto si la salida se perdió o expuso. |
| 10 | Julio | `npm run verificar:serenica` con `DATABASE_URL` de la organización y los tres correos en variables. | Confirma módulos, usuarios, doctores, etiquetas exactas, permisos del bot y que otra empresa no ve sus etiquetas. | No cortar si devuelve código distinto de 0; corregir la configuración y repetir. |
| 11 | Julio / Ricardo | Con un número de prueba de Meta y un contacto ficticio, probar mensaje dentro de ventana, plantilla aprobada fuera de ventana, handoff, etiquetas, cita de prueba y recepción en n8n. No usar datos de pacientes reales. | Mensajes aparecen una vez en ambos sistemas; citas caen en el calendario y n8n valida `X-AmbarCRM-Signature` (o V2 si se habilitó). | Desactivar el bot, detener el flujo de prueba y no conectar el número de producción. |
| 12 | **Solo Julio** | Revisar en Meta a qué app pertenece el número y qué otros números comparten su webhook. En la app correcta, cambiar callback y verify token a `https://<dominio-crm>/api/meta/webhook`; conservar los valores anteriores. En n8n activar el workflow CRM para el número de prueba. | Meta entrega eventos al CRM y el webhook verifica con `META_WEBHOOK_VERIFY_TOKEN`; el número de prueba sigue respondiendo. | Restaurar el callback y token anteriores en Meta; reactivar el workflow anterior de Chatwoot. Si la app comparte callback con otros números, detenerse y coordinar una app/callback aislados. |
| 13 | **Solo Julio** | En la ventana acordada, detener el workflow de Chatwoot para el número, cambiar el webhook del número/app a AmbarCRM y activar el workflow de producción de n8n. Actualizar en el gestor de secretos el token/API URL que corresponda. No cambiar DNS si no hay un cambio de host aprobado; si lo hay, Julio verifica el DNS antes del corte. | Un mensaje entrante de prueba llega a AmbarCRM y n8n una sola vez; el equipo de recepción ve la conversación y puede hacer handoff. | Aplicar inmediatamente el paso 14. No borrar ni desactivar la cuenta de Chatwoot. |
| 14 | **Solo Julio** | Reversión: detener el workflow CRM de producción; restaurar en Meta el callback/verify token anterior; reactivar los workflows de Chatwoot; validar un mensaje de prueba. | Chatwoot vuelve a recibir y contestar; AmbarCRM queda sin procesar mensajes nuevos del número. | Mantener el respaldo y el CRM apagado para ese número; investigar antes de otro corte. |
| 15 | Julio / Ricardo | Mantener Chatwoot, workflows, mensajes y exportaciones sin borrar durante al menos 30 días. Comparar conteos y resolver pendientes con Ricardo. | Ventana de retorno completada y aprobación para archivar Chatwoot por separado. | Conservar Chatwoot si hay disputa o faltan datos. |

### Importación histórica desde Chatwoot (no incluida)

La API actual no importa mensajes antiguos ni contactos en lote. Diseñar una migración aparte con exportación CSV/JSON de Chatwoot, un `--dry-run`, normalización de teléfonos, deduplicación por empresa y teléfono, mapeo de etiquetas exactas y una clave de origen que haga cada lote idempotente. Para mensajes, mapear conversación y contacto, dirección, contenido, fecha original, estado y adjuntos; conservar el ID de Chatwoot como referencia externa y no inventar un `waMessageId`. Importar primero en staging y conciliar conteos antes de decidir si el histórico se carga. No copiar notas privadas sin aprobación de Ricardo. No implementar ni ejecutar este importador como parte del corte.

### Auditoría de mensajes y permisos

- El endpoint genérico de plantillas es `POST /api/v1/accounts/1/conversations/{id}/messages/template`; valida `APPROVED` en la WABA y usa `enviar_mensaje`.
- La ruta de Messenger no procesa comentarios de publicaciones. Atender comentarios requeriría una integración aparte de eventos de publicaciones, permisos de Meta y política de respuesta; no se activa en este corte.
- No hay rutas de DNS, Meta o n8n que pueda ejecutar Codex. Las acciones señaladas como “Solo Julio” requieren acceso de Julio a las cuentas y un cambio aprobado.
