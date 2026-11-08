# Prompt para Codex — Backend: push solo cuando se necesita a una persona

Repo: `D:\AmbarRojo\Documentos de ambar rojo\docs\08-productos-internos\AmbarCRM` (CRM, Next.js + Prisma). Rama nueva
**`feat/push-atencion-humana`** desde `meta-tech-provider` (ya contiene lo móvil y el FCM). Sin push ni merge. Responde en español.

## Antes de lanzarlo (Julio)

- Este prompt toca el servidor del CRM, **no** la app. No se despliega nada hasta que Julio lo revise.
- La clave de servicio de Firebase (`FIREBASE_SERVICE_ACCOUNT_JSON`) la pone Julio en EasyPanel después; Codex no la necesita ni debe pedirla.
- No hay migración de base de datos prevista. Si crees que hace falta una, **detente y repórtalo**.

## Prompt

### Objetivo

Hoy `ingest.ts` manda un push a **todos** los dispositivos de la organización con **cada** mensaje entrante, incluso cuando un chatbot
está atendiendo. Eso es ruido: el equipo solo debe enterarse cuando una persona tiene que intervenir.

Regla de negocio (la define Julio):

1. **Si la conversación está siendo atendida por un bot** (hay un bot activo para el canal **y** `conversacion.botActivo === true`):
   los mensajes entrantes **no** mandan push.
2. **Cuando el bot escala a una persona** (`escalarAHumano(...)` en `web/src/lib/services/bots.ts`, solo cuando `escalada: true`):
   manda **un** push de aviso: título = nombre del contacto, cuerpo = **"Requiere atención humana"**. Sin texto del cliente.
3. **Si la conversación NO tiene bot atendiendo** (no hay bot para el canal, o `botActivo === false` porque ya la tomó una persona o ya
   hubo handoff): cada mensaje entrante manda push como hoy (nombre del contacto + primeros 120 caracteres, o `[tipo]` si no es texto).
4. Un bot que se apaga porque **una persona respondió desde el celular** (`apagarBotPorRespuestaHumana`) **no** manda push.

### Destinatarios

- Si la conversación tiene `responsableId`, el push va **solo a los dispositivos de ese usuario**.
- Si no tiene responsable, va a **todos los dispositivos de la organización**, como hoy.
- Para el handoff, `escalarAHumano` ya devuelve `responsableId`: úsalo.
- Añade un parámetro opcional de usuario a `enviarPushAOrg` / `enviarFcmAOrg` (y a la consulta de `dispositivos_push` bajo RLS) sin romper
  las llamadas existentes (`ingest.ts`, `api/public/tienda/[slug]`). El Web Push del navegador sigue el mismo criterio de **cuándo**
  avisar; si filtrar por usuario no es viable ahí, mantenlo a toda la org y repórtalo.

### Contenido del push

- `data` debe incluir `url` y `conversacionId` (como hoy) y un campo nuevo `tipo`: `"mensaje"` o `"atencion_humana"`, para que la app
  pueda distinguirlos. Mantén el recorte a 150 caracteres del cuerpo y que nunca viaje un token ni un dato fuera de la org.

### Detalles técnicos que debes respetar

- `ingest.ts` hoy dispara el push **antes** de calcular `botParaCanal(canalId)`. Reordena lo mínimo para decidir con esa información sin
  cambiar el resto del flujo (CSAT, lead automático, fuera de horario, bot, bienvenida).
- Los pushes siguen siendo *fire-and-forget* (no frenan el webhook) y las consultas corren dentro de `runWithOrg`/`transaccionTenant`
  (RLS por organización). Un fallo del push **nunca** debe romper la ingesta ni el handoff.
- `escalarAHumano` es idempotente: si el bot ya estaba apagado no escala y **no** manda push. El push va **después** de que la
  transacción termine con `escalada: true`, no dentro de ella.
- No toques el contrato HTTP de `/api/movil/*` ni `API-MOVIL.md` salvo para documentar el campo `tipo` y la regla de cuándo hay push
  (una sección corta de "Notificaciones").

### Pruebas

Sigue el estilo de los `web/scripts/check-*.ts` existentes (BD local desechable; **nunca producción**). Crea `check-push-atencion-humana.ts`
con un `enviarPush` falso que registre las llamadas. Casos:

- sin bot: un entrante manda un push;
- con bot y `botActivo = true`: no manda;
- con bot y `botActivo = false`: manda;
- handoff con `escalada: true`: manda exactamente un push "Requiere atención humana" con `tipo: "atencion_humana"`;
- handoff repetido (ya escalada): no manda otro;
- `apagarBotPorRespuestaHumana`: no manda;
- con `responsableId`: solo ese usuario; sin responsable: toda la org; nunca dispositivos de otra org;
- un error al enviar no rompe la ingesta ni el handoff.

Corre también `check-app-movil.ts`, `check-seguridad.ts` y `check-permisos-modulos.ts` para comprobar que no rompiste nada. Si alguno falla por
un motivo anterior a tu rama, dilo y no lo toques.

### Reglas

- Cambios mínimos y sin dependencias nuevas. Sin tocar migraciones, `.env` ni claves. No imprimas tokens, mensajes ni teléfonos en logs.
- Commits pequeños en Conventional Commits (tipo en inglés, descripción en español, minúsculas, sin punto), por ejemplo
  `feat(push): avisar solo cuando no atiende un bot` y `test(push): cubrir reglas de aviso`.

### Al terminar

Un solo reporte: qué cambió por archivo, el resultado de cada `check-*`, el `git diff --stat` contra `meta-tech-provider`, la lista de
decisiones que Julio deba revisar (por ejemplo, si el Web Push quedó por usuario o por organización) y qué **no** pudiste probar
(FCM real, que necesita la clave de servicio). No hagas push ni merge.
