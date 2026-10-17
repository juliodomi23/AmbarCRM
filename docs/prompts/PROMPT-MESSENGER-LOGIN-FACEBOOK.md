# Prompt para Codex — Messenger: botón "Conectar con Facebook"

> Copia desde "## Prompt" y pégalo en Codex. Corrida única, una sola parada al final.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`, código en `web/`). Parte de
`modulos-fase-2` (ya contiene los canales Messenger y API) y crea la rama `messenger-login-facebook`.
**No hagas push, deploy ni toques producción, `meta-tech-provider` ni `ambarcrm-db`.** Reglas del repo en
`PLAN-CIERRE-FASE-2.md`: BD desechable en :55450 armada con `schema.sql` + `multi-tenant.sql` +
`actualizaciones.sql` (no `prisma db push`), RLS + GRANT en toda tabla nueva, `test-aislamiento.ts` y
`scripts/check-seguridad.ts` en verde, commit por paso, español, sin comentarios obvios ni librerías nuevas.

### Objetivo

Hoy un canal Messenger se conecta pegando `page_id` + `page_access_token` (+ App ID/Secret opcionales) en
Configuración → Canales (`web/src/components/config/CanalExterno.tsx`, `guardarCanalMessenger` en
`web/src/lib/services/canales.ts`). Añade un botón **"Conectar con Facebook"**: la persona inicia sesión,
elige su página y el CRM crea/actualiza el canal solo. **La conexión manual se queda tal cual** como
respaldo (sirve mientras Meta no apruebe permisos).

### Referencia

Reutiliza el patrón que ya existe para WhatsApp: `web/src/components/config/EmbeddedSignup.tsx`,
`web/src/app/api/wa/onboard/route.ts`, `web/src/lib/meta/registro.ts`, `credentials.ts` (cifrado) y
`config.ts` (`requireMetaAppCredentials`, `META_GRAPH_URL`). Lee primero cómo carga el SDK de Facebook,
cómo valida y cómo guarda; no dupliques lo que ya resuelve.

### Flujo a implementar

1. **Login (cliente):** botón en el formulario de Messenger que abre `FB.login` con scope
   `pages_show_list,pages_messaging,pages_manage_metadata` (más `pages_read_engagement` solo si hace
   falta para leer nombre/foto de la página; justifica en `docs/canales-decisiones.md`). Envía al servidor
   el `code` (o token de usuario) que devuelve Meta.
2. **Intercambio (servidor):** `POST /api/canales/messenger/facebook/paginas` (solo admin de la empresa,
   `requireSesion(true)`): canjea el `code` por un token de usuario con `META_APP_ID`/`META_APP_SECRET`,
   lo cambia por uno de larga duración, llama `GET /me/accounts?fields=id,name,access_token,picture` y
   devuelve **solo** `[{ id, nombre, foto }]`. Los `access_token` de página **nunca** viajan al navegador:
   se guardan cifrados en el servidor, ligados a la sesión/empresa con vencimiento corto (≤10 min), por
   ejemplo en un cookie `httpOnly` firmado o en una tabla temporal con RLS + GRANT; elige lo más simple y
   anótalo.
3. **Elegir página:** la UI muestra la lista; el usuario elige una (o varias, una por canal).
4. **Conectar:** `POST /api/canales/messenger/facebook/conectar` con `{ page_id, nombre? }`: toma el token de
   página guardado, lo valida, y reutiliza `guardarCanalMessenger` (suscripción a `subscribed_apps`,
   cifrado del token, error 409 si la página ya está conectada en otra empresa). Limpia el estado temporal.
5. **Reconexión:** si el canal existe y está `desconectado` por token vencido, el mismo botón lo actualiza
   en lugar de crear otro.
6. **Seguridad:** parámetro `state`/anti-CSRF verificado en el servidor; ningún token en logs, bitácora,
   respuestas ni URLs; el cuerpo de error de Meta se recorta antes de mostrarse; rate limit en las dos rutas.
7. **App propia vs global:** el login usa la app global del CRM (`META_APP_ID`). Si el canal ya tenía
   `appId`/`appSecret` propios (otra app de Meta), esa persona debe usar la conexión manual; muestra un
   aviso claro en vez de mezclar credenciales.
8. **Estado de aprobación:** mientras la app esté en modo desarrollo o sin acceso avanzado, solo personas
   con rol en la app podrán completar el login. Si Meta responde error de permisos, muestra un mensaje
   legible ("tu cuenta no tiene permiso en la app de Meta; usa la conexión manual") en vez de un error crudo.

### Fuera de alcance

Instagram, WhatsApp, cambios al webhook de Messenger o a la firma, difusión, App Review (eso es trámite
con Meta, no código), cambios en producción.

### Pruebas (Graph simulado, **sin llamadas reales a Meta**)

- Intercambio correcto devuelve solo id/nombre/foto; ningún `access_token` en la respuesta.
- `state` incorrecto o ausente → rechazo y nada guardado.
- Elegir una página que no estaba en la lista del usuario → rechazo.
- Estado temporal vencido → rechazo.
- Página ya conectada en otra empresa → 409 legible; aislamiento entre empresas (A no ve ni usa el estado
  temporal de B).
- Reconexión de un canal `desconectado` lo reactiva sin duplicarlo.
- Canal con app propia → aviso, sin mezclar credenciales.
- La conexión manual sigue funcionando (regresión) y las pruebas de `test-canales-messenger.ts` siguen verdes.

### Al terminar (única parada)

`tsc --noEmit`, build, pruebas de canales, `test-aislamiento.ts` y `check-seguridad.ts` en verde; un commit
`feat(canales): …` por paso, sin push. Documenta en `docs/despliegue-bot.md` los permisos de Meta a pedir,
la URL de redirección/dominios permitidos que hay que registrar en la app, y qué funciona antes y después
de la aprobación. Entrega resumen corto: commits, archivos, pruebas, SQL nuevo si lo hubo, y lo no probado.
**Detente y espera revisión.**
