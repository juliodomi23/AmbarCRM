# Contrato HTTP para la app móvil

Verificado con `next build --webpack` + `next start` en `http://127.0.0.1:3119`, PostgreSQL local `app_movil_test` y datos sintéticos el 23 de octubre de 2026. La compilación usó fuentes simuladas locales para no consultar Google. En producción, reemplazar la URL base por la del CRM. Los IDs y datos de los ejemplos son de la prueba, no son valores fijos.

Estos endpoints son para la app; los de `/api/v1` son del bot y no deben usarse desde la app. La app envía `Authorization: Bearer <token>` en cada petición protegida. El token dura 7 días; renovarlo con `POST /api/movil/renovar` al abrir la app y guardar el valor nuevo. Los errores de autorización del proxy Bearer son `401 {"error":"no autorizado"}`. Sin Bearer ni cookie, las rutas protegidas conservan el redirect web a `/api/auth/signin`. La cookie web tiene prioridad si se envían ambos. Las rutas públicas se identifican abajo.

## Autenticación y dispositivos

| Método y ruta | Entrada | Respuesta real recortada | Errores relevantes |
|---|---|---|---|
| `POST /api/movil/login` | JSON `{ "org":"movil-a-mvl6d7ix", "email":"a@prueba.test", "password":"…" }`; `org` obligatorio | `200 {"token":"<JWT cifrado>","expiraEn":"2026-10-30T16:19:13.635Z","usuario":{"id":"6","nombre":"Agente A","rol":"admin","puesto":"Agente"},"org":{"slug":"movil-a-mvl6d7ix","nombre":"Móvil A"}}` | 400 cuerpo inválido; 401 `{"error":"credenciales inválidas"}` para contraseña, usuario u org inválidos o limitados. `Cache-Control: no-store`. |
| `POST /api/movil/renovar` | Bearer; cuerpo vacío | 200, misma estructura que login con token y expiración nuevos. Conserva `emitidoAt` original. | 401 token inválido, usuario/org inactivos o contraseña cambiada. |
| `POST /api/movil/logout` | Bearer; JSON opcional `{ "tokenFcm":"…" }` | `200 {"ok":true}`; si se da el token FCM, borra solo el del usuario autenticado. | 400 token FCM inválido; 401 sin sesión válida. El JWT sigue válido hasta su vencimiento: la app debe borrarlo localmente. |
| `POST /api/movil/dispositivo` | Bearer; `{ "tokenFcm":"…", "plataforma":"android" }` (`ios` o `android`) | `200 {"ok":true}` | 400 token vacío, mayor a 4096 caracteres o plataforma inválida; 401 sin sesión válida. Reasigna el token al usuario actual si el dispositivo cambió de cuenta u org. |
| `DELETE /api/movil/dispositivo` | Bearer; `{ "tokenFcm":"…" }` | `200 {"ok":true}` | 400 token inválido; 401 sin sesión válida. Solo borra si pertenece al usuario actual. |

## Marca, bandeja y mensajes

| Método y ruta | Entrada | Respuesta real recortada | Errores relevantes |
|---|---|---|---|
| `GET /api/public/brand?slug=<org>` | Pública; slug de la org | `200 {"nombre":"Ámbar Rojo","logo":null,"colorPrimario":"#D7083F","colorAcento":"#E91E8C","preset":"ambar-rojo"}` en la fixture sin marca propia | Sin slug o con org inactiva/desconocida devuelve la marca por defecto. |
| `GET /api/shell` | Bearer | `200 {"noLeidos":0,"tareasVencidas":0}` | 401 sin autorización. |
| `GET /api/conversaciones` | Bearer; `?q=<texto>` busca en mensajes solo desde 2 caracteres | `200 {"conversaciones":[{"id":"5","contacto":{"id":"5","nombre":"Ana móvil","telefono":"…"},"esPersonal":false,"fijado":false,"responsableId":null,"noLeidos":0,"ultimoMensajeAt":null,"preview":"","estado":"abierta","etiquetas":["VIP-5"],"canalId":"2","canalNombre":"WhatsApp local","canalProveedor":"cloud_api","ultimoEntranteAt":null,"canalActivo":true,"botActivo":true}]}` | 401. Con `q` válido agrega `"esBusqueda":true`. Sin búsqueda devuelve hasta 200, sin paginación. |
| `GET /api/movil/conversaciones?limite=3&cursor=<cursor>&estado=abierta&q=<texto>` | Bearer; parámetros opcionales. `limite` predeterminado 50, máximo 100; `estado`: `abierta`, `pendiente` o `cerrada`. | `200 {"conversaciones":[{"id":"69","contacto":{"id":"69","nombre":"Lectura móvil 0","telefono":"525517927845096470"},"esPersonal":false,"fijado":true,"responsableId":"23","noLeidos":0,"ultimoMensajeAt":"2026-10-23T18:41:49.688Z","preview":"búsqueda móvil","estado":"abierta","etiquetas":["Lectura-1792784509664"],"canalId":null,"canalNombre":"Sin canal","canalProveedor":null,"ultimoEntranteAt":null,"canalActivo":true,"botActivo":true,"updatedAt":"2026-10-23T19:41:49.688Z"}],"siguiente":"<cursor>"}` [recortada]. | 400 estado/cursor inválido; 401. `siguiente:null` al final. |
| `GET /api/conversaciones/:id` | Bearer; ID numérico | `200 {"id":"5","estado":"abierta","botActivo":true,"etiquetas":["VIP-5"],"responsableId":null,"contacto":{"id":"5","nombre":"Ana móvil","telefono":"…","email":null,"empresa":null,"notas":null,"campos":{},"esPersonal":false},"oportunidades":[]}` | 404 `{"error":"no encontrada"}`; 401. |
| `PATCH /api/conversaciones/:id` | Bearer; `{ "responsableId":"6" }`, `{ "estado":"cerrada" }` o `"abierta"`/`"pendiente"`; también acepta `botActivo`, `fijado`, `etiquetas` | `200 {"ok":true}` (cierre comprobado en BD) | 400 `responsable inexistente` o `nada que actualizar`; 401/404. **Usar esta ruta para cerrar y reabrir**: emite `conversacion.estado_cambiado`, webhooks y automatizaciones con origen `agente`; al cerrar dispara CSAT si está activo. |
| `DELETE /api/conversaciones/:id` | Bearer de admin | `{"ok":true}` [forma leída del código; no ejecutado: acción destructiva] | 403 si no es admin; 404 `conversación inexistente`. Borra conversación y mensajes, conserva el contacto. |
| `GET /api/conversaciones/:id/mensajes` | Bearer | `200 {"mensajes":[]}` en conversación vacía | 401. También marca la conversación como leída. Incluye notas con `interna:true` para agentes; **las notas internas nunca se envían al cliente**. |
| `POST /api/mensajes/enviar` | Bearer; ver formatos abajo | Con ventana de 24 h cerrada: `400 {"error":"Pasaron más de 24 h desde el último mensaje del cliente: solo se puede enviar una plantilla aprobada.","ventanaCerrada":true}`. Éxito: `{ "ok":true,"mensaje":{…} }` [forma leída del código; no ejecutado: sale a Meta]. | 400 campos faltantes, canal/destinatario ausente, audio incompatible o ventana cerrada; 404 conversación ajena; 413 archivo grande; 502 fallo del proveedor. |
| `GET /api/meta/templates?canalId=<id>` | Bearer o cookie; cualquier usuario autenticado; canal Cloud API | Con agente y `canalId=0`: `404 {"error":"canal inexistente"}` por HTTP, prueba de que Bearer pasó la autorización. Con canal válido: `{ "plantillas":[…] }` [no ejecutado: consulta Meta]. | 401 sin sesión, 404 canal inexistente. La app filtra plantillas `APPROVED`. |
| `POST /api/meta/templates` | Bearer o cookie; solo admin | Agente: `403 {"error":"requiere admin"}`. Admin con canal ausente: `404 {"error":"canal inexistente"}`. | Crear una plantilla válida sale a Meta; no ejecutado. |

`POST /api/mensajes/enviar` acepta estos cuerpos JSON:

```json
{"conversacionId":"5","texto":"Hola"}
{"conversacionId":"5","texto":"Nota del equipo","interna":true}
{"conversacionId":"5","mediaBase64":"<base64>","mediaMime":"image/jpeg","caption":"Foto"}
{"conversacionId":"5","mediaBase64":"<base64>","mediaMime":"application/pdf","caption":"Documento"}
{"conversacionId":"5","audioBase64":"<base64>","mediaMime":"audio/ogg"}
{"conversacionId":"5","plantilla":{"name":"nombre_aprobado","language":"es_MX","variables":["Ana"],"vistaPrevia":"Hola Ana"}}
```

El archivo viaja como base64 en JSON; el límite implementado es 24 000 000 caracteres de base64 (aprox. 18 MB de bytes, aunque el texto del error dice máximo 16 MB). Audio: `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/aac`, `audio/amr`. Las plantillas son la vía para escribir fuera de la ventana de 24 h. Una nota interna se guarda sin enviar a Meta. Para una conversación de prueba con `ultimoEntranteAt:null`, `botActivo:true` y etiquetas `['VIP-5']`, el intento de texto devolvió el `ventanaCerrada:true` mostrado arriba.

`Conversacion.updatedAt` cambia con cualquier escritura, incluso marcar como leído. La lista móvil lo incluye para que la app pueda detectar cambios y deduplicar por `id`; `GET /api/conversaciones` conserva su respuesta anterior sin ese campo. El orden replica la consulta web: `fijadoAt desc` con nulos al final, luego `ultimoMensajeAt desc` (PostgreSQL pone nulos primero en `desc`) y `id desc` como desempate móvil. El cursor conserva el orden de IDs del primer pedido: los mensajes nuevos no duplican ni saltan conversaciones durante ese recorrido. Para incluir conversaciones nuevas, reiniciar la paginación. El cursor es opaco y puede ser largo; la búsqueda `q` usa `buscarEnMensajes`, devuelve como máximo 30 resultados y siempre `siguiente:null`.

## Notificaciones

La notificación de un mensaje entrante se omite mientras un bot configurado para el canal esté activo en la conversación. Sin bot activo, se avisa al responsable asignado o, si no existe, a los dispositivos de la organización. Un handoff confirmado envía una sola notificación con `tipo: "atencion_humana"` y el texto “Requiere atención humana”; los avisos de mensajes usan `tipo: "mensaje"`. Ambos incluyen `url` y `conversacionId` cuando la ruta apunta a un chat.

## Eventos, archivos y búsqueda

| Método y ruta | Entrada | Respuesta real recortada | Errores relevantes |
|---|---|---|---|
| `GET /api/stream` | Bearer; conexión SSE persistente | `: conectado\n\n` y luego `data: {"conversacion_id":5,"mensaje_id":4,"direccion":"entrante","org_id":7}\n\n` al insertar mensaje sintético. Cada 25 s: `: keepalive\n\n`. | 401 sin sesión. El servidor filtra eventos por `org_id`; el cliente filtra por `conversacion_id`. El SSE no fija `event:`. |
| `GET /api/media/:archivo` | Bearer, cookie web, token bot (`x-bot-token`) o URL firmada (`firma`/`vence`) | 200 binario con `Content-Type` del archivo; los cuatro accesos comprobados por HTTP con archivos sintéticos | 401 sin credenciales; 404 archivo ausente/de otra org. Nunca redirige. |
| `GET /api/buscar?q=<texto>` | Bearer; mínimo 2 caracteres | `200 {"resultados":[]}` sin coincidencias | 401. Busca contactos y conversaciones, hasta 6 de cada tipo; cada resultado tiene `id`, `tipo`, `titulo`, `detalle`, `href`. |

`EventSource` del navegador no permite configurar la cabecera Bearer directamente; Flutter debe usar un cliente SSE/HTTP que sí permita cabeceras y reconectar cuando el stream se cierre.

## Contactos, etiquetas, equipo y operaciones

Las escrituras existentes siguen en sus rutas originales. Las listas para Flutter están bajo `/api/movil/*`, usan Bearer o cookie, devuelven `Cache-Control: no-store` y solo incluyen campos declarados aquí. Sin sesión conservan el redirect web; con Bearer inválido responden `401 {"error":"no autorizado"}`.

| Método y ruta | Entrada | Respuesta real recortada y comportamiento |
|---|---|---|
| `GET /api/movil/usuarios` | Bearer | `200 {"usuarios":[{"id":"14","nombre":"Agente A","rol":"admin","puesto":"Agente","puedeAtender":true},{"id":"18","nombre":"Agente móvil","rol":"agente","puesto":"Cajero","puedeAtender":false}]}` [recortada]. Solo usuarios activos de la org; sin correo, contraseña ni fechas. |
| `GET /api/movil/etiquetas` | Bearer | `200 {"etiquetas":[{"id":"10","nombre":"Lectura-1792784210440","color":"#B45309"}]}` [recortada]. |
| `GET /api/movil/contactos?q=&limite=&cursor=` | Bearer; `q` desde 2 caracteres; `limite` predeterminado/máximo 200 | `200 {"contactos":[{"id":"75","nombre":"Lectura móvil 6","telefono":"525517927845096616","email":null,"empresa":null,"fuente":"manual","responsableId":"23","responsable":"Agente móvil","optOutDifusion":false,"oportunidades":0,"esCliente":false,"campos":{},"etiquetas":[]}],"siguiente":"75"}` con `limite=1`. Orden `createdAt desc, id desc`; pasar `siguiente` como `cursor` hasta recibir `null`. `q` de un carácter no filtra. |
| `GET /api/movil/embudos` | Bearer | `200 {"embudos":[{"id":"12","nombre":"Embudo móvil A","orden":0,"descripcion":null}]}` [recortada]. Solo activos. |
| `GET /api/movil/embudos/:id?q=&pagina=` | Bearer; `pagina` acotada de 1 a 10000; búsqueda como la web | `200 {"id":"12","nombre":"Embudo móvil A","pagina":1,"paginas":1,"limitePorColumna":200,"etapas":[{"id":"17","nombre":"Nuevo","color":"#94A3B8","tipo":"normal","orden":1,"total":0,"tarjetas":[]},{"id":"18","nombre":"Seguimiento","color":"#94A3B8","tipo":"normal","orden":2,"total":1,"tarjetas":[{"id":"6","titulo":"Oportunidad móvil · incluye valor anual","valor":123,"moneda":"MXN","estado":"abierto","createdAt":"2026-10-23T19:41:49.682Z","diasEnEtapa":0,"conversacionId":"69","contacto":{"nombre":"Lectura móvil 0","telefono":"525517927845096470"},"responsable":{"nombre":"Agente móvil"}}]}]}`. 400 ID inválido; 404 embudo inexistente, inactivo o de otra org. |
| `GET /api/movil/tareas?completada=true` | Bearer; filtro opcional `true` o `false` | `200 {"tareas":[{"id":"506","titulo":"Llamar desde móvil","descripcion":null,"venceAt":"2000-01-01T00:00:00.000Z","completada":true,"responsableId":"20","responsable":"Agente móvil","oportunidad":{"id":"3","titulo":"Oportunidad móvil","contacto":"Lectura móvil 0"}}],"truncado":false}` [recortada]. Hasta 500, orden de la web; `truncado:true` si hay más. |

Las pantallas web de chat, contactos, embudos y tareas están disponibles a cualquier usuario autenticado, incluido el puesto Cajero. El Cajero puede leer esas listas, pero `puedeAtender:false` impide ofrecerlo como responsable de una conversación. La prueba HTTP comprobó que una cuenta de otra org no ve los registros y que un embudo ajeno devuelve 404.

| Método y ruta | Entrada | Respuesta y errores del código |
|---|---|---|
| `POST /api/contactos` | `{ "nombre":"Ana", "telefono":"…", "email":"…", "empresa":"…", "fuente":"manual", "responsableId":"6", "notas":"…", "campos":{} }` | `{ "ok":true,"id":"…" }`; 400 falta nombre/campos o responsable inexistente. [No ejecutado: escritura no necesaria para la captura.] |
| `PATCH /api/contactos/:id`; `DELETE /api/contactos/:id` | Campos del contacto; DELETE sin cuerpo | `{ "ok":true }`; valida referencias y campos. [No ejecutado: escritura/borrado.] |
| `POST /api/contactos/:id/etiquetas`; `DELETE /api/contactos/:id/etiquetas` | `{ "etiquetaId":"…" }` | `{ "ok":true }`; 400 si falta `etiquetaId`. [No ejecutado.] |
| `POST /api/etiquetas` | `{ "nombre":"VIP", "color":"#B45309" }` | `{ "ok":true,"id":"…" }` [ejecutado para la conversación de prueba]; 400 falta nombre. |
| `POST /api/usuarios` | Admin; nombre, email, contraseña, rol y puesto | `{ "ok":true,"id":"…" }`; 400 datos/puesto inválidos o contraseña corta; 409 email existente. [No ejecutado.] |
| `PATCH /api/usuarios/:id`; `DELETE /api/usuarios/:id` | Admin; campos del usuario | `{ "ok":true }`; 400 no puedes borrarte. [No ejecutado.] |
| `POST /api/embudos` | Admin; `{ "nombre":"Ventas", "descripcion":"…" }` | `{ "ok":true,"id":"…" }`; crea etapas por defecto; 400 falta nombre. [No ejecutado.] |
| `PATCH /api/embudos/:id`; `DELETE /api/embudos/:id` | Admin | `{ "ok":true }`. [No ejecutado.] |
| `POST /api/oportunidades` | `{ "titulo":"Venta", "valor":100, "embudoId":"…", "etapaId":"…", "contactoId":"…" }` o `contacto:{nombre,telefono}` | `{ "ok":true,"id":"…" }`; 400 faltan campos/contacto o referencia ajena. [No ejecutado.] |
| `PATCH /api/oportunidades/:id`; `DELETE /api/oportunidades/:id` | Campos de la oportunidad; DELETE sin cuerpo | `{ "ok":true }`. [No ejecutado.] |
| `POST /api/oportunidades/mover` | `{ "oportunidadId":"…", "etapaIdDestino":"…", "ordenIds":[…] }` | `{ "ok":true }`; 400 faltan campos; 404 etapa/oportunidad inexistente. [No ejecutado.] |
| `POST /api/tareas` | `{ "titulo":"Llamar", "descripcion":"…", "venceAt":"<ISO>", "responsableId":"…", "oportunidadId":"…" }` | `{ "ok":true,"id":"…" }`; 400 falta título o referencia ajena. [No ejecutado.] |
| `PATCH /api/tareas/:id`; `DELETE /api/tareas/:id` | `completada`, `titulo`, `descripcion`, `venceAt`; DELETE sin cuerpo | `{ "ok":true }`. [No ejecutado.] |
| `POST /api/ia/sugerir` | `{ "conversacionId":"5" }` | `{ "sugerencia":"…" }` [no ejecutado: sale a Anthropic]. Posibles 400 sin clave, falta ID o sin historial; 404 conversación; 429 cuota; 502 proveedor. |

La app debe usar las rutas `/api/movil/*` para listas y las rutas originales para escrituras. La consulta de plantillas funciona con Bearer para agentes; su respuesta con datos de Meta requiere un canal real y no se ejecutó en la prueba local.
