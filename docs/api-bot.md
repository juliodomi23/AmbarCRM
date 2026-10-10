# API del bot (n8n ⇄ AmbarCRM)

Base: `https://<tu-crm>/api/v1/accounts/1/conversations/{conversationId}`.
Todas las rutas usan el header `api_access_token: <token del bot>` (o `x-bot-token`).
Las respuestas existentes **solo ganan campos**; ninguno se quitó ni cambió de nombre.

## Reglas comunes

| Situación | Respuesta |
|---|---|
| Token inexistente | `401 {"error":"token inválido"}` |
| Bot atado a otro canal | `403 {"error":"el bot no opera en este canal"}` |
| Bot sin el permiso que exige la ruta | `403 {"error":"…","motivo":"permiso_faltante","permiso":"agendar_cita"}` (queda en la bitácora como `permiso_denegado`) |
| `conversationId` no numérico | `400` |
| Conversación inexistente (o de otra empresa) | `404` |
| Más de `BOT_RATE_LIMIT_MAX` peticiones por token en `BOT_RATE_LIMIT_WINDOW_MS` | `429` + `Retry-After` (segundos) |
| Más de `BOT_AUTH_FAIL_MAX` intentos con token inválido desde una IP en `BOT_AUTH_FAIL_WINDOW_MS` | `429` + `Retry-After` en lugar de `401` |

Límites (en memoria de cada instancia del CRM; con varias instancias, mover el contador a Redis):
- Por token: `BOT_RATE_LIMIT_MAX` (default `300`) por `BOT_RATE_LIMIT_WINDOW_MS` (default `60000`).
- Tokens inválidos por IP: `BOT_AUTH_FAIL_MAX` (default `20`) por `BOT_AUTH_FAIL_WINDOW_MS` (default `300000`).
  Un token **válido** nunca se bloquea por la IP (varios bots comparten la IP del servidor de n8n).
  **Dependencia de proxy:** la IP se toma de `cf-connecting-ip`, luego `x-real-ip` y luego el primer valor de
  `x-forwarded-for`. Esos encabezados son confiables solo si el CRM está detrás de Cloudflare o de un proxy propio
  que los fije o sobrescriba. Si el CRM recibiera tráfico directo, un cliente podría falsificarlos y rotar su IP
  declarada para evadir el límite (el límite por token no depende de la IP). Sin ninguno de los tres, todas las
  peticiones comparten la clave `desconocida`.

## Permisos por bot

Cada bot tiene una lista de permisos (Configuración → Bots → casillas, o `PATCH /api/bots/:id {"permisos": [...]}`).
`conBot(req, "<permiso>", …)` lo comprueba antes de ejecutar la ruta; la comprobación del canal (`botAutorizado`)
sigue aplicando aparte. Un bot **nuevo** nace con `leer_perfil`, `enviar_mensaje`, `notas_internas` y `handoff`.
Los bots que ya existían al migrar conservan **solo lo que sus rutas de producción les permitían**:
`leer_perfil`, `enviar_mensaje`, `notas_internas`, `mover_embudo` y `handoff`. **No** reciben `crear_tarea`,
`agendar_cita`, `cotizar`, `editar_oportunidad`, `ver_productos` ni `gestionar_contactos`: esas rutas no
existían en producción y el admin las activa por cliente (Configuración → Bots → casillas, o
`PATCH /api/bots/:id`; ver [despliegue-bot.md](despliegue-bot.md)). Mientras no estén activas responden
`403 permiso_faltante`.

| Permiso | Rutas |
|---|---|
| `leer_perfil` | `GET …/{id}` |
| `enviar_mensaje` | `POST …/messages` (mensaje al cliente) |
| `notas_internas` | `POST …/messages` con `private: true` |
| `mover_embudo` | `POST …/funnel` |
| `editar_oportunidad` | `PATCH …/opportunity` |
| `crear_tarea` | `POST …/tasks` |
| `handoff` | `POST …/labels` (etiquetas, `bot_on`, `escalado_humano`/`bot_off`) |
| `agendar_cita` | `GET …/appointments`, `GET …/appointments/availability`, `POST` y `PATCH …/appointments` |
| `cotizar` | `GET` y `POST …/quotes`, `POST …/quotes/{quoteId}/send` |
| `ver_productos` | `GET …/products` |
| `gestionar_contactos` | `GET` y `POST …/contacts` |

Orden de las comprobaciones: token (401/429) → permiso (403 `permiso_faltante`) → módulo (404) → conversación
(404) → canal (403).

## Cómo se aísla cada empresa (para quien agregue rutas)

Toda ruta de `/api/v1` entra por `conBot(req, "<permiso>", async (bot) => { … })` (`src/lib/bot-auth.ts`): limita,
autentica, comprueba el permiso y ejecuta el handler dentro de `runWithOrg(bot.orgId)`. Dentro de `conversacionDelBot(bot, id, "modulo")`
valida módulo activo, id y canal. Una ruta que no use `conBot` corre **sin empresa** y RLS le devuelve 0 filas
(las escrituras fallan); `scripts/check-seguridad.ts` falla si una ruta de `/api/v1` no usa `conBot` o vuelve a
fijar el tenant con `setOrg`.

## Rutas

### `GET …/{id}` — estado, mensajes y perfil
Respuesta (los campos marcados ★ son nuevos):
```json
{
  "id": 12, "status": "open", "bot_activo": true, "labels": [], "can_reply": true,
  "meta": { "sender": { "identifier": "5219991234567", "name": "Ana", "phone_number": "+5219991234567" } },
  "mensajes": [ { "id": 801, "message_type": "incoming", "sender": "contact", "tipo": "texto", "content": "Hola", "created_at": "…" } ],
  "perfil": {
    "etiquetas": ["interesado"],
    "campos": { "presupuesto": "20000" },
    "responsable": { "id": 3, "nombre": "Luis" },
    "oportunidad": { "id": 7, "titulo": "Ana", "etapa": "Contactado", "valor": 1500, "moneda": "MXN" }
  }
}
```
- `mensajes` (★): últimos 20, en orden cronológico. **No incluye notas internas.** `sender`: `contact`, `bot` o `agent`.
- `perfil` (★): `responsable` y `oportunidad` pueden ser `null`.
- `labels` sigue siendo solo `["bot_off"]` cuando el bot está apagado.

### `POST …/{id}/messages` — responder
Body: `{ "content": "…", "private": false }`. `private: true` guarda una nota interna sin enviarla.
Errores: `400` contenido vacío · `422` contacto sin teléfono · `502` falla de Meta.

### `POST …/{id}/funnel` — mover etapa
Body: `{ "etapa": "Contactado" }`. `400` si la etapa no existe (incluye `etapas` con las válidas).

### `POST …/{id}/labels` — etiquetas y handoff
Body: `{ "labels": ["interesado"], "motivo": "pide hablar con un asesor" }`

| Etiqueta | Efecto |
|---|---|
| `escalado_humano` o `bot_off` | **Handoff**: apaga el bot, conversación `pendiente`, asigna asesor, nota interna con `motivo`. Si el bot ya estaba apagado no repite nada. |
| `bot_on` | Reactiva el bot. |
| Cualquier otra | Se **agrega** al contacto (máx. 10 por petición, 40 caracteres). No quita etiquetas existentes y **no cambia el estado del bot**. |

Si vienen `bot_on` y una de handoff juntas, gana el handoff.
Respuesta: `{ "payload": [...labels recibidas], "bot_activo": false, "etiquetas_guardadas": ["interesado"], "handoff": { "escalada": true, "responsableId": "3" } }` (`handoff` solo si hubo).

Asesor del handoff: el usuario fijo del bot (`asesorId`, se configura con `PATCH /api/bots/:id {"asesorId": 3}`)
si está activo; si no, round-robin entre usuarios activos de la empresa. Si la conversación ya tiene
responsable, se conserva.

### `POST …/{id}/tasks` — crear tarea (nueva)
Body: `{ "titulo": "Llamar mañana", "descripcion": "…", "venceAt": "2026-12-01T10:00:00Z", "responsableId": 3 }`
Solo `titulo` es obligatorio (máx. 200). Se liga a la oportunidad abierta del contacto (si no tiene, se crea el lead).
Si no mandas `responsableId` se usa el de la conversación o el de la oportunidad.
Respuesta: `{ "id", "titulo", "descripcion", "vence_at", "responsable_id", "oportunidad_id" }`.
Errores: `400` título vacío / fecha inválida / responsable ajeno · `422` no hay embudo configurado.

### `GET …/{id}/appointments`
Próximas citas del contacto (hasta 10). Detalle de agendar, reprogramar y confirmar/cancelar en la sección **Citas**.

## Citas

Requieren el módulo **Citas** activo para la empresa (si no: `404 {"error":"módulo no activo"}`, también
con token de bot). Servicios, profesionales y horarios son los de **Reservas en línea**; la zona, la
anticipación mínima, el paso entre horarios y la ventana de días salen de la configuración de ese módulo
(valores por defecto si no está configurado). Todas las horas `HH:MM` son del negocio.

### `GET …/{id}/appointments/availability?fecha=YYYY-MM-DD[&profesionalId=][&servicioId=]`
```json
{ "fecha": "2026-10-14", "zona": "America/Mexico_City",
  "servicio": { "id": "3", "nombre": "Consulta", "duracionMin": 30 },
  "profesionalId": null,
  "profesionales": [ { "id": "5", "nombre": "Dra. A" } ],
  "horarios": [ { "hora": "09:00", "inicio": "2026-10-14T15:00:00.000Z" } ] }
```
- Sin `servicioId`: si hay un solo servicio activo se usa; si hay varios, `400` con `servicios: [...]`.
- Sin `profesionalId`: unión de los horarios libres de todos los profesionales del servicio.
- Errores: `400` fecha inválida, pasada o fuera de la agenda · `400` profesional que no da el servicio · `404` servicio inexistente.

### `POST …/{id}/appointments` — agendar
Body: `{ "fecha": "2026-10-14", "hora": "09:00", "servicioId": 3, "profesionalId": 5, "notas": "…" }`
(`profesionalId` y `notas` opcionales; sin profesional se asigna el menos ocupado ese día).
Respuesta `201`: `{ "cita": { "id", "titulo", "inicio", "fin", "estado", "doctorId", "servicioId", "especialista", "enlaceGestion" } }`.
Si el contacto ya tiene esa misma cita (reintento de n8n) responde `200` con `"repetida": true`.
Errores: `409` horario ocupado o fuera de horario (el profesional se bloquea con `FOR UPDATE`; de dos peticiones
simultáneas solo una gana) · `400` datos inválidos · `404` servicio inexistente.

### `PATCH …/{id}/appointments`
| Body | Efecto |
|---|---|
| `{ "citaId": 5, "estado": "confirmada" \| "cancelada" }` | Igual que antes. |
| `{ "citaId": 5, "fecha": "2026-10-15", "hora": "10:30" }` | Reprograma con las mismas validaciones; conserva la duración y el profesional, y limpia el recordatorio enviado. |

`409` si el horario está ocupado, si la cita no está `programada`/`confirmada` o si no tiene profesional asignado
(no se puede validar disponibilidad). `400` si mandas fecha/hora y estado juntos. `404` si la cita es de otro contacto.

## Cotizaciones

Requieren el módulo **Cotizaciones** activo. Se crean para el contacto de la conversación, nunca para uno
que venga en el cuerpo.

### `POST …/{id}/quotes` — crear
Body:
```json
{ "partidas": [ { "productoId": 12, "cantidad": 2 },
                { "concepto": "Instalación", "cantidad": 1, "precio": 50, "descuento": 10 } ],
  "descuento": 0, "vigenciaDias": 15, "notas": "…", "condiciones": "…" }
```
`vigencia` (`YYYY-MM-DD`) puede mandarse en lugar de `vigenciaDias` (default 15). Con `productoId` el nombre y el
precio salen del catálogo. IVA, descuentos y total los calcula el servidor con la configuración del módulo.
La cotización cuelga de la oportunidad abierta del contacto (si no tiene, se crea el lead). El bot no puede
activar "convertir en venta".

Respuesta `201`:
```json
{ "id": 41, "folio": "COT-…", "estado": "borrador", "vigencia": "2026-10-29",
  "subtotal": 250, "descuento": 10, "impuestos": 38.4, "total": 278.4,
  "enlace": "https://crm…/cotizacion/<token>", "oportunidad_id": 7, "partidas": [ … ] }
```
`enlace` es `null` si el servidor no tiene `NEXTAUTH_URL`. Errores: `400` datos/descuentos inválidos ·
`404` producto inexistente o inactivo · `422` no hay embudo configurado.

### `POST …/{id}/quotes/{quoteId}/send` — mandar por WhatsApp
Dentro de la ventana de 24 h va como texto libre; fuera de ella, como plantilla aprobada de Meta
(`plantillaCotizacion` en la configuración del módulo). Respuesta `200`:
`{ "id", "folio", "estado": "enviada", "forma": "texto" | "plantilla", "enlace" }`.

| Estado | `motivo` |
|---|---|
| `409` | `ventana_cerrada_sin_plantilla` · `plantilla_no_aprobada` (Meta respondió y no hay una aprobada) · `canal_sin_waba` (el canal no tiene `wabaId`: es configuración del canal, no de la plantilla) · `sin_conversacion_whatsapp` · `canal_sin_plantillas` · `sin_url_publica` · o sin `motivo` si la cotización ya está aceptada/rechazada/vencida |
| `404` | La cotización no es de este contacto |
| `503` | `meta_no_disponible`: WhatsApp no respondió (red o 5xx) al consultar plantillas; reintenta |
| `502` | `meta_rechazo`: Meta rechazó la consulta de plantillas (p. ej. credencial vencida) · o rechazó el envío (sin `motivo`) |

### `GET …/{id}/quotes?estado=`
`{ "cotizaciones": [ { "id", "folio", "estado", "estado_guardado", "vigencia", "subtotal", "descuento", "impuestos", "total", "enlace" } ] }`
Últimas 50 del contacto. `estado` es el efectivo: una `borrador`/`enviada` fuera de vigencia se reporta `vencida`
aunque el cron aún no la haya marcado (`estado_guardado` es el de la base). Filtros: `borrador`, `enviada`,
`aceptada`, `rechazada`, `vencida`.

## Productos, oportunidad y contactos

### `GET …/{id}/products?q=&limit=` — permiso `ver_productos`
Busca productos por nombre, SKU o categoría (sin importar acentos ni mayúsculas); `limit` de 1 a 50 (default 10).
Solo lectura. Requiere el módulo **Productos e inventario** activo (`404` si no).
```json
{ "productos": [ { "id": 12, "nombre": "Lámpara LED", "sku": "LED-1", "categoria": null,
                   "descripcion": "…", "precio": 120, "moneda": "MXN", "unidad": "pieza",
                   "existencia": 5, "apartada": 0, "disponible": true } ],
  "servicios": [ { "id": 3, "nombre": "Consulta", "descripcion": null, "precio": 0, "duracionMin": 30 } ] }
```
- **`existencia` es lo vendible ahora.** El stock del CRM ya descuenta los apartados (crear un apartado baja el
  stock y cancelarlo o vencerlo lo devuelve), así que no se vuelve a restar. `apartada` solo informa cuántas
  piezas están comprometidas en apartados activos.
- `servicios`: servicios agendables (Reservas en línea) cuyo nombre coincide con `q`; solo si el módulo Citas está activo.
- Errores: `400` limit inválido · `404` módulo apagado.

### `PATCH …/{id}/opportunity` — permiso `editar_oportunidad`
Edita la oportunidad **abierta** más reciente del contacto. Body (al menos un campo):
`{ "valor": 2500.50, "responsableId": 7, "embudo": "Postventa", "etapa": "Seguimiento" }`
- `valor`: número no negativo, máx. 2 decimales. `responsableId`: usuario **activo** de la misma empresa, o `null`
  para quitarlo. `embudo` y `etapa` por nombre (sin importar mayúsculas); con `embudo` sin `etapa` pasa a la
  primera etapa de ese embudo; una etapa de tipo ganado/perdido cierra la oportunidad.
- Si la etapa o el embudo no existen no se aplica nada (`400` con `embudos`/`etapas` válidos).
- Cada cambio queda como evento de la oportunidad (`nota` con `payload.campo = "valor"`, `asignacion`,
  `etapa_cambio`) y en la bitácora (`oportunidad_editada`, con antes y después).
- Respuesta: `{ "oportunidad": { id, titulo, valor, moneda, estado, embudo, etapa, responsableId } }`.
- Errores: `400` valor, responsable o etapa inválidos · `404` el contacto no tiene oportunidad abierta (no crea
  una; para eso está `funnel`).

### `GET …/{id}/contacts?phone=` y `POST …/{id}/contacts` — permiso `gestionar_contactos`
- GET: `200 { "encontrado": true|false, "contacto": {…} | null }`. `400` si `phone` no tiene 10 a 15 dígitos.
- POST body: `{ "nombre": "Ana Pérez", "telefono": "+52 55 1234 5678", "correo": "ana@example.com" }` (`correo` opcional).
  `201 { "contacto": {…}, "repetida": false }`; si ya existe, `200 { "contacto": {…}, "repetida": true }` sin crear otro.
- Normalización: solo dígitos; un número mexicano de 10 dígitos (o con `52`/`521`) se guarda como `52` + 10
  dígitos, igual que Reservas en línea. La búsqueda de duplicados usa los últimos 10 dígitos, así que encuentra
  contactos que llegaron de WhatsApp como `521…` o `52…`. Dos peticiones simultáneas con el mismo teléfono crean uno solo.
- Solo ve y crea contactos de la empresa del bot. El contacto nace con fuente `whatsapp`.
- Contacto devuelto: `{ id, nombre, telefono, email, empresa, creado }`.

## Bitácora (ampliada)
`cita_agendada`, `cita_reprogramada`, `cotizacion_creada`, `cotizacion_enviada`, `oportunidad_editada`,
`contacto_creado` y `permiso_denegado` (con el permiso y la ruta). Las consultas (`availability`, `GET quotes`,
`GET appointments`, `products`, `GET contacts`) no se registran.
`auditoria_bot` es de solo agregar: el rol de la app (`crm_app`) puede leer e insertar, no editar ni borrar.

## Bitácora (acciones del bot)

Cada acción del bot que cambia algo se guarda en `auditoria_bot` (empresa, bot, conversación, acción,
entidad, antes, después, fecha): `mover_etapa`, `cita_confirmada`, `cita_cancelada`, `handoff`,
`bot_reactivado`, `etiquetas`, `nota_interna`, `mensaje_enviado`, `tarea_creada`.

## Firma de lo que el CRM manda a n8n

Cada petición al webhook del bot lleva `X-AmbarCRM-Signature: sha256=<hex>`: HMAC-SHA256 del
**cuerpo exacto** con el secreto del bot. El secreto se muestra **una sola vez** al crear el bot o al
regenerarlo (Configuración → Bots); después no se puede leer. Un bot sin secreto se envía sin firma
hasta que generes uno.

### Verificar en n8n
1. En el nodo **Webhook** activa *Options → Raw Body*. Hay que firmar los bytes recibidos: si n8n los
   parsea y vuelve a serializar, la firma puede no coincidir.
2. Guarda el secreto como variable/credencial de n8n (aquí `AMBARCRM_SIGNING_SECRET`). El nodo Code
   necesita `NODE_FUNCTION_ALLOW_BUILTIN=crypto` en el servidor de n8n.
3. Nodo **Code** justo después del Webhook (modo *Run Once for All Items*):

```js
const crypto = require('crypto');
const secreto = $env.AMBARCRM_SIGNING_SECRET;

// Raw Body llega como binario (propiedad "data").
const crudo = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8');
const recibida = $input.first().json.headers['x-ambarcrm-signature'] ?? '';
const esperada = 'sha256=' + crypto.createHmac('sha256', secreto).update(crudo).digest('hex');

const a = Buffer.from(recibida), b = Buffer.from(esperada);
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Firma inválida');

const cuerpo = JSON.parse(crudo);
// Anti-repetición: rechaza mensajes con más de 5 minutos.
if (Math.abs(Date.now() - Date.parse(cuerpo.created_at)) > 5 * 60 * 1000) throw new Error('Mensaje expirado');

return [{ json: cuerpo }];
```
> Este snippet no se probó contra una instancia real de n8n; la firma y el formato sí están cubiertos
> por `prisma/scripts/test-bot-api.ts`. Si `$env` está bloqueado en tu n8n, pega el secreto en una credencial.

## Probar con curl
```bash
CRM=https://crm.ejemplo.com; T=<token-del-bot>; C=<conversationId>; H="api_access_token: $T"
curl -s -H "$H" $CRM/api/v1/accounts/1/conversations/$C
curl -s -H "$H" -H 'Content-Type: application/json' -d '{"content":"Nota","private":true}' $CRM/api/v1/accounts/1/conversations/$C/messages
curl -s -H "$H" -H 'Content-Type: application/json' -d '{"etapa":"Contactado"}' $CRM/api/v1/accounts/1/conversations/$C/funnel
curl -s -H "$H" -H 'Content-Type: application/json' -d '{"labels":["interesado"]}' $CRM/api/v1/accounts/1/conversations/$C/labels
curl -s -H "$H" -H 'Content-Type: application/json' -d '{"labels":["escalado_humano"],"motivo":"pide asesor"}' $CRM/api/v1/accounts/1/conversations/$C/labels
curl -s -H "$H" -H 'Content-Type: application/json' -d '{"titulo":"Llamar mañana","venceAt":"2026-12-01T10:00:00Z"}' $CRM/api/v1/accounts/1/conversations/$C/tasks
curl -s -X PATCH -H "$H" -H 'Content-Type: application/json' -d '{"citaId":5,"estado":"confirmada"}' $CRM/api/v1/accounts/1/conversations/$C/appointments
# citas
curl -s -H "$H" "$CRM/api/v1/accounts/1/conversations/$C/appointments/availability?fecha=2026-10-14&servicioId=3"
curl -s -H "$H" -H 'Content-Type: application/json' -d '{"fecha":"2026-10-14","hora":"09:00","servicioId":3,"profesionalId":5}' $CRM/api/v1/accounts/1/conversations/$C/appointments
curl -s -X PATCH -H "$H" -H 'Content-Type: application/json' -d '{"citaId":5,"fecha":"2026-10-15","hora":"10:30"}' $CRM/api/v1/accounts/1/conversations/$C/appointments
# productos, oportunidad y contactos
curl -s -H "$H" "$CRM/api/v1/accounts/1/conversations/$C/products?q=lampara&limit=5"
curl -s -X PATCH -H "$H" -H 'Content-Type: application/json' -d '{"valor":2500.5,"responsableId":7,"embudo":"Postventa","etapa":"Seguimiento"}' $CRM/api/v1/accounts/1/conversations/$C/opportunity
curl -s -H "$H" "$CRM/api/v1/accounts/1/conversations/$C/contacts?phone=5512345678"
curl -s -H "$H" -H 'Content-Type: application/json' -d '{"nombre":"Ana Pérez","telefono":"+52 55 1234 5678","correo":"ana@example.com"}' $CRM/api/v1/accounts/1/conversations/$C/contacts
# un bot sin el permiso recibe 403 {"motivo":"permiso_faltante","permiso":"ver_productos"}
# cotizaciones
curl -s -H "$H" -H 'Content-Type: application/json' -d '{"partidas":[{"productoId":12,"cantidad":2},{"concepto":"Instalación","cantidad":1,"precio":50}],"vigenciaDias":15}' $CRM/api/v1/accounts/1/conversations/$C/quotes
curl -s -X POST -H "$H" $CRM/api/v1/accounts/1/conversations/$C/quotes/41/send
curl -s -H "$H" "$CRM/api/v1/accounts/1/conversations/$C/quotes?estado=enviada"
```

## Limitaciones conocidas

- **Envío aceptado por Meta pero el registro local falla.** Si Meta acepta el mensaje (o la cotización) y
  después falla el insert en `mensajes` (error de base de datos, `wa_message_id` duplicado), la ruta responde
  `502` aunque el cliente sí recibió el mensaje. Un reintento del bot lo enviaría dos veces. No se corrigió;
  hacerlo requiere guardar el mensaje antes de enviar y marcarlo después.
- **Límites en memoria.** Los contadores (por token y por IP) viven en cada instancia del CRM; con varias
  instancias el tope efectivo se multiplica. Mover el contador a Redis si se escala horizontalmente.
- **Lecturas sin bitácora.** `availability`, `GET quotes` y `GET appointments` no se registran en `auditoria_bot`.
- **Citas sin profesional** no se pueden reprogramar por el bot (no hay con qué validar disponibilidad).
- **Etiquetas y permisos.** `POST …/labels` se gobierna con `handoff` completo: un bot con `handoff` puede
  también guardar etiquetas del contacto. Hay etiquetas con efectos propios (`bot_on`, `escalado_humano`,
  `bot_off`); las demás solo se agregan.
- **Los permisos se leen del bot en cada petición**; un cambio del admin aplica de inmediato.
- **Disponibilidad** usa servicios y horarios de Reservas en línea; sin servicios configurados responde `404`.
- Despliegue y reversión: [despliegue-bot.md](despliegue-bot.md).
