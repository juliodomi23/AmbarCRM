# Prompt para Codex — Correcciones a la lectura de conversaciones de la API del bot

Trabaja sobre la rama actual (`meta-tech-provider`), sobre los cambios sin commitear de la lectura de
conversaciones: `web/src/lib/bot-conversations-read.ts`, `GET /api/v1/accounts/[accountId]/conversations`,
`GET …/conversations/[conversationId]/messages`, `GET …/conversations/[conversationId]` y los SQL/schema de
`updated_at` e índices. Hay que corregir los puntos de abajo. No agregues funcionalidades que no se piden.

## Contexto del CRM (léelo antes de tocar nada)

- Next.js + Prisma + PostgreSQL con RLS por organización. Toda ruta `/api/v1` del bot entra por `conBot()`
  (`web/src/lib/bot-auth.ts`): limita (300/min por token), autentica y corre el handler dentro de
  `runWithOrg(bot.orgId)`. Fuera de ahí RLS devuelve 0 filas.
- Un bot con `canalId` solo opera en ese canal; con `canalId null` opera en todos (`botAutorizado`).
- Los mensajes tienen `interna` (nota interna del equipo), `createdAt` y `timestamp` (hora de WhatsApp).
- `Conversacion.updatedAt` es `@updatedAt`: solo se mueve cuando Prisma actualiza la fila. Hoy toda escritura
  a `conversaciones` pasa por Prisma (ingest, mensajes/enviar, bots, labels, cron). No hay SQL crudo.
- El SQL que debe correr en volúmenes existentes vive en `web/prisma/sql/actualizaciones.sql` (idempotente,
  se aplica en cada deploy). `multi-tenant.sql` es solo para bases nuevas.
- Los clientes de esta API son flujos de n8n de clientes en producción (Villafuerte, etc.). No rompas
  respuestas existentes.

## Correcciones

### 1. Backfill de `updated_at` (crítico)
En `actualizaciones.sql`, `ADD COLUMN updated_at DEFAULT now()` deja todas las conversaciones existentes con
la fecha del despliegue, así que `updated_after` no sirve para el histórico. Justo después del `ALTER TABLE`
agrega un backfill idempotente que solo toque filas aún sin migrar, p. ej.:

```sql
UPDATE conversaciones
SET updated_at = COALESCE(ultimo_mensaje_at, created_at)
WHERE updated_at >= <marca de la migración>;
```

Piensa cómo hacerlo idempotente sin reescribir en cada deploy (por ejemplo, envolver `ADD COLUMN` + `UPDATE`
en un `DO $$ ... IF NOT EXISTS (columna) ... $$` para que el backfill corra una sola vez). Haz el mismo ajuste
en `schema.sql` si aplica (allí la tabla es nueva, no necesita backfill).

### 2. Paginación de `GET …/conversations/:id/messages`
Hoy: sin parámetros devuelve TODO sin límite; con `limit` y sin `before` devuelve los N más antiguos y no hay
forma de avanzar; `before` solo retrocede. Rediseña así:

- Orden siempre cronológico ascendente en la respuesta.
- Parámetros: `limit` (default 100, máx 500), `after=<id de mensaje>` para avanzar (mensajes posteriores en
  orden `(createdAt, id)`) y `before=<id>` para retroceder. `after` y `before` juntos → 400.
- Sin cursor, devuelve los primeros `limit` en orden ascendente (el más antiguo primero).
- Cuando haya más, agrega la cabecera `X-Next-After` con el id del último mensaje devuelto (o un objeto
  `meta` si prefieres, pero entonces mantén compatibilidad: hoy la respuesta es un array plano; no la cambies
  a objeto sin necesidad → usa cabecera).
- Mantén la validación actual de que el cursor pertenezca a la conversación (400 si no).
- Orden por `(createdAt, id)` en ambos sentidos para que use el índice `(conversacion_id, created_at, id)`.

### 3. Notas internas fuera por defecto
`serializarMensaje` ya marca `private`, pero el listado con `include=messages` y `/messages` devuelven las
notas internas del equipo. Filtra `interna = false` por defecto en ambos. Añade el parámetro opcional
`include_private=true` solo si el bot tiene el permiso adecuado (revisa `web/src/lib/bot-permisos.ts` y usa
uno existente; si ninguno encaja, no añadas el parámetro y deja las notas siempre excluidas). Aplica el
mismo criterio a `last_message` del listado y del detalle para que no filtre el texto de una nota.

### 4. Compatibilidad de `labels` en el detalle existente
`GET …/conversations/:id` antes devolvía `labels: []` o `["bot_off"]`. Ahora incluye las etiquetas del
contacto. Esto puede romper flujos de n8n. Decide con este criterio y déjalo documentado:
- Mantén `labels` EXACTAMENTE como antes en el detalle (`[]` o `["bot_off"]`) y expón las etiquetas del
  contacto solo en `perfil.etiquetas` (que ya existe).
- En el listado nuevo sí puede devolver todas las etiquetas en `labels` (es endpoint nuevo), pero entonces
  `serializarConversacion` necesita un parámetro para elegir el comportamiento; no dupliques la función.
- Corrige `docs/api-bot.md`: la línea 8 dice que `labels` incluye las etiquetas del contacto y la 120 dice que
  sigue siendo solo `["bot_off"]`. Deja la documentación consistente con lo que quede implementado.

### 5. `updated_at` y ruido de sincronización
- Marcar chat como leído (`services/chat.ts`, `noLeidos: 0`) y otros cambios internos mueven `updated_at`, lo
  que hace reaparecer conversaciones en una sync incremental sin cambios reales para el bot. Para que
  `updated_at` signifique "cambió algo relevante", pasa `updatedAt` explícito solo donde importa o evita
  tocarlo en esas escrituras (p. ej. `data: { noLeidos: 0, updatedAt: <valor actual> }` es feo; evalúa si basta
  con aceptarlo y documentarlo). Elige la opción más simple que no agregue complejidad y explica la decisión
  en una línea en `docs/api-bot.md`. Si aceptas el ruido, documenta que n8n debe deduplicar por `id`.
- Documenta también que un cambio de etiquetas del contacto NO mueve `updated_at` de la conversación.

### 6. Rendimiento del listado
- Con `include=messages` la consulta sigue trayendo `mensajes take 20` por conversación y luego lo descarta.
  Solo incluye esa relación cuando NO se pide `include=messages`.
- Con `include=messages` y 50 conversaciones se cargan todos los mensajes en memoria. Pon un tope razonable
  de mensajes por conversación en ese modo (p. ej. los últimos 500) y documenta que para el histórico
  completo se usa `/messages` con paginación. Añade `messages_truncated: true` en la conversación cuando se
  recorte.
- `count()` en cada página es caro con filtros de etiqueta en orgs grandes: déjalo, pero acepta
  `per_page` máx 100 como está.

### 7. SQL
- Quita de `multi-tenant.sql` los `CREATE INDEX` sobre `updated_at` que agregaste: dependen de una columna que
  ese archivo no crea y pueden fallar en bases existentes. Los índices ya viven en `actualizaciones.sql`
  y la columna en `schema.sql` para bases nuevas.
- Confirma que `schema.sql` (bases nuevas) crea también los tres índices de `conversaciones`, no solo el de
  `mensajes`; hoy solo se añadió el de mensajes.

### 8. Orden consistente
El detalle usa `timestamp` para `mensajes` (20 recientes) y `/messages` usa `createdAt`. Documenta en
`docs/api-bot.md` cuál orden usa cada uno, o unifica a `createdAt, id` si no rompe el comportamiento del
campo `mensajes` existente (no lo cambies si no estás seguro: ese campo ya lo consumen los bots).

## Pruebas
Actualiza `web/prisma/scripts/test-bot-api.ts` para cubrir:
- Backfill: una conversación vieja conserva `updated_at` ≈ `ultimo_mensaje_at` tras aplicar el SQL.
- `/messages`: primera página, avanzar con `after`/`X-Next-After`, retroceder con `before`, `after`+`before`
  → 400, cursor de otra conversación → 400, `limit` > 500 → 400.
- Notas internas no aparecen en `/messages`, en `include=messages` ni en `last_message`.
- El detalle conserva `labels` como antes (`[]` / `["bot_off"]`).
- Aislamiento entre organizaciones y por `canalId` en las tres rutas.

Para ejecutarlas necesitas Postgres: la base local rechazó la conexión (ECONNREFUSED). Levanta una base
desechable (docker o la que use el repo para pruebas, ver cómo corren los otros scripts de `prisma/scripts`)
y ejecuta las pruebas de verdad. Verifica los índices con `EXPLAIN` sobre una org con datos sintéticos
(≥ 100k conversaciones / 1M mensajes) para `status + updated_after + orderBy updatedAt,id` y para `/messages`.
Si de verdad no puedes levantar una base, dilo explícitamente en el reporte final en lugar de afirmar que
quedó probado.

## Reglas
- No apliques SQL a ninguna base de producción ni de demo. Solo prepara los scripts.
- No hagas commit ni push; deja los cambios en el árbol de trabajo.
- Corre `npm run build`, `tsc` y `prisma validate` al final.
- En el reporte final lista por punto (1–8): qué cambiaste, qué decidiste y qué no pudiste verificar.
