# Prompt para Codex — API del bot: cubrir lo que falta frente a Chatwoot (sin romper lo existente)

Rama: `meta-tech-provider` (ya incluye la lectura de conversaciones, commit f853293). Trabaja en el árbol sin
commitear; no hagas commit ni push. Esta API la consumen flujos de n8n de clientes en producción (SEMBID,
Villafuerte, Exi Chiapas…): **ninguna ruta, parámetro, clave de respuesta ni código de estado existente puede
cambiar**. Todo lo nuevo es aditivo y opt-in.

## Cómo funciona lo que vas a tocar (verificado en el código)

- Toda ruta `/api/v1` entra por `conBot(req, permiso, handler)` (`web/src/lib/bot-auth.ts`): limita, autentica,
  corre en `runWithOrg`, comprueba permiso (403 `permiso_faltante` + bitácora) y luego tú validas módulo,
  conversación y canal (`conversacionDelBot` / `botAutorizado`). Orden: token → permiso → módulo → conversación → canal.
- Permisos: `web/src/lib/bot-permisos.ts` (`PERMISOS_BOT`, `PERMISOS_MINIMOS`, `ETIQUETAS_PERMISO`,
  `permisosValidos`). Un bot nuevo nace con `PERMISOS_MINIMOS`; los bots existentes conservan sus permisos y
  **no reciben los nuevos**: el admin los activa por cliente. Los permisos nuevos NO van en `PERMISOS_MINIMOS`.
  Revisa si hay un CHECK/enum en BD o validación en `/api/bots` y en la pantalla de Configuración → Bots que
  limite los valores; si lo hay, ajústalo (idempotente, en `actualizaciones.sql`).
- Cambios de estado de conversación: la UI usa `actualizarConversacion` (`lib/services/conversacion-estado.ts`):
  bloquea la fila, actualiza y, si cambió el estado, `dispararEvento("conversacion.estado_cambiado", …,
  origen: "agente")` → webhooks salientes (hacia n8n) y automatizaciones. Al cerrar, `PATCH /api/conversaciones/[id]`
  además llama `enviarCsat(id)` (encuesta de satisfacción, una sola vez, si `csatActivo`).
- Contactos: `PATCH /api/contactos/[id]` (sesión de usuario) valida `campos` con `validarCampos` contra
  `campos_personalizados` (entidad `contacto`) y **reemplaza** todo el JSON. `telefono` es único por org
  (`@@unique([orgId, telefono])`). La ruta del bot `…/conversations/:id/contacts` hoy tiene `GET ?phone=` y `POST`
  (permiso `gestionar_contactos`, bitácora con `auditarBot`, nota con `notaDelBot`).
- Mensajes del bot: `POST …/messages` solo manda texto (`responderTexto`, que ya aplica la ventana de 24 h de
  WhatsApp) o nota interna. Los providers (`lib/channel/*`) ya implementan `enviarMedia(destinatario, url, tipo,
  caption, mime, contexto)`; la UI envía archivos por `app/api/mensajes/enviar/route.ts`. Reutiliza esa lógica.
- Asignación: el handoff elige asesor con `elegirAsesor` (`lib/services/bots.ts`) y el Cajero nunca recibe
  conversaciones (`puestoPuedeAtenderConversaciones`). `referenciaPropia("usuario", id)` valida que el usuario
  sea de la org.
- Toda acción del bot deja `auditarBot(...)` y, cuando cambia algo visible, `notaDelBot(...)` (nota interna con 🤖).
- `Conversacion.updatedAt` es `@updatedAt`: cualquier `update` lo mueve (ya documentado en `docs/api-bot.md`).

## Qué construir

Cada punto es independiente; si algo choca con el código real, adapta y repórtalo en vez de forzarlo.

### 1. Cambiar estado — `PATCH …/conversations/:id/status`
- Body `{ "status": "open" | "resolved" | "pending" }` (mismos nombres que expone el GET: `open`↔`abierta`,
  `resolved`↔`cerrada`, `pending`↔`pendiente`). Otro valor → 400.
- Permiso nuevo **`cambiar_estado`**. Responde `{ id, status, status_anterior }`. Si ya estaba en ese estado: 200
  sin escribir, sin evento y sin CSAT (`cambio: false`).
- Usa `actualizarConversacion` (no un `update` directo). Añade a esa función un parámetro opcional `origen`
  (default `"agente"`, para que la UI se comporte igual) y pásale `"bot"` desde aquí. Si lo consideras seguro,
  añade `origen` como campo opcional aditivo en el payload del webhook saliente solo en estas llamadas, para que
  n8n pueda ignorar el evento que él mismo provocó (evita bucles bot→webhook→bot). Documenta el riesgo de bucle.
- Al pasar a `resolved` llama `enviarCsat` igual que la UI. Bitácora `estado_cambiado` y nota `🤖 Cambió el estado
  a …`.
- Al reabrir (`open`) NO reactives el bot ni toques `botActivo`.

### 2. Asignar — `POST …/conversations/:id/assignments`
- Body `{ "assignee_id": <id usuario> }` o `{ "assignee_id": null }` para quitar. Permiso nuevo **`asignar`**.
- Valida con `referenciaPropia("usuario", …)` (400 `responsable inexistente`), usuario `activo` y que
  `puestoPuedeAtenderConversaciones` lo permita (si no, 422). Reutiliza `modificarConversacion`/
  `actualizarConversacion` para escribir `responsableId`. No cambies `botActivo` ni el estado.
- Responde `{ id, responsable: { id, nombre } | null }`. Bitácora `asignada` + nota 🤖.
- No toques `elegirAsesor` ni el round-robin del handoff (usa `auditoria_bot` para decidir el siguiente asesor:
  esta acción debe usar una acción de bitácora **distinta** de la del handoff para no alterar esa rotación;
  verifica en `elegirAsesor` qué `accion` consulta y confírmalo en el reporte).

### 3. Editar contacto — `PATCH …/conversations/:id/contacts`
- Edita **el contacto de esa conversación** (misma ruta que ya existe; agrega el método `PATCH`, permiso nuevo
  **`editar_contacto`**; no cambies `GET` ni `POST`).
- Body admite: `nombre` (≤120), `email`/`correo` (misma validación que el POST), `empresa`, `notas`, `campos`.
  **`telefono` NO se puede cambiar** (400 si viene): es la identidad del canal y es único por org.
- `campos`: **fusiona** con los existentes (la UI reemplaza; el bot no debe borrar datos que no mandó). Valida
  solo las claves enviadas con las definiciones activas (`campos_personalizados`, entidad `contacto`) usando la
  lógica de `validarCampos` sin exigir `obligatorio` sobre claves no enviadas. Claves desconocidas → 400 con la
  lista (hoy `validarCampos` las descarta en silencio: aquí el bot debe enterarse). `null` o `""` en una clave la
  elimina. Si necesitas extender `validarCampos`, hazlo sin cambiar su comportamiento actual.
- Responde `{ contacto: vista(...) }` con la misma forma que el POST, más `campos`. Bitácora `contacto_editado`
  con `antes`/`despues` solo de lo que cambió, y nota 🤖.

### 4. Búsqueda
- `GET …/conversations/:id/contacts?q=texto` (mismo permiso `gestionar_contactos`): busca por nombre, email,
  empresa y teléfono (insensible a mayúsculas, mínimo 2 caracteres, máx. 20 resultados, orden por nombre).
  Responde `{ contactos: [vista…] }`. Si viene `phone`, el comportamiento actual no cambia; `phone` y `q` juntos → 400.
- `GET …/conversations` (listado): añade filtro opcional `contact_id=`. Valida que sea entero positivo y que el
  contacto sea de la org (RLS ya acota). No cambies nada más del listado.

### 5. Adjuntos en `POST …/messages`
- Acepta opcionalmente `attachments: [{ file_type: "image"|"audio"|"video"|"file", data_url: "https://…" }]`
  (formato Chatwoot; máximo 1 adjunto por ahora) y usa `content` como pie. Sin `attachments` el flujo actual
  queda **idéntico** (mismo código, misma respuesta). Mismo permiso `enviar_mensaje`; las notas privadas siguen
  sin adjuntos (400 si mandan `private: true` con adjuntos).
- Solo URLs `https`, sin credenciales en la URL, longitud razonable. Revisa cómo `cloudapi.ts` /
  `meta-mensajeria.ts` usan la URL (si el servidor la descarga, aplica protección contra SSRF: no IP privadas ni
  `localhost`; si solo se la pasa a Meta, documéntalo). Guarda el mensaje con `tipo` y `mediaUrl` correctos
  (ver `serializarMensaje`, que ya los expone) y respeta la ventana de 24 h como lo hace `responderTexto`
  (mira `lib/channel/destinatario.ts`; si solo existe para texto, replica el mismo criterio para media).

### 6. Documentación y Configuración
- `docs/api-bot.md`: nuevas rutas, tabla de permisos (`cambiar_estado`, `asignar`, `editar_contacto`),
  nota de bucles con `conversacion.estado_cambiado`, y la regla de que los bots existentes no reciben los
  permisos nuevos hasta que el admin los active.
- `ETIQUETAS_PERMISO` y la pantalla Configuración → Bots deben mostrar los permisos nuevos sin código extra.
- Actualiza `docs/api-bot.md` → "Limitaciones conocidas" con lo que quede fuera.

## Qué NO hacer (decidido)
- **Marcar como leído** (`noLeidos = 0`): no lo expongas al bot. Dejaría las conversaciones "leídas" y los
  asesores dejarían de ver los chats sin atender.
- Indicador "escribiendo…", posponer (snooze), equipos, SLA, respuestas predefinidas, editar o borrar mensajes.
- Cambiar `telefono` de un contacto, mover una conversación a otro canal, borrar conversaciones o contactos.
- Tocar `elegirAsesor`, el handoff, `labels`, ni los formatos de respuesta actuales.

## Pruebas (obligatorias, en BD desechable)
Levanta un PostgreSQL 16 desechable creado con `schema.sql` → `multi-tenant.sql` → `actualizaciones.sql` (no
`prisma db push`), con rol `crm_app` sin BYPASSRLS, y corre **todo** lo existente antes y después de tus cambios:
`test-bot-api.ts`, `test-aislamiento.ts` y los demás scripts de `web/prisma/scripts` que toquen el bot.
Resultado esperado: lo que pasaba antes sigue pasando, sin tocar aserciones existentes.

Añade a `test-bot-api.ts`:
- Cada permiso nuevo: sin él → 403 `permiso_faltante` (y queda en `auditoria_bot`); con él → 200. Un bot existente
  sin los permisos nuevos conserva exactamente lo que podía hacer.
- Estado: abrir→resolver→reabrir, no-op sin evento, CSAT solo una vez, evento con `origen: "bot"`, bot sin cambios
  en `botActivo`.
- Asignar: usuario de otra org → 400, usuario inactivo/Cajero → 422, `null` quita, y la rotación del handoff sigue
  igual (el siguiente asesor del round-robin no cambia por una asignación manual).
- Contacto: `telefono` → 400, fusión de `campos` sin borrar claves no enviadas, clave desconocida → 400, borrar
  con `null`, aislamiento entre orgs y por `canalId`.
- Búsqueda: `q` corto → 400, `q`+`phone` → 400, resultados solo de la org; `contact_id` ajeno → vacío.
- Adjuntos: sin `attachments` la respuesta es idéntica a la actual; URL `http`, con credenciales o privada → 400;
  nota privada con adjunto → 400; media dentro/fuera de ventana de 24 h.
- Regresión de formas: las claves de respuesta de GET detalle, POST messages, GET/POST contacts y el listado no
  cambiaron.

Termina con `npm run build`, `tsc`, `eslint` y `prisma validate`. Si no puedes levantar la BD, dilo explícitamente
en lugar de afirmar que quedó probado.

## Reglas
- No apliques SQL a demo ni prod; solo prepara scripts si hacen falta (idempotentes, en `actualizaciones.sql`).
  Si no necesitas SQL, no lo agregues.
- Sin commit ni push.
- Reporte final por punto (1–6): qué cambiaste, decisiones (p. ej. el SSRF, la acción de bitácora distinta para
  asignar, el campo `origen`), y qué no pudiste verificar.
