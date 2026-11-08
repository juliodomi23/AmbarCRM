# Prompt para Codex — App móvil: backend (login con token, push FCM, contrato de API y textos legales)

> Copia desde "## Prompt" y pégalo en Codex. Corrida única, una sola parada al final. Tres partes, un commit por parte.
> Rama: `codex/app-movil-backend`, desde `meta-tech-provider`.

## Antes de lanzarlo (Julio)

- La API del bot (lectura, estado, asignación, contactos, adjuntos) ya está commiteada en `meta-tech-provider`
  (`1f062fe`). El prompt parte de ese commit. Si quedan docs sin commitear (`PLAN-*.md`, `plantillas-app-movil/`), no estorban.
- Necesitas un PostgreSQL desechable en localhost (ver `PLAN-CIERRE-FASE-2.md`). **No** hace falta Firebase ni red
  externa: el FCM y todo lo que sale a internet se simulan.
- Tras la corrida, revisa tú la Parte 1 (autenticación y proxy). Es lo único que puede afectar a la web si algo sale mal.
- **Esta corrida no despliega nada.** Producción (VPS 31.220.49.58, EasyPanel `ambarrojo/crmlite`) tiene 3 organizaciones
  activas (SEMBID 11, Exi Chiapas 12, Ámbar Rojo Studios 1). El despliegue es manual y lo haces tú después, con el protocolo de
  siempre (ver "Pendientes de Julio" al final).

## Contexto verificado (confírmalo leyendo el código, no lo asumas)

- **Login web:** NextAuth Credentials en `web/src/lib/auth.ts`. `authorize` resuelve la org (`resolverSlug`), aplica
  rate limit **dentro** de `authorize` (8 intentos/5 min por `org+correo` y 30/15 min por IP con `ipCliente`),
  busca el usuario con `runWithOrg`, exige `activo` en usuario y org, y compara con bcrypt.
- **Token de sesión (JWT):** el callback `jwt` guarda `id`, `rol`, `orgId`, `puesto`, `emitidoAt`, `checkedAt`, y
  NextAuth añade `name`, `email`, `sub`, `iat`, `exp`. Cada 5 min **revalida contra la BD**
  (usuario o org inactivos, cambio de rol, `sesionAnteriorAlCambio(token, passwordCambiadaAt)`) y marca `revocado`.
  `session` deja `user` vacío si `revocado`. La revalidación corre en `getServerSession`, **no** en el middleware.
- **Duración:** `DURACION_SESION = 7 días` en `web/src/lib/password-sesion.ts`, a propósito ("el CRM tiene datos de
  clientes y expedientes"). No la cambies. `password-sesion.ts` ya sabe el nombre de la cookie
  (`next-auth.session-token`, con prefijo `__Secure-` si `NEXTAUTH_URL` empieza con `https://`) y que NextAuth
  fragmenta cookies mayores de 3933 caracteres.
- **Proxy:** `web/src/proxy.ts` es solo `next-auth/middleware` con `authorized: !!token && !token.revocado` y un
  `matcher` que **excluye** rutas públicas, entre ellas `api/v1` (bots), `api/media`, `api/meta`, `api/public`,
  `api/cron`, `api/auth`. Next 16.3. Un request sin sesión a una ruta protegida recibe redirect al login.
- **Las rutas** leen la sesión con `requireSesion()` (`lib/session.ts`) o `getServerSession(authOptions)`, y ambos
  leen **solo la cookie**. `db` (`lib/db.ts`) resuelve el tenant desde `runWithOrg` o, si no hay, llamando a
  `getServerSession`: por eso basta con que la sesión funcione para que RLS funcione.
- **`/api/stream`** (SSE) usa `getServerSession` y una conexión PG dedicada con `LISTEN nuevo_mensaje`.
- **`/api/media/[archivo]`**: orden de acceso = firma (`?firma&vence`) → `requireBot` → `requireSesion`.
  `requireBot` lee los headers `api_access_token` / `x-bot-token`, **no** `Authorization`, así que un Bearer no choca
  con bots.
- **Push actual:** `web/src/lib/push.ts`. `enviarPushAOrg(titulo, cuerpo, url)` **empieza con
  `if (!pushConfigurado) return;`** (sin claves VAPID no hace nada) y manda web push a `push_suscripciones` bajo
  RLS. Se llama con `void …catch` desde `lib/services/ingest.ts` (`url = /chat?conv=<id>`) y desde
  `api/public/tienda/[slug]` (`url = /ventas/<id>`, sin conversación). La ruta `api/push/suscribir` es el patrón a copiar.
- **Migraciones:** SQL idempotente al final de `web/prisma/sql/actualizaciones.sql` (el último patrón es
  `campanas_envio`: `CREATE TABLE IF NOT EXISTS`, `org_id … DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint`,
  RLS `org_isolation`, GRANT a `crm_app`; la RLS de `push_suscripciones` está en `multi-tenant.sql` líneas ~156-183).
  Una BD nueva corre `schema.sql` + `multi-tenant.sql` + `actualizaciones.sql`. No uses `prisma db push`.
  Actualiza también `web/prisma/schema.prisma` (modelo hermano de `PushSuscripcion`, ~línea 705).
- **Variables de entorno:** el contenedor solo recibe las que `docker-compose.yml` mapea en el servicio `app`.
  `PRIVACY_EMAIL: ${PRIVACY_EMAIL:-}` está mapeada pero **vacía por defecto**; entonces `/privacidad` y
  `/eliminacion-datos` muestran `privacidad@tudominio.com`.
- **Dos mundos de autenticación, no los mezcles.** Las rutas `/api/*` de la UI usan sesión de usuario (`requireSesion`); las
  `/api/v1/accounts/:id/...` son del **bot de n8n** (`conBot`, token por bot, 300/min, permisos, bitácora `auditoria_bot`).
  La app móvil usa **solo el primero**: no crees ni reutilices nada de `/api/v1` ni de `bot-auth`.
- **La app consume los endpoints de la UI que ya existen**, no los del bot. `GET /api/conversaciones` devuelve **toda** la lista
  sin paginación ni filtros (campos: `id, contacto, esPersonal, fijado, responsableId, noLeidos, ultimoMensajeAt, preview,
  estado, etiquetas, canalId, canalNombre, canalProveedor, ultimoEntranteAt, canalActivo, botActivo`); `?q=` (≥2 letras) busca
  en mensajes. Hay también `api/conversaciones/[id]` y `api/conversaciones/[id]/mensajes`. Con el volumen actual (153
  conversaciones y 2 202 mensajes en total; la org más grande tiene 115) eso es aceptable: **no lo cambies**, solo documéntalo.
- **Cambiar el estado de una conversación** (cerrar/reabrir) desde la UI pasa por `actualizarConversacion`
  (`lib/services/conversacion-estado.ts`): bloquea la fila, emite `conversacion.estado_cambiado` (webhooks salientes y
  automatizaciones, origen `agente`) y, al cerrar, manda la encuesta CSAT si `csatActivo`. La app debe usar la ruta de la UI
  (`PATCH /api/conversaciones/[id]`) para que todo eso ocurra; **no hagas un `update` directo ni un endpoint nuevo**.
- `Conversacion.updatedAt` se mueve con **cualquier** escritura, incluso marcar como leído (`noLeidos = 0`). Documéntalo en el
  contrato: si la app sincroniza por `updatedAt`, debe deduplicar por `id`.
- Las notas internas (`mensajes.interna = true`) las ven los agentes (la app las muestra) pero **nunca salen al cliente**.
- La migración de `updated_at` y sus índices ya está en `actualizaciones.sql` (bloque "Lectura cronológica de conversaciones…",
  al final). Tu tabla nueva va **después** de ese bloque.
- **Pruebas:** no hay framework. El patrón es `web/scripts/check-*.ts` con `tsx`, `node:assert/strict`, BD aislada
  (el script rechaza todo lo que no sea `localhost` y una BD con nombre `*_test`), `DATABASE_URL` y
  `ADMIN_DATABASE_URL`, y `globalThis.fetch` reemplazado para bloquear red externa. Ejemplo: `check-campanas-envio.ts`
  (script npm `check:campanas-envio`). Sigue ese patrón.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`, código en `web/`). Parte del commit actual de
`meta-tech-provider` y crea la rama `codex/app-movil-backend`. **No hagas push ni deploy, no toques producción,
`main` ni ninguna base real, y no llames a red real** (Meta, FCM, Anthropic, Google): todo simulado. Reglas del repo en
`PLAN-CIERRE-FASE-2.md`: BD desechable, commit por parte, mensajes en español, sin comentarios obvios, código
modular y chico, sin sobre-ingeniería y **sin dependencias nuevas**.

### Zonas prohibidas (código de producción que otros flujos usan; no las toques ni las reformatees)

`web/src/app/api/v1/**`, `web/src/lib/bot-*.ts` (incluye `bot-conversations-read.ts`), `docs/api-bot.md`,
`web/src/lib/eventos-crm.ts`, `web/src/lib/services/conversacion-estado.ts`, `web/src/lib/channel/**`, `web/src/lib/meta/**`,
`web/src/app/api/meta/**`, `web/src/app/api/wa/**`, `web/src/components/config/**`, y cualquier ruta o servicio de
conversaciones/mensajes existente. **Alcance:** no agregues endpoints de conversaciones, mensajes ni contactos: la app usa los
que ya existen. Lo único nuevo en `/api/*` es `api/movil/*`.
En `actualizaciones.sql` y `schema.prisma` **solo añade al final / junto a `PushSuscripcion`**, nunca edites líneas existentes
(así el merge con el trabajo de Julio no choca).

### Lo que NO debe cambiar (compruébalo, es el criterio de éxito)

1. El login web, tal cual: mismo resultado, mismos límites de intentos, misma sesión de 7 días, misma cookie.
2. Todo request **sin** `Authorization: Bearer` pasa por el proxy exactamente como hoy.
3. Las rutas públicas del `matcher` siguen siendo públicas: `/login`, `/recuperar`, `/api/auth/*`, `/api/v1/*`, `/api/meta/*`,
   `/api/public/*`, `/api/cron/*`, `/privacidad`, `/eliminacion-datos`, etc.
4. `/api/media` sigue sirviendo con firma, con token de bot y con sesión web.
5. El web push sigue igual cuando FCM no está configurado.
6. Un fallo de FCM jamás rompe ni retrasa el flujo que disparó la notificación (ingesta de mensajes, pedidos).

---

### Parte 1 · Login con token y Bearer

**1.1 Extrae, no dupliques.** Mueve el cuerpo de `authorize` a una función compartida (p. ej. `validarCredenciales({ email,
password, orgSlug, headers })`) en `lib/auth-credenciales.ts` que conserve tal cual: `resolverSlug`, los **dos** rate limits,
RLS, `activo` y bcrypt, y devuelva el mismo objeto de usuario o `null`. `authorize` la llama. Cero cambios de comportamiento.

**1.2 `POST /api/movil/login`** `{ org, email, password }` (`org` obligatorio):
- Usa `validarCredenciales` (heredas los dos rate limits, que devuelven `null` y por eso son indistinguibles de una mala
  contraseña). Pásale las cabeceras del request como `Record` para `ipCliente`.
- Respuesta de éxito: `{ token, expiraEn, usuario: { id, nombre, rol, puesto }, org: { slug, nombre } }`, con
  `Cache-Control: no-store`. `token` = `encode` de `next-auth/jwt` con `NEXTAUTH_SECRET`, `maxAge: DURACION_SESION`
  (7 días, la constante existente) y **el mismo contenido que el callback `jwt` del login web**: `sub`, `name`, `email`,
  `id`, `rol`, `orgId`, `puesto`, `emitidoAt = Date.now()`, `checkedAt = Date.now()`. Verifica que `getServerSession` lo
  acepta igual que a uno web.
- Falla → `401 { error: "credenciales inválidas" }`, siempre idéntico y sin distinguir causa. Cuerpo mal formado → 400.
- Nunca imprimas contraseñas ni tokens en logs.

**1.3 `POST /api/movil/renovar`** (con Bearer): responde igual que el login con un token nuevo. Antes de emitirlo,
relee usuario y org de la BD (`runWithOrg`): si están inactivos o `sesionAnteriorAlCambio` da true → 401. Refresca `rol` y
`puesto`. **Conserva el `emitidoAt` original** del token (si lo reiniciaras, un cambio de contraseña no mataría la cadena
de renovaciones) y pon `checkedAt = Date.now()`.

**1.4 `POST /api/movil/logout`** (con Bearer): responde `{ ok: true }`. En la Parte 2 se extiende para borrar el token FCM.

**1.5 Proxy.** Reescribe `proxy.ts` como una función que envuelve el middleware actual. Extrae de `password-sesion.ts`
una función `nombreCookieSesion()` (misma lógica de `secure`) y úsala allí y aquí; no dupliques el nombre.
- Sin `Authorization: Bearer` **o** con cookie de sesión presente (`nombre` o `nombre.0`): llama al middleware actual, igual
  que hoy. La cookie gana siempre.
- Con Bearer y sin cookie, en rutas del `matcher`: lee el token con `getToken({ req })` (en next-auth v4 acepta Bearer; verifica
  que así sea). Si no hay token válido o viene `revocado` → `401 { error: "no autorizado" }` en JSON (no redirect). Si es
  válido → deja pasar copiando el token a la cabecera `Cookie` con `NextResponse.next({ request: { headers } })`
  (o `req.cookies.set` + `NextResponse.next({ request: req })`), para que `requireSesion`, `getServerSession` y `db` funcionen
  sin tocar ninguna ruta. Conserva las otras cookies si ya existían.
- **`/api/media`:** hoy está excluida del `matcher`. Quítala de esa exclusión **y** haz que, para esa ruta, el proxy
  **nunca bloquee ni redirija**: solo, si hay Bearer y no hay cookie, inyecta la cookie igual que arriba y deja pasar
  (la propia ruta sigue decidiendo con firma, bot o sesión). Así `CachedNetworkImage` de la app puede usar Bearer.
- Añade `api/movil/login` a las exclusiones del `matcher`. No cambies ninguna otra exclusión.
- El token es corto (cabe en una cookie); si `encode` produjera más de 3933 caracteres, falla la prueba y repórtalo.

**1.6 Costo conocido (solo repórtalo, no lo optimices):** el token móvil es estático, así que su `checkedAt` envejece y
`getServerSession` revalida contra la BD (2 consultas por PK) en cada request pasados 5 min. Mide cuántas consultas extra
hace una petición típica y repórtalo.

### Parte 2 · Dispositivos y push (FCM)

**2.1 Tabla `dispositivos_push`**, en `actualizaciones.sql` (al final) y `schema.prisma`: `id`, `org_id` (con el DEFAULT de
tenant), `usuario_id`, `token_fcm` único, `plataforma` con CHECK (`'ios'`,`'android'`), `ultima_vez`, `created_at`, índices por
`org_id` y `usuario_id`, RLS `org_isolation` y GRANT a `crm_app`, **copiando el patrón** de `campanas_envio`/`push_suscripciones`.
Idempotente: córrelo 3 veces sobre la BD desechable.

**2.2 Endpoints** (copia el estilo de `api/push/suscribir`):
- `POST /api/movil/dispositivo` `{ tokenFcm, plataforma }`: valida `plataforma` y longitud del token (400 si no). Upsert por
  `token_fcm`; si ese token estaba a nombre de **otro usuario u otra org**, se reasigna al usuario actual (el teléfono cambió de
  dueño). Actualiza `ultima_vez`. Cuidado con RLS: un token ya registrado en otra org no es visible desde esta; resuélvelo de
  forma segura (función `SECURITY DEFINER` mínima, o borrado previo con la conexión adecuada) y explica la decisión en el reporte.
- `DELETE /api/movil/dispositivo` `{ tokenFcm }`: borra solo si es del usuario actual.
- Amplía `POST /api/movil/logout` para aceptar `{ tokenFcm }` opcional y borrarlo (solo del usuario actual).

**2.3 `enviarPushAOrg`**, sin cambiar su firma ni su regla de a quién notifica:
- **Quita el `return` temprano global.** El web push se hace solo si `pushConfigurado`; FCM se hace solo si hay
  `FIREBASE_SERVICE_ACCOUNT_JSON`. Cada uno independiente (hoy sin VAPID no habría FCM).
- FCM HTTP v1 (`https://fcm.googleapis.com/v1/projects/<project_id>/messages:send`), con token OAuth2 obtenido de la cuenta de
  servicio (JWT RS256 firmado con `node:crypto`, scope `https://www.googleapis.com/auth/firebase.messaging`, canje en
  `https://oauth2.googleapis.com/token`), **cacheado hasta ~5 min antes de expirar**. Sin librerías nuevas.
- Mensaje: `notification { title, body }` (corta el cuerpo a ~150 caracteres), `data` con **solo strings**: `url` y, si la `url`
  coincide con `/chat?conv=<id>`, `conversacionId`; `android.priority: "high"`; `apns` con sonido por defecto.
- Timeout de 8 s por llamada y `Promise.allSettled`. Borra el token si FCM responde `UNREGISTERED` (404) o `INVALID_ARGUMENT`
  por token inválido; cualquier otro error solo se loguea (sin imprimir el token completo).
- Si `FIREBASE_SERVICE_ACCOUNT_JSON` falta o es JSON inválido: FCM queda desactivado con un único aviso en logs, sin lanzar.
- Mapea `FIREBASE_SERVICE_ACCOUNT_JSON: ${FIREBASE_SERVICE_ACCOUNT_JSON:-}` en `docker-compose.yml` (servicio `app`) y
  documéntala en `web/.env.example`.

### Parte 3 · Contrato de API y textos legales

**3.1 `API-MOVIL.md`** (raíz de AmbarCRM). La app Flutter se construye contra este documento: **no inventes nada**. Con el
servidor real (`next build` + `next start` en un puerto local, contra la BD desechable con datos de demo, p. ej. con
`web/scripts/seed-meta-review.mjs`), ejecuta cada endpoint con un token móvil y copia la respuesta real recortada. Por cada
uno: método y ruta, parámetros, ejemplo de respuesta y errores posibles. Incluye al inicio: URL base, cómo se manda el Bearer,
duración del token (7 días) y cuándo renovar (al abrir la app), y qué devuelven los errores de autenticación (401 JSON).
Endpoints: login/renovar/logout/dispositivo; `GET /api/public/brand?slug=`; `GET /api/shell`; conversaciones (lista con filtros
y paginación, detalle, asignar, cerrar/reabrir, borrar); mensajes de un chat; `POST /api/mensajes/enviar` (texto, foto,
documento, audio, nota interna, plantilla; base64 en JSON, tope ≈ 18 MB; audio `audio/ogg|mp4|mpeg|aac|amr`);
`GET /api/meta/templates?canalId=`; `GET /api/stream` (formato exacto de los eventos SSE; para capturar uno, inserta un mensaje en
la BD desechable y verás el `NOTIFY`); `GET /api/media/:archivo` con Bearer; `GET /api/buscar?q=`; contactos, etiquetas,
usuarios, embudos, oportunidades (`/api/oportunidades/mover`), tareas; `POST /api/ia/sugerir`.
- **Los endpoints que salen a internet (envío por WhatsApp, plantillas de Meta, IA) no los ejecutes contra red real.** Si una
  ruta falla antes de salir (p. ej. ventana de 24 h cerrada, validación), ejecútala y documenta ese error; si no estás
  100 % seguro de que no sale a red, documenta la forma de la respuesta **leyendo el código** y márcala
  `[no ejecutado: sale a Meta/IA]`.
- Marca claramente cualquier endpoint que se comporte distinto a lo esperado o con problemas de uso móvil (por ejemplo
  consultas sin paginación).
- Documenta **solo los endpoints de la UI** (sesión de usuario). No documentes `/api/v1`; añade una nota al inicio: "estos
  endpoints son para la app; los de `/api/v1` son del bot y no deben usarse desde la app".
- En conversaciones: indica que la lista llega completa y sin paginar (con el volumen actual es aceptable), que `updatedAt`
  se mueve con cualquier escritura (deduplicar por `id`), que cerrar/reabrir va por `PATCH /api/conversaciones/:id`
  (dispara evento, automatizaciones con origen `agente` y encuesta CSAT al cerrar) y que las notas internas no salen al cliente.
- Muestra cómo se ve una conversación con `botActivo`, con etiquetas y con la ventana de 24 h cerrada.

**3.2 Textos legales** para la revisión de Apple y Google:
- `web/src/app/privacidad/page.tsx`: añade una sección sobre la **app móvil** (datos que recoge: datos de la cuenta, token de
  notificaciones, fotos/audio/archivos que el usuario envía; permisos de cámara y micrófono usados solo al enviar; Firebase
  Cloud Messaging de Google como proveedor de notificaciones; no se venden datos) y actualiza `updated`. Mismo estilo y tono.
- `web/src/app/eliminacion-datos/page.tsx`: una línea que cubra las cuentas de usuario de la app móvil.
- No inventes datos legales (razón social, domicilio, plazos nuevos): usa solo lo que ya dicen las páginas.
- `PRIVACY_EMAIL`: no cambies el comportamiento, pero **lístalo en el reporte** como pendiente de Julio.

---

### Pruebas (obligatorias)

Crea `web/scripts/check-app-movil.ts` (script npm `check:app-movil`, mismo patrón y mismas protecciones de BD aislada,
nombre `app_movil_test`) para lo que corre en proceso (con `fetch` bloqueado a red externa), y `web/scripts/check-app-movil-http.ts`
(`APP_URL` obligatorio, solo `127.0.0.1`/`localhost`) para lo que exige servidor real. Cubre:

**Login y token**
- Login: ok; contraseña mala; usuario inactivo; org inactiva; org inexistente; rate limit por `org+correo` y por IP. El cuerpo y
  el código de error son idénticos en todas las fallas.
- Regresión de `authorize`: el login web (flujo real `POST /api/auth/callback/credentials`) sigue funcionando y emite cookie
  de 7 días; los dos rate limits siguen actuando.
- El token móvil decodifica con los mismos campos que uno web y `getServerSession` lo acepta.
- Renovar: token nuevo válido; conserva `emitidoAt`; Bearer inválido → 401; usuario desactivado → 401.
- Cambiar la contraseña del usuario (`passwordCambiadaAt`) deja inservible un token móvil anterior (401), también tras renovar.

**Proxy** (servidor real)
- `GET /api/shell` y `GET /api/conversaciones` con Bearer → 200 con datos de **su** org; sin Bearer ni cookie → mismo redirect de hoy;
  con Bearer malformado, expirado o `revocado` → 401 JSON; con cookie y Bearer distintos gana la cookie.
- La org B no ve datos de la org A (RLS) con su token.
- **Camino móvil de cerrar conversación:** con Bearer móvil, `PATCH /api/conversaciones/:id` pasa a `cerrada`, queda un evento
  `conversacion.estado_cambiado` con origen `agente` (usa un webhook saliente de prueba apuntando a un servidor local), la
  encuesta CSAT solo sale si `csatActivo` (déjalo apagado en la org de prueba; ninguna llamada a Meta), y el comportamiento es
  idéntico al de la sesión web.
- Un token del bot (`api_access_token`) **no** sirve en `/api/movil/*` ni en rutas de la UI, y un token móvil **no** sirve en `/api/v1/*`.
- `GET /api/stream` con Bearer: la conexión se mantiene, llega `: conectado`, y al insertar un mensaje de la org llega el evento;
  no llega el de otra org.
- `/api/media/…`: con cookie web 200; con `x-bot-token` 200; con URL firmada 200; con Bearer móvil 200; sin credenciales 401;
  archivo de otra org 404; **nunca** redirige.
- **Tabla de rutas públicas:** convierte el `matcher` a regex y comprueba un listado explícito de paths: los públicos listados
  en "Lo que NO debe cambiar" siguen sin pasar por el proxy (salvo `/api/media`, que pasa pero nunca bloquea) y los protegidos sí.

**Push**
- `dispositivos_push`: alta; reasignación entre usuarios y entre orgs; baja solo del dueño; aislamiento por org (RLS); sin
  Bearer 401; `plataforma` inválida 400; token vacío o gigante 400.
- `enviarPushAOrg` con `fetch` simulado: llega a los dispositivos de la org y a ninguno de otra; `conversacionId` correcto con
  `/chat?conv=12` y ausente con `/ventas/7`; `data` solo strings; token `UNREGISTERED` se borra; error 500 de FCM no lanza y no borra;
  timeout no bloquea más de ~8 s; **sin VAPID pero con FCM → FCM sí se envía**; con VAPID y sin FCM → el web push funciona como antes;
  sin ninguno → no hace nada ni lanza.
- Un fallo de FCM dentro de `ingestarEntrante` no hace fallar la ingesta de un mensaje.
- Logout con `tokenFcm` lo borra; no borra tokens de otro usuario.

**Migración**
- `actualizaciones.sql` completo corre **3 veces** sin error sobre la BD desechable, y `\d dispositivos_push` muestra RLS y GRANT.

**Regresión general**
- `npx tsc --noEmit`, `npm run lint`, `npm run build` y los `check-*` ya existentes que corras habitualmente
  (al menos `check-campanas-envio`, `check-audio-ogg`, `check-instagram`) pasan igual que antes.
- `git diff --stat` contra el commit base no toca ninguna zona prohibida (muéstralo).

### Al terminar

Un solo reporte con: qué hiciste por parte (3 commits), resultado de cada prueba, el `git diff --stat`, la medición de la
sección 1.6, **cada decisión que tomaste y Julio debe revisar** (en especial la reasignación de tokens entre orgs bajo RLS y el
tratamiento de `/api/media` en el proxy), los endpoints de `API-MOVIL.md` que quedaron sin ejecutar o raros, y la lista de
**pendientes de Julio**: crear el proyecto Firebase y la cuenta de servicio, poner `FIREBASE_SERVICE_ACCOUNT_JSON` en
EasyPanel, confirmar `PRIVACY_EMAIL` real en producción y la revisión legal del texto nuevo. Incluye también el **protocolo
de despliegue** de esta migración (tabla nueva `dispositivos_push`, aplicada por `db-migrate`): respaldo con `pg_dump -Fc`,
ensayo sobre una copia en un Postgres desechable, `actualizaciones.sql` corrido 3 veces, y solo entonces el Deploy manual.
Menciona además que **cada mensaje entrante notifica a todos los dispositivos de la org** (hoy `enviarPushAOrg` no filtra por
usuario ni por conversación asignada): es una decisión de producto para Julio, no la cambies. No hagas push ni merge.
