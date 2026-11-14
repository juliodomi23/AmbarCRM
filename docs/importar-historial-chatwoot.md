# Importar historial de Chatwoot (Serénica)

Script de una sola corrida que copia contactos, conversaciones y mensajes desde Chatwoot al CRM.
**No envía nada por WhatsApp** y no dispara bots: solo hace GET a la API de Chatwoot y escribe en la base
con el rol de aplicación (`crm_app`, RLS activo).

- Script: `web/scripts/importar-historial-chatwoot.ts`
- npm: `npm run importar:historial:chatwoot -- <flags>`
- Fuente: API de Chatwoot (cuenta 5), no un export CSV.

## Requisitos

Variables de entorno (en `web/.env.local` o en el entorno de la sesión):

| Variable | Obligatoria | Valor |
|---|---|---|
| `DATABASE_URL` | sí | conexión con el rol `crm_app` (sin SUPERUSER ni BYPASSRLS) |
| `CHATWOOT_URL` | sí | base de Chatwoot, p. ej. `https://chatwoot.serenica.mx` |
| `CHATWOOT_API_TOKEN` | sí | token de acceso de Chatwoot |
| `CHATWOOT_ACCOUNT_ID` | no | por defecto `5` |
| `CHATWOOT_ORG_SLUG` | no | por defecto `serenica-health-center` |
| `CHATWOOT_CANAL_ID` | no | canal de WhatsApp del CRM; si hay uno solo se detecta |
| `CHATWOOT_INBOX_ID` | no | inbox de Chatwoot; si no, usa todos los de WhatsApp |

El script valida que el rol no sea superusuario ni tenga `BYPASSRLS`, y que la base no parezca producción sin
`--confirmo-produccion`. Las variables se pueden poner en `web/.env.local` (el script lo carga con `@next/env`) o
pasarlas en el entorno de la sesión. La corrida real se hace en el servidor donde vive la base, no en local.

## Uso

```bash
# 1. Ensayo: no escribe nada, solo cuenta y dice si el contacto se crearía
npm run importar:historial:chatwoot -- --dry-run

# 2. Prueba con pocas conversaciones (escribe de verdad)
npm run importar:historial:chatwoot -- --limite-conversaciones=5

# 3. Carga completa
npm run importar:historial:chatwoot

# 4. Conciliar contra Chatwoot (no escribe; sale con código 1 si hay diferencias)
npm run importar:historial:chatwoot -- --verificar
```

`--verificar` compara lo que hay hoy en Chatwoot contra lo que hay en el CRM. Úsalo sin
`--limite-conversaciones`: con límite, el resto del histórico aparece como "sobrante". Debe correr con los mismos
flags que la carga (sobre todo `--incluir-privadas`), o reportará diferencias esperadas.

Flags:

| Flag | Efecto |
|---|---|
| `--dry-run` | no escribe; reporta qué haría |
| `--verificar` | cuenta lo esperado vs. lo presente en el CRM |
| `--limite-conversaciones=N` | procesa solo N conversaciones de Chatwoot |
| `--canal-id=N` | fuerza el canal de WhatsApp del CRM |
| `--inbox-id=N` | fuerza un inbox de Chatwoot |
| `--forzar-inbox` | permite usar un inbox que no es de WhatsApp |
| `--incluir-privadas` | importa notas privadas (requiere aprobación de Ricardo) |
| `--confirmo-produccion` | permite correr contra una base cuyo nombre contiene "prod" |
| `--permitir-http` | permite `http://` en `CHATWOOT_URL` (solo red de confianza) |
| `--org-slug=...` | organización destino |

## Qué hace el mapeo

- **Contacto**: busca por `telefono endsWith ultimos10` (mismo criterio que el bot); si no existe, lo crea con
  `fuente = whatsapp` y el teléfono normalizado por `telefonoContacto`.
- **Conversación**: una sola por `contacto + canal` (`@@unique`). Varias conversaciones de Chatwoot del mismo
  teléfono se agrupan en una del CRM. Estado según la conversación de Chatwoot más reciente.
- **Mensajes**: `timestamp` y `created_at` conservan la fecha original de Chatwoot. `direccion` desde
  `message_type` (0 entrante, 1/3 saliente). `tipo` según adjunto o plantilla. Notas privadas se saltan salvo
  `--incluir-privadas`; se marcan `interna = true`.
- **Adjuntos**: no se descargan. Se guarda la URL de Chatwoot en `contenido` como
  `[adjunto Chatwoot] <url>` y `media_url` queda nulo (no hay columna de metadata en `mensajes`).
- **Actividad** (`message_type = 2`) se ignora.

## Idempotencia

Cada mensaje importado usa `wa_message_id = chatwoot-import-<id de Chatwoot>`. Un rerun salta lo que ya existe
(conteo en `duplicados`). Si el mensaje trae `source_id` real y ese ID ya está en el canal, se salta como
`ya_en_canal`. Así un mensaje que llegó por el bot y luego se reimporta no se duplica.

## Verificación SQL

```sql
-- Mensajes importados por canal
SELECT canal_id, count(*)
FROM mensajes
WHERE wa_message_id LIKE 'chatwoot-import-%'
GROUP BY canal_id;

-- Conversaciones tocadas y su rango de fechas
SELECT c.id, ct.nombre, c.ultimo_mensaje_at, count(m.id) AS mensajes
FROM conversaciones c
JOIN contactos ct ON ct.id = c.contacto_id
JOIN mensajes m ON m.conversacion_id = c.id AND m.wa_message_id LIKE 'chatwoot-import-%'
GROUP BY c.id, ct.nombre, c.ultimo_mensaje_at
ORDER BY c.ultimo_mensaje_at DESC;
```

## Reversión

La importación no borra ni modifica mensajes existentes. Para deshacerla:

```sql
DELETE FROM mensajes WHERE wa_message_id LIKE 'chatwoot-import-%';
```

Los contactos y conversaciones creados quedan; bórralos a mano solo si estás seguro (pueden tener citas u otros
datos asociados).

## Límites conocidos

- No importa media ni etiquetas de Chatwoot.
- No crea citas, oportunidades ni notas de seguimiento.
- Una sola conversación del CRM por contacto+canal: el histórico de varias conversaciones de Chatwoot queda en
  una sola, ordenado por fecha.
- El script corre fuera de `next build` (`scripts` está excluido del `tsconfig`); se ejecuta con `tsx`.
