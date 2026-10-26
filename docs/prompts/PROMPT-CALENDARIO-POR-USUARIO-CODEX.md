# Prompt para Codex — Google Calendar por usuario del CRM

> Copia todo este archivo en Codex. Continúa la Fase 3 (`PROMPT-P0-FASE-3-CODEX.md`), que ya funciona con **una sola conexión por organización y calendario fijo `primary`**.

---

## QUÉ HAY QUE HACER

Pasar de "una conexión de Google por organización" a **una conexión de Google por usuario del CRM**, con **un calendario elegible por usuario** y sincronización en ambos sentidos. Caso de uso: cada doctor conecta su propia cuenta y sus citas aparecen en su Google Calendar.

No toques pagos, CFDI, Fase 1.x ni nada fuera del módulo de calendario y su UI. No agregues varios calendarios por usuario, calendarios compartidos de equipo ni escritura del admin en calendarios ajenos: **quedan fuera**.

---

## Rol

Ingeniero senior full-stack en **AmbarCRM** (Next.js 16 App Router, TypeScript, React 19, Prisma, PostgreSQL 16, Tailwind, NextAuth; multi-tenant con `org_id` y RLS). Julio solo revisa: tú implementas, pruebas y entregas evidencia.

Lee antes de tocar código: `web/AGENTS.md` (esta versión de Next.js tiene cambios; consulta `web/node_modules/next/dist/docs/`), `MULTI-TENANT.md`, `docs/calendario.md`.

Rama: crea `codex/calendario-por-usuario` desde el estado actual del working tree (contiene la Fase 3 sin commitear; no la pierdas ni la reviertas).

---

## Estado actual (verificado en el código)

- `web/src/lib/calendario/oauth.ts:63-64`: el callback hace `upsert` con `where: { orgId_calendarId: { orgId, calendarId: "primary" } }` y guarda `calendarId: "primary"`.
- `web/prisma/schema.prisma`, modelo `CalendarioConectado`: ya tiene `usuarioCrmId BigInt?`, pero **no se usa**. Unicidad actual `@@unique([orgId, calendarId])` → dos doctores con `primary` chocarían.
- `web/src/lib/calendario/servicio.ts`: `obtenerConexion()` hace `findFirst({ estado: "activa" })` → asume una sola conexión. `pushCitaCalendario(citaId)` y `sincronizarCalendarioTenant` usan esa conexión única. El reclamo atómico (`sincronizandoAt`) ya es por conexión: consérvalo.
- `web/src/app/api/calendario/oauth/iniciar/route.ts`: `conModulo("calendario", { admin: true })` → solo admin conecta. Debe poder conectar **cualquier usuario** del módulo.
- `web/src/app/api/calendario/conexion/route.ts` devuelve una sola conexión (`findFirst`).
- `web/src/app/api/calendario/sync/route.ts` sincroniza la org entera con una conexión.
- `web/src/components/calendario/CalendarioPanel.tsx`: UI de una sola conexión; el botón solo se muestra a `admin`.
- Modelo `Cita`: tiene `responsableId` (→ `Usuario`) y `doctorId` (→ `Doctor`). Revisa si `Doctor` se enlaza a `Usuario`; la conexión correcta de una cita es la del **usuario responsable** (si solo hay `doctorId`, usa el usuario vinculado a ese doctor; si no hay forma de resolverlo, la cita no se envía a ningún calendario y no es error).
- `web/src/lib/citas-servidor.ts:79` y `:137` llaman `pushCitaCalendario` al crear/editar citas. Mantén ese punto de entrada.
- Pruebas existentes: `web/scripts/check-calendario.ts`.

---

## Diseño

### Modelo de datos
1. Una conexión por **(org, usuario CRM)**: cambia la unicidad a `@@unique([orgId, usuarioCrmId])` y haz `usuarioCrmId` obligatorio para filas nuevas (las filas viejas con `NULL`: migra asignándolas al usuario que conectó si se puede deducir, o al admin de la org; documenta el criterio).
2. Mantén `calendarId` (calendario elegido, por defecto `primary`) y añade a la unicidad lo necesario para que dos usuarios distintos puedan elegir el mismo `calendarId` sin chocar (la unicidad por usuario ya lo permite; revisa `EventoCalendario` y sus `@@unique` que dependen de `calendarioId`).
3. Migración **idempotente** en `web/prisma/sql/actualizaciones.sql` con el mismo molde que ya usa (RLS incluido, sin romper `crm_app`) y refleja el cambio en `schema.prisma`. Respeta que `crm_app` no es dueño de las tablas y respeta RLS.
4. No pierdas los eventos ya mapeados (`EventoCalendario`) de la conexión existente.

### Flujo del usuario
1. Cualquier usuario con acceso al módulo `calendario` entra a `/calendario` y pulsa **Conectar con Google** → OAuth con el `state` incluyendo `orgId` y `userId` (ya lo hace `crearStateCalendario`; verifica que el callback guarde `usuarioCrmId = userId`).
2. Tras conectar, el usuario ve su cuenta de Google y un **selector con sus calendarios** (`GET https://www.googleapis.com/calendar/v3/users/me/calendarList`, solo los que tengan `accessRole` `owner` o `writer`). Por defecto `primary`.
3. Al cambiar de calendario: guarda el nuevo `calendarId`, **resetea `syncToken`** (es por calendario) y marca para resincronización completa; no dejes eventos del calendario anterior huérfanos sin explicar (deja el mapeo anterior como `desvinculado` o documenta qué pasa).
4. **Desconectar**: el usuario puede desconectar su cuenta sin afectar a los demás (revocar el token en Google si es posible; marcar la conexión como `desconectada`; no borrar citas).
5. **Admin**: ve una tabla con todas las conexiones de la org (usuario, cuenta de Google, calendario, estado, última sincronización, último error) y puede pedir reconectar. **No** puede leer ni escribir en calendarios ajenos ni conectar en nombre de otro usuario.

### Sincronización
- Citas → Google: al crear/editar/cancelar, `pushCitaCalendario(citaId)` resuelve la conexión del **usuario responsable de la cita**. Sin conexión activa para ese usuario → no hace nada.
- Google → CRM: `sincronizarCalendario` itera **todas las conexiones activas de la org** (cada una con su propio `syncToken` y su propio reclamo `sincronizandoAt`). El fallo de una conexión no debe detener a las demás: captura el error por conexión y guárdalo en su `ultimoError`.
- Los eventos importados de Google crean la cita asignada al **usuario dueño de esa conexión** (`responsableId`).
- Conserva la lógica de conflicto LWW existente (`resolverConflictoLww`) y las propiedades extendidas (`ambarcrm_cita_id`).
- Una cita no puede terminar duplicada en dos calendarios: si cambia el responsable, el evento se mueve (borrar del calendario del responsable anterior y crear en el nuevo) o se documenta explícitamente la decisión más simple y segura.
- El endpoint manual `POST /api/calendario/sync` debe sincronizar **solo la conexión del usuario actual**; el admin puede sincronizar todas.

### Seguridad
- Tokens de cada usuario cifrados con `cifrarCredencialPago` (ya lo hace). Un usuario nunca debe poder leer los tokens de otro; las respuestas de la API no devuelven tokens.
- Aislamiento por org (RLS) y por usuario: un usuario no puede conectar, desconectar ni cambiar el calendario de otro. Cubre con pruebas.
- Mantén el bloqueo del proveedor `mock` fuera de producción (`mockCalendarioPermitido`).

---

## Pruebas (obligatorias)

Extiende `web/scripts/check-calendario.ts` y/o añade un e2e con base **desechable** (mismo estilo que `test-cfdi-e2e.ts`), sin tocar Google real (usa el proveedor mock). Debe cubrir como mínimo:

1. Dos usuarios de la misma org conectan cuentas distintas; ambas filas coexisten (aunque las dos usen `primary`).
2. Una cita con responsable A se envía solo al calendario de A; con responsable B, al de B; sin responsable o sin conexión, a ninguno y sin error.
3. Sincronizar la org con una conexión fallida no impide sincronizar la otra, y el error queda en la conexión correcta.
4. Cambiar de calendario resetea `syncToken` y fuerza resync completo.
5. Desconectar una conexión no afecta a la otra.
6. Un usuario no puede cambiar/desconectar la conexión de otro; un usuario de otra org no ve ninguna conexión ajena (RLS).
7. La migración se puede aplicar dos veces sin error y no pierde `EventoCalendario` existentes.

Corre además `npm run lint`, `npx tsc --noEmit` y las pruebas existentes de calendario/citas. **No** ejecutes nada contra Google real ni contra la base `5433` de Julio; usa una base desechable propia.

---

## Entrega

Al terminar, **detente** y entrega: lista de archivos tocados, la migración SQL, el criterio usado para filas viejas con `usuarioCrmId = NULL`, la decisión tomada al cambiar el responsable de una cita, salida de las pruebas y cualquier diferencia entre este prompt y lo que encontraste en el código (gana el código).

Pendiente fuera de alcance, para recordarlo en la entrega: con varias cuentas externas de Google la app OAuth debe **publicarse y verificarse** (alcance sensible de Calendar). En modo "Prueba" solo entran usuarios de prueba (máx. 100) y el refresh token caduca a los 7 días.
