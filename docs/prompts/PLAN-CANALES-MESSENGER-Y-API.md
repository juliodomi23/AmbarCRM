# Plan — AmbarCRM: canal Messenger + canal API externo (compatible Chatwoot)

Rama base: `modulos-fase-2` (193 commits adelante de `meta-tech-provider`, 0 detrás). Crear rama nueva: `canales-messenger-api`.
Reglas del repo que aplican: ver `PLAN-CIERRE-FASE-2.md` (BD de pruebas desechable en :55450, nunca `ambarcrm-db` ni producción; commit por paso; RLS + GRANT + `test-aislamiento.ts` en toda tabla nueva; `schema.sql` + `multi-tenant.sql` + `actualizaciones.sql`).

## Objetivo
1. SEMBID usa su bot de n8n a través de AmbarCRM (en vez de Chatwoot) sin reescribir los workflows.
2. AmbarCRM recibe y contesta **Messenger** y **cualquier sistema externo por API**, con el mismo contrato de bot que ya existe en `/api/v1`.

## Lo que ya hay (verificado en la rama)
- Contrato de bot en `web/src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/…` (messages, labels, funnel, opportunity, tasks, appointments, quotes, products, contacts), con `conBot`, permisos por bot, HMAC, bitácora y rate limit. Documentado en `docs/api-bot.md`.
- Abstracción `ChannelProvider` en `web/src/lib/channel/` pero **solo `cloud_api`** (`index.ts` lanza error con otro proveedor; enum SQL `proveedor_canal` = `('cloud_api')`).

## Qué lo bloquea hoy (lo que hay que cambiar)
| Bloqueo | Dónde |
|---|---|
| El contacto se identifica solo por `telefono` (UNIQUE) y `messages/route.ts` responde 422 sin teléfono | `schema.sql` contactos, `messages/route.ts` |
| `ChannelProvider.nombre` es literal `"cloud_api"` y `enviarTexto(telefono, …)` | `lib/channel/types.ts` |
| `conv.canal.proveedor !== "cloud_api"` → 400 | `messages/route.ts` |
| Webhooks de entrada solo de WhatsApp (`/api/wa/*`, `/api/meta/webhook`) | `app/api/` |

## Fase 0 — Auditar SEMBID contra la API del CRM (antes de escribir código)
Entregable: tabla "llamada de SEMBID → endpoint de AmbarCRM → existe sí/no".
- Webhook de entrada que lee `Filtrar Mensajes` / `Datos de Entrada`: `body.event === 'message_created'`, `body.message_type === 'incoming'`, `body.conversation.messages[0].sender_type === 'Contact'`, `conversation.id`, `conversation.labels`, `sender.name`, `sender.phone_number`, `account.id`, `inbox.id`, `attachments[0].file_type` y datos de ubicación.
- Llamadas que hace el workflow: POST messages (público y `private:true`), labels (`escalado_humano`, `bot_off`), cambio de status de conversación (`escalar_a_humano` abre la conversación), lectura de conversación/labels, descarga de adjuntos.
- Nota heredada: en Chatwoot el token de bot da 401 en labels/status y por eso hay dos credenciales. En AmbarCRM un solo token de bot con permiso `handoff` debería bastar; confirmar y simplificar.
- Salida: lista de huecos. Solo se implementa lo que falte.

## Fase 1 — Modelo de datos y capa de canal (base de todo)
1. `proveedor_canal` += `'messenger'`, `'api'` (migración idempotente en `actualizaciones.sql`, mismo cuidado que el `ALTER TYPE` fuera de transacción).
2. Contacto con identidad por canal: columna nueva `identificador_externo` + índice UNIQUE `(canal_id, identificador_externo)` (o tabla `contacto_identidades`); `telefono` sigue opcional. RLS + GRANT + test de aislamiento.
3. `ChannelProvider`: `nombre` pasa a unión de proveedores; `enviarTexto(destinatario, texto)` (el destinatario es teléfono, PSID o id externo según canal). `getProvider` despacha por proveedor.
4. `messages/route.ts`: resolver destinatario por canal (hoy exige teléfono y `cloud_api`).
5. Pruebas de concurrencia/idempotencia: `waMessageId` genérico (id externo del proveedor) con UNIQUE por canal.

## Fase 2 — Canal API externo (más barato; sirve para SEMBID y para cualquier sistema)
- Entrada: `POST /api/canal-api/{canalId}/mensajes` con `x-api-key` propio del canal. Body: `{ contacto: {id_externo, nombre, telefono?}, mensaje: {id, tipo, contenido, media_url?}, timestamp }`. Idempotente por `mensaje.id`.
- Salida: cada mensaje saliente del CRM (de bot o de asesor) se manda por `POST` firmado (HMAC con timestamp, igual que el bot V2) a la `webhook_url` del canal. Reintentos con tope y registro del resultado.
- Ingesta reutiliza el pipeline existente (contacto → conversación → bots → automatizaciones) para no duplicar lógica.
- Doc corta en `docs/canal-api.md` con ejemplos curl.

## Fase 3 — Canal Messenger
- Webhook `GET/POST /api/messenger/webhook`: verificación `hub.challenge` y firma `X-Hub-Signature-256` con el app secret. Mapeo `page_id` → canal (RLS: resolver org sin sesión, igual que el webhook de WhatsApp).
- Envío por Graph API (`/me/messages` con page access token por canal, cifrado como `cloud_api`). Ventana de 24 h; fuera de ella solo etiqueta `HUMAN_AGENT` (7 días) o se marca "no se puede responder" en la UI.
- Conexión: pegar page access token + page id en Configuración → Canales (como `ConexionManual.tsx`). Login de Facebook / Embedded flow queda fuera del alcance.
- Adjuntos entrantes (imagen/audio) a `media` y hacia el bot con la URL protegida existente.
- ⚠️ **Meta App Review:** sin `pages_messaging` aprobado, solo reciben mensajes cuentas con rol en la app (admin/tester). Para SEMBID basta agregar a Edwin como tester/admin de la página; para vender a terceros hace falta el review. Revisar `META-APP-REVIEW.md` por si ya se puede ampliar.

## Fase 4 — UI mínima
Selector de canal al crear (WhatsApp / Messenger / API), ícono del canal en la bandeja y avisos de ventana 24 h. Nada más.

## Fase 5 — Migrar SEMBID (solo cuando 1-3 estén verdes en pruebas)
1. Crear la empresa SEMBID en el CRM + canal (WhatsApp del 961 268 0529 y Messenger de su página).
2. Crear el bot con permisos `enviar_mensaje`, `notas_internas`, `handoff` y el webhook del `SEMBID - Agente Principal`.
3. En el workflow: cambiar `Configuracion` (`cfg_serverUrl`, token, `cfg_inboxId`). Idealmente **nada más**; lo que no encaje, parche en un solo nodo.
4. Probar con conversaciones reales antes de apagar Chatwoot para SEMBID. Chatwoot queda como marcha atrás.

## Fuera de alcance (a propósito)
Instagram DM, Telegram, difusión por Messenger, app móvil, el review de Tech Provider (sigue su camino aparte).

## Cómo repartir a Codex
Un prompt por fase, mismo formato que los `PROMPT-*.md` del repo, **commit por paso** y parar al final de cada fase (🛑) para revisión. Orden: Fase 0 → 1 → 2 → 3 → 4. Fase 5 no es de Codex.

## Pendientes de SEMBID que NO dependen de esto
Etiquetas de la conv. 14, foto real, aviso a Edwin, descuento por efectivo, llaves de BILLDU, plantilla Meta del seg2. Ver `docs/03-clientes/prospectos/SEMBID - prospecto/bot-sembid.md`.
