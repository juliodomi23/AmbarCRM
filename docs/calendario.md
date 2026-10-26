# ADR: sincronización bidireccional con Google Calendar

**Estado:** propuesta implementada en la rama `codex/p0-fase-3-calendario`.

## Decisión

La frontera `ProveedorCalendario` separa el servicio de sincronización de Google Calendar REST y del `ProveedorCalendarioMock`, que no usa red. El mock solo se habilita en producción cuando `CALENDARIO_PERMITIR_MOCK=1`; el flujo de OAuth real selecciona Google.

OAuth se inicia por el usuario del CRM, con `state` firmado que incluye organización, usuario, nonce y vencimiento, y una cookie `httpOnly`. Cada usuario tiene una conexión propia y selecciona un calendario (`primary` por defecto). Se solicitan `calendar.events`, `calendar.readonly` y `email`. Access y refresh tokens se cifran con el mecanismo AES-GCM compartido con pagos y se persisten en columnas `*_encrypted`; nunca se exponen a la UI.

Las citas se empujan al guardar mediante `crearCitaInterna`/`editarCita`. Los cambios entrantes usan `events.list` con `syncToken`, `pageToken`, marcadores `ambarcrm_cita_id` y un reclamo con TTL. Los conflictos se resuelven por LWW: `citas.updated_at` contra `events.updated`; el resultado queda en `eventos_calendario.detalle` y `estado=conflicto`. Se importa como cita aquello que no tiene mapeo ni propiedad privada.

## Datos y aislamiento

`calendarios_conectados` conserva una fila por org/usuario, calendario elegido, sync token, estado y zona horaria. `eventos_calendario` mapea cada evento externo a la cita y guarda resultado/error de sync. Ambas tablas tienen `org_id`, FK compuesta, índices, `org_isolation` con `USING` y `WITH CHECK`; los eventos son únicos por organización/conexión/evento externo.

Las conexiones existentes con `usuario_crm_id IS NULL` se asignan al primer usuario admin de su organización (menor `id`). Si una organización carece de admin, la migración se detiene antes de hacer la columna obligatoria; los eventos existentes no se borran. Al cambiar de calendario, el sync token se reinicia y los mapeos anteriores se conservan como `desvinculado` con detalle; no se borran eventos del calendario previo. Al cambiar el responsable de una cita, el siguiente push borra el evento del calendario anterior y crea/actualiza el del nuevo responsable cuando este tiene conexión activa. Sin conexión destino, los mapeos anteriores permanecen sin cambios.

La zona inicial se toma de la configuración existente de `reservas_en_linea` y se guarda en la conexión. Los instantes se envían como ISO UTC con la zona IANA de la organización; no se usa la zona del servidor.

## Riesgos y límites actuales

- La sincronización incremental se dispara manualmente desde la sección "Conecta tu calendario" de Citas (solo conexión propia; el admin sincroniza todas) o por `POST /api/cron/calendario` con la clave API configurada.
- El empuje fallido se guarda como pendiente/error y se reintenta al ejecutar el endpoint manual o el cron.
- Una importación usa un contacto genérico por organización. Los eventos de día completo no se importan porque el modelo `Cita` requiere instantes.
- Google puede invalidar un `syncToken`; se hace full resync y se presenta el motivo en la conexión.
- Al desconectar, la conexión propia se marca como revocada y deja de usarse. No se borran las citas.

## Variables de entorno

`GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `CALENDARIO_OAUTH_REDIRECT_BASE` (por defecto `http://localhost:3000/api/calendario/oauth/callback`) y `CALENDARIO_PERMITIR_MOCK`. El cifrado requiere la clave ya usada por los tokens de pago.

## Prueba manual con cuenta de Google

1. Crea un OAuth Client ID de tipo Web en Google Cloud y agrega la URL de callback exacta a los URI autorizados. Deja el consentimiento en modo Testing e incluye la cuenta personal como usuario de prueba.
2. Define las variables anteriores en el entorno local y configura la clave de cifrado de pagos ya existente. Habilita los módulos `citas` y `calendario` en la organización.
3. Como usuario del módulo, abre `/citas`, baja a "Conecta tu calendario", conecta la cuenta, elige un calendario y acepta los permisos. Crea, edita y cancela una cita asignada a ese usuario; comprueba el evento y su propiedad privada `ambarcrm_cita_id` en Calendar.
4. Edita, crea y elimina eventos desde Calendar, pulsa «Sincronizar ahora» y verifica la agenda y el estado de sincronización.

Ejecuta `npm run check:calendario` para validadores y el mock sin BD. La prueba de integración `npm run test:calendario:e2e` solo admite `DATABASE_URL` y `ADMIN_DATABASE_URL` en `localhost/cfdi_test`. Para compilar/validar, ejecuta `npx prisma validate`, `npx tsc --noEmit`, `npm run lint` y `npm run build` desde `web`.
