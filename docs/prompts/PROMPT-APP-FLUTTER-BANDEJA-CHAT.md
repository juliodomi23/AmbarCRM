# Prompt para Codex — App Flutter: bandeja y chat completos (mensajería, multimedia, plantillas y push)

Repo: `D:\AmbarRojo\repos\ambarcrm-app`. Rama **`feat/bandeja-chat`** (ya creada desde `main`, que ya incluye el esqueleto).
Sin push, merge ni PR. Responde y comenta en español.

## Antes de lanzarlo (Julio)

1. Abre Codex dentro de `D:\AmbarRojo\repos\ambarcrm-app` y confirma que la rama activa es `feat/bandeja-chat`.
2. Es un trabajo grande en **6 fases** con commits separados. Si Codex se queda sin contexto, dile "continúa desde la fase N":
   cada fase deja el repo compilando y con pruebas en verde.
3. La org `demo-meta` debe tener 2 o 3 conversaciones con mensajes de varios días, y una con el último entrante de hace más de 24 h.
4. **Push:** el código queda listo pero **dormido** hasta que pases `google-services.json` y `GoogleService-Info.plist` (sin ellos la
   app compila y funciona normal). El servidor tampoco envía push todavía (falta la clave de servicio en EasyPanel).
5. **Respuestas rápidas y mensajes citados:** el backend **no los tiene** (ni modelo ni endpoint). Van como fase 6 condicionada;
   hace falta primero un prompt de backend en el repo del CRM.

## Prompt

Eres un desarrollador Flutter senior con buen ojo de producto. Construye la **bandeja** y el **chat** de AmbarCRM con datos
reales y casi completos. El objetivo no es solo que funcione: debe **sentirse como una app de mensajería moderna** (como WhatsApp o
Telegram): rápida, clara, familiar y cómoda de usar con una mano. Un agente que nunca vio la app debe saber usarla sin explicación.

Lee antes, completos: `AGENTS.md`, `docs/ARQUITECTURA.md`, `CONTRIBUTING.md` y `docs/API-MOVIL.md`.
**Si un endpoint no está en `API-MOVIL.md`, no lo inventes.**

### Alcance y fases

Haz las fases **en orden**, un commit (o varios pequeños) por fase, y al terminar cada una corre `flutter analyze` y `flutter test`.
No avances si la anterior está en rojo.

1. **Base:** bandeja (lista paginada, filtros, búsqueda, no leídos, fijadas, tirar para refrescar), chat de texto (burbujas, fechas,
   horas, estados de envío, notas internas, ventana de 24 h, cerrar/reabrir, asignarme), **tiempo real SSE** en `core/` y ver imágenes.
2. **Adjuntos y reproducción:** enviar foto (galería/cámara), documento y video; ver/abrir/reproducir todo lo recibido.
3. **Notas de voz:** grabar y enviar, y reproducir con barra de progreso.
4. **Plantillas:** enviar plantillas aprobadas (obligatorio con la ventana cerrada).
5. **Push:** registro del dispositivo, notificaciones en primer y segundo plano, toque que abre el chat.
6. **Respuestas rápidas y mensajes citados:** **solo si** `docs/API-MOVIL.md` ya documenta sus endpoints/campos. Si no, no hagas nada
   y repórtalo en una línea. Prohibido inventarlos o simularlos con datos locales.

**Sigue fuera:** contactos/embudos/tareas, insignia de no leídos en la barra inferior, bot on/off, reacciones, caché de mensajes en
disco, mapas embebidos, llamadas.

### Paquetes permitidos para este trabajo (y solo estos)

Fase 2: `image_picker`, `file_picker`, `video_player`, `open_filex`, `url_launcher`, `path_provider`. Fase 3: `record`, `just_audio`.
Fase 5: `firebase_core`, `firebase_messaging`, `flutter_local_notifications`. Instálalos con `flutter pub add` en la fase que los
necesite, comprueba que funcionan con el `minSdk` y la versión de Gradle del proyecto (súbelos al mínimo necesario y repórtalo) y
muestra el bloque de `dependencies` final. Cualquier otro paquete: detente y repórtalo.

### Contrato que debes usar

- `GET /api/movil/conversaciones?limite=&cursor=&estado=&q=` → `{ conversaciones: [...], siguiente }`.
  Elemento: `id, contacto{id,nombre,telefono}, esPersonal, fijado, responsableId, noLeidos, ultimoMensajeAt, preview, estado,
  etiquetas[strings], canalId, canalNombre, canalProveedor, ultimoEntranteAt, canalActivo, botActivo, updatedAt`.
  - El cursor es **opaco y largo**: guárdalo tal cual. Pasa `siguiente` como `cursor` hasta recibir `null`.
  - Con `q` (mínimo 2 caracteres) trae máximo 30 y `siguiente: null`: sin scroll infinito en búsqueda.
  - Para ver conversaciones nuevas hay que **reiniciar** la paginación (pedir sin cursor).
- `GET /api/conversaciones/:id` → `{ id, estado, botActivo, etiquetas, responsableId, contacto{id,nombre,telefono,email,empresa,notas,campos,esPersonal}, oportunidades }`. No trae `ultimoEntranteAt`.
- `GET /api/conversaciones/:id/mensajes` → `{ mensajes: [...] }` **completo y ascendente por `timestamp`**, sin paginar, y **marca la
  conversación como leída**. Mensaje: `id, conversacionId, direccion` (`entrante|saliente`), `tipo`
  (`texto|imagen|audio|video|documento|ubicacion|plantilla`), `contenido`, `mediaUrl`, `mediaMime`, `interna` (nota del equipo; nunca
  se envía al cliente), `esDifusion`, `status` (`pendiente|enviado|entregado|leido|fallido`), `errorDetalle`, `enviadoPor`,
  `timestamp`. Tolera campos extra o nulos.
- `PATCH /api/conversaciones/:id` con `{ "estado": "cerrada"|"abierta"|"pendiente" }` o `{ "responsableId": "<id>" }` → `{ ok: true }`.
- `POST /api/mensajes/enviar`: `{ "conversacionId": "5", "texto": "Hola" }`, o con `"interna": true` para nota → `{ ok: true, mensaje: {...} }`.
  Con la ventana cerrada responde **400** `{ error: "<texto en español>", ventanaCerrada: true }`.
- `GET /api/stream` (SSE, Bearer): `: conectado`, `: keepalive` cada 25 s y `data: {"conversacion_id":5,"mensaje_id":4,"direccion":"entrante","org_id":7}`. Sin `event:`.
- `GET /api/media/:archivo` acepta Bearer y devuelve el binario. **No está confirmado** si `mediaUrl` de los mensajes llega como
  `/api/media/<archivo>`, como URL absoluta o como otro valor. Cuando `tipo == imagen`: si `mediaUrl` es una ruta relativa que
  empieza con `/api/media/`, descárgala con el cliente (con Bearer) y muéstrala; si es otra cosa, muestra la tarjeta de tipo.
  **Reporta qué formato viste** en los datos de prueba y no inventes más rutas. No uses `/api/shell`.

Contrato adicional (fases 2 a 5; la fila exacta está en `docs/API-MOVIL.md`):

- `POST /api/mensajes/enviar` con `mediaBase64` + `mediaMime` + `caption?` (imagen, documento **o video**: el servidor deduce el tipo
  del MIME), `audioBase64` + `mediaMime` (`audio/ogg|mp4|mpeg|aac|amr`; otro formato → 400), o `plantilla`
  `{name, language, variables[], vistaPrevia}`. Tope ≈ 18 MB de archivo (24 000 000 caracteres de base64): valida **antes** de
  codificar y avisa en español. 413 = archivo grande; 502 = fallo del proveedor (muestra el texto legible, no el código).
- `GET /api/meta/templates?canalId=<canalId de la conversación>` → `{ plantillas: [...] }` con la forma de Meta (`name`, `language`,
  `status`, `category`, `components[{type,format,text}]`). Filtra `status == "APPROVED"`. Solo canales Cloud API
  (`canalProveedor`); en otros canales no ofrezcas plantillas. 404 `canal inexistente` → mensaje amable. La forma exacta **no se
  ejecutó contra Meta**: parsea con tolerancia, usa fixtures con la estructura estándar de Meta y repórtalo.
- `POST /api/movil/dispositivo` `{tokenFcm, plataforma:"android"|"ios"}` y `DELETE /api/movil/dispositivo` `{tokenFcm}` (Bearer).
  El push del servidor trae `data: {url, conversacionId?}`.

### Arquitectura (obligatoria)

Respeta `docs/ARQUITECTURA.md`: `ui → state → data (repo) → core/api`, `ChangeNotifier` + `provider`, una funcionalidad no
importa la `ui` ni el `state` de otra, `core/` no importa `features/`, modelos inmutables con `fromJson` a mano, errores como
`ErrorApi`, y `VistaEstado` para cargando/error/vacío. Sin paquetes nuevos ni generadores de código.

```
lib/core/api/eventos_api.dart                  SSE compartido
lib/core/utils/ventana.dart                    ventana de 24 h (pura, con pruebas)
lib/core/utils/formato_fecha.dart              horas y etiquetas de fecha (pura, con pruebas)
lib/features/bandeja/data/   conversacion.dart · bandeja_repo.dart
lib/features/bandeja/state/  bandeja_provider.dart
lib/features/bandeja/ui/     pantalla_bandeja.dart · fila_conversacion.dart
lib/features/chat/data/      mensaje.dart · chat_repo.dart · detalle_conversacion.dart
lib/features/chat/state/     chat_provider.dart
lib/features/chat/ui/        pantalla_chat.dart · burbuja_mensaje.dart · barra_envio.dart · separador_fecha.dart · imagen_mensaje.dart
```

Las fases 2 a 5 añaden archivos dentro de `features/chat/` (adjuntos, grabadora, reproductores, selector de plantillas, repos de
plantillas) y el servicio de push en `core/push/`, con la misma regla de capas; lo de plantillas puede ir en `features/chat/` porque
solo el chat lo usa. Si `features/chat/` pasa de ~15 archivos, divídelo en subcarpetas (`ui/adjuntos`, `ui/voz`, `ui/plantillas`).

`bandeja` y `chat` **no se importan entre sí**: el chat recibe solo el `id` (ruta `/chat/:id`, añadida en `lib/rutas.dart`) y pide
su propio detalle. Conserva el nombre de clase `PantallaBandeja` al reemplazar el placeholder. `BandejaProvider` se crea en la
ruta `/` por encima de `PantallaInicio`; `ChatProvider` por pantalla.

### Diseño del chat — que se sienta como WhatsApp (sin copiar su marca)

Usa los colores del tema de la empresa (`colorScheme` de la marca), **no** el verde de WhatsApp, y no pongas su nombre, logo ni
íconos propios. Sí replica los patrones que la gente ya conoce:

- **Burbujas.** Entrantes a la izquierda con fondo neutro; salientes a la derecha con un tono suave del color primario. Esquinas
  redondeadas (más cerradas del lado del emisor), ancho máximo ~78 % de la pantalla, texto seleccionable, enlaces detectados y
  saltos de línea respetados. Contraste correcto en claro y oscuro.
- **Hora dentro de la burbuja**, abajo a la derecha, pequeña y atenuada (`HH:mm`, 24 h). En los **salientes**, junto a la hora,
  el estado: reloj = `pendiente`, ✓ = `enviado`, ✓✓ gris = `entregado`, ✓✓ en el color de acento = `leido`, ícono rojo = `fallido`.
  Un mensaje `fallido` muestra "No se envió. Toca para reintentar" y el `errorDetalle` legible.
- **Agrupa mensajes consecutivos del mismo emisor** (menos de ~2 minutos entre sí): espacio pequeño entre ellos y la hora
  solo donde corresponde; mayor espacio cuando cambia el emisor.
- **Separadores de fecha** centrados, en píldora: "Hoy", "Ayer", día de la semana (últimos 6 días) o "12 de octubre de 2026".
  Se derivan de `timestamp` en hora local con `intl` (es_MX). Cuida el cambio de día cerca de medianoche.
- **Notas internas** con estilo claramente distinto (fondo ámbar suave, borde, ícono de candado y la etiqueta "Nota interna ·
  solo tu equipo"). Nunca deben confundirse con lo que ve el cliente.
- **Quién respondió:** en los salientes del equipo no hace falta el nombre; no inventes datos que el contrato no trae.
- **Tipos no texto:** imágenes como miniatura redondeada dentro de la burbuja (proporción conservada, cargando con un
  marcador, tocar la abre a pantalla completa con zoom, y si falla muestra la tarjeta); audio, video, documento, ubicación y
  plantilla como tarjeta con ícono y el nombre del tipo ("Nota de voz", "Video", "Documento", "Ubicación", "Plantilla") más
  `contenido`/caption si existe. Las plantillas muestran su texto como burbuja normal.
- **Lista que abre abajo**, en el último mensaje, y se mantiene ahí cuando llega uno nuevo **solo si el usuario ya estaba al
  fondo**. Si subió a leer, no lo muevas: muestra un botón flotante redondo "↓" con el conteo de mensajes nuevos que lo lleva al
  fondo. Al enviar tú un mensaje, baja siempre.
- **Barra de envío** inferior, estilo mensajería: campo de texto redondeado que crece hasta ~5 líneas, botón de enviar circular
  que aparece cuando hay texto (deshabilitado si está vacío o enviando), teclado que **no tapa** la barra ni el último mensaje y
  `SafeArea`. Interruptor **"Nota interna"** visible (candado) que cambia el color de la barra mientras está activo.
- **Ventana de 24 h cerrada:** el campo de texto se reemplaza por un aviso claro en la misma zona: "Pasaron más de 24 h desde el
  último mensaje del cliente. Solo se puede enviar una plantilla aprobada (próximamente)." El interruptor de nota interna sigue
  disponible para escribir notas.
- **Encabezado** del chat: botón atrás, inicial/avatar del contacto, nombre (o teléfono), y debajo una línea corta: estado
  ("Abierta"/"Pendiente"/"Cerrada") y "Asignada a ti" / "Sin asignar" / "Asignada a otra persona". Menú ⋮ con Cerrar/Reabrir (con
  confirmación al cerrar) y Asignarme. Tocar el nombre puede quedar sin acción por ahora.
- **Gestos y detalles:** mantener presionado un mensaje de texto ofrece **Copiar** (con aviso breve). Vibración ligera al enviar
  es opcional. Animación corta y suave al aparecer un mensaje nuevo. Nada de parpadeos al recargar.
- **Optimista:** al enviar, el mensaje aparece al instante como `pendiente`; al responder `ok` se reemplaza por el del servidor;
  si falla queda `fallido` con reintento. Evita duplicados por doble toque.

### Diseño de la bandeja

- Fila estilo mensajería: avatar circular con la inicial, **nombre** en negritas si hay no leídos, **vista previa de una línea**,
  **hora a la derecha** (hoy `HH:mm`; ayer "Ayer"; esta semana el día; antes `dd/MM/yy`), **insignia redonda** con el número de
  no leídos (`99+` como tope), ícono de fijada y estilo atenuado si está cerrada. Los mensajes del propio equipo en la vista
  previa no se prefijan (no tienes el dato). Etiqueta del canal solo si hay más de un canal en la lista.
- **Filtros** en chips arriba: Todas · Abiertas · Pendientes · Cerradas; cambiar de filtro reinicia la paginación.
- **Búsqueda** en la barra superior con *debounce* de 400 ms; menos de 2 caracteres muestra la lista normal; con 2 o más usa `q`
  sin paginar. Resultados con el mismo diseño de fila.
- **Primera página** `limite=30`; pide la siguiente al acercarte al final, sin doble petición, deduplicando por `id`. Un indicador
  discreto al final mientras carga más.
- **Tirar para refrescar** reinicia la paginación. Ante un evento SSE, recarga la primera página con *debounce* de ~600 ms **sin
  parpadeo** (conserva lo mostrado hasta que llegue lo nuevo) y la conversación con actividad sube.
- Estados: cargando (con *skeleton* de filas, no solo un círculo), error con "Reintentar", vacío con un mensaje amable
  ("Aún no hay conversaciones") y vacío por filtro/búsqueda ("Sin resultados").
- Al tocar una fila abre `/chat/:id` y, al volver, refresca la lista (el servidor marcó la lectura).
- Todos los textos en español; nombres vacíos o nulos no deben fallar (usa el teléfono, o "Sin nombre").

### Tiempo real (`core/api/eventos_api.dart`)

- Añade a `ClienteApi` un método para abrir un flujo (`ResponseType.stream`) con el Bearer sin romper lo existente. Un 401 debe
  seguir cerrando sesión por el interceptor.
- `EventosApi` expone `Stream<EventoMensaje>`. Parsea SSE a mano (`data:` y comentarios `:`); aguanta eventos **partidos** en varios
  fragmentos y **varios en uno**; ignora `keepalive`.
- Reconecta con espera creciente (1 s, 2 s, 4 s… tope 30 s). Se **pausa en segundo plano y reconecta al volver**
  (`WidgetsBindingObserver`), y al reconectar emite una señal para que bandeja y chat **recarguen** (se pudo perder eventos).
  Se detiene al cerrar sesión. Nunca imprimas el token ni el contenido de los eventos.
- En el chat, un evento de **esta** conversación recarga los mensajes (con *debounce*); el de otra conversación se ignora.

### Ventana de 24 h (`core/utils/ventana.dart`)

Abierta si existe un mensaje **entrante no interno** y pasaron **menos de 24 horas** desde su `timestamp`. Sin entrantes, está
cerrada. Debe decir lo mismo que `HORAS_VENTANA = 24` del backend (`web/src/lib/meta/ventana.ts`); déjalo como constante con ese
comentario de origen. Si el servidor responde `ventanaCerrada: true`, muestra su texto y marca la ventana como cerrada.

### Fase 2 · Adjuntos y reproducción

- **Botón de adjuntar** (clip) en la barra de envío, que abre una hoja inferior con: Cámara, Galería, Documento (y Video desde la
  galería). Pide el permiso **en el momento de usarlo** con un texto de motivo en español; si lo niegan, explica cómo activarlo.
- **Fotos:** `image_picker` con `imageQuality` ~80 y `maxWidth` ~1600 para no pasar el tope ni gastar datos. Vista previa a pantalla
  completa con campo de **pie de foto** y botón enviar antes de mandar. Videos y documentos: vista previa con nombre/tamaño y pie.
- **Envío optimista:** la burbuja aparece al instante con miniatura local, indicador de progreso y estado `pendiente`; si falla, queda
  `fallido` con "Toca para reintentar" (el archivo se conserva en memoria/temporales hasta enviarse o descartarse).
- **Recibidos y enviados, ya reproducibles:** imágenes (miniatura → pantalla completa con zoom); **video** (miniatura con ▶ → reproductor
  `video_player` con controles); **documento** (tarjeta con ícono por tipo, nombre y tamaño si lo hay → descargar a temporales con el
  Bearer y abrir con `open_filex`); **ubicación** (tarjeta con coordenadas/dirección de `contenido` y botón "Abrir en mapas" con
  `url_launcher`); enlaces del texto se abren con `url_launcher`. Todo archivo se descarga con el cliente (Bearer) desde `/api/media/...`
  y se guarda en la carpeta temporal para no volver a bajarlo; limpia esa carpeta al cerrar sesión.
- Si `mediaUrl` no es una ruta `/api/media/...` (ver nota de arriba), muestra la tarjeta de tipo y **repórtalo**; no inventes rutas.
- Permisos nativos mínimos: cámara (`NSCameraUsageDescription`, `CAMERA` solo si el plugin lo exige), fotos (`NSPhotoLibraryUsageDescription`)
  con textos en español. Sin `READ_MEDIA_*`.

### Fase 3 · Notas de voz

- **Micrófono** en la barra de envío cuando el campo está vacío (se cambia por "enviar" al escribir), como en una app de mensajería:
  **mantener presionado para grabar**, soltar envía, **deslizar a la izquierda cancela**, contador `m:ss` en vivo y vibración leve al
  empezar. Opcional: deslizar hacia arriba para bloquear la grabación.
- Graba con `record` en **AAC/m4a** y envía `audioBase64` con `mediaMime: "audio/mp4"`. Mínimo 1 s (menos se descarta con aviso breve),
  máximo razonable (por ejemplo 5 min). Pide el permiso del micrófono al primer uso, con motivo en español (`NSMicrophoneUsageDescription`,
  `RECORD_AUDIO`).
- **Reproductor** (`just_audio`) en burbuja: ▶/⏸, barra de progreso con arrastre, duración, y velocidad 1× / 1.5× / 2×. Solo un audio suena
  a la vez; se detiene al salir del chat o al ir a segundo plano. Funciona para entrantes y salientes.

### Fase 4 · Plantillas

- Botón "Plantillas" en la barra (y como acción principal del aviso cuando la **ventana está cerrada**, que ya no dice "próximamente").
- Pantalla/hoja con la lista de plantillas **aprobadas** del canal de la conversación (cargando, error con reintento, vacío "Este canal
  no tiene plantillas aprobadas"), con búsqueda por nombre y vista previa del texto del cuerpo.
- Al elegir una: si el cuerpo tiene variables (`{{1}}`, `{{2}}`…) pide cada una (precarga `{{1}}` con el nombre del contacto si se puede),
  muestra la **vista previa ya sustituida** y envía `plantilla:{name,language,variables,vistaPrevia}`. Validación: ninguna variable vacía.
- Tras enviarla aparece como burbuja normal (tipo `plantilla`/texto) y la ventana sigue cerrada hasta que el cliente responda.
- Si la conversación no es de un canal Cloud API, oculta el botón y explica por qué en el aviso.

### Fase 5 · Notificaciones push (dormidas hasta tener los archivos de Firebase)

- Integra `firebase_core` y `firebase_messaging` + `flutter_local_notifications`. **La app debe compilar y funcionar sin
  `google-services.json` ni `GoogleService-Info.plist`** (están en `.gitignore`; Julio los pasa aparte):
  - Android: en `android/app/build.gradle.kts` aplica el plugin `com.google.gms.google-services` **solo si** existe
    `android/app/google-services.json` (condicional), y declara el classpath sin romper el build cuando falta.
  - Dart: `Firebase.initializeApp()` dentro de `try/catch`; si falla, el push queda desactivado en silencio (sin crash, sin log de datos).
  - No generes ni subas `firebase_options.dart` ni los archivos de Firebase.
- `core/push/` (o `features/notificaciones/` si lo ves más limpio; respeta `ARQUITECTURA.md`): servicio con `iniciar()`,
  `registrar()` y `desregistrar()`.
  - Tras **login o sesión restaurada**, pide el permiso de notificaciones (Android 13+ `POST_NOTIFICATIONS`, iOS) en un momento
    razonable (primera vez que entra a la bandeja) con un texto previo en español que explique para qué; si lo niegan, no insistas.
  - Obtén el token FCM y envíalo con `POST /api/movil/dispositivo`; reintenta al cambiar (`onTokenRefresh`) y al volver a abrir.
  - **Cerrar sesión:** `DELETE /api/movil/dispositivo` con el token **antes** de borrar la sesión (mejor esfuerzo; si falla la red,
    igual se cierra) y borra el token local de Firebase. Nunca imprimas el token.
- **Primer plano:** muestra una notificación local (canal Android "Mensajes") salvo si el usuario ya está viendo **ese** chat.
  **Segundo plano/cerrada:** la muestra el sistema; maneja el *background handler* de `firebase_messaging` con una función de nivel
  superior.
- **Toque en la notificación** (app abierta, en segundo plano o cerrada): navega a `/chat/<conversacionId>` tomado de `data`. Si no hay
  `conversacionId`, abre la bandeja. Sin sesión, guarda el destino y llévalo tras el login.
- Datos que llegan: `data: {url, conversacionId?}` y `notification: {title, body}`. Parsea con tolerancia.
- Nativo permitido solo aquí: `POST_NOTIFICATIONS` en el manifiesto y el canal de notificación; en iOS deja documentado en el reporte lo
  que debe activarse en Xcode (Push Notifications, Background Modes → Remote notifications) y la llave APNs en Firebase, porque **no
  puedes compilar iOS en Windows**: no lo marques como hecho.

### Fase 6 · Respuestas rápidas y mensajes citados (condicionada)

Antes de tocar nada, busca en `docs/API-MOVIL.md` una ruta/campo para **respuestas rápidas** (atajos de texto de la empresa) y para
**citar un mensaje** (campo de respuesta en `mensajes` o en `enviar`). Si **no existen**, salta la fase: reporta "Fase 6 omitida: el
backend no expone X" y no escribas código ni modelos para ellos. Si existen:

- **Respuestas rápidas:** escribir `/` en la barra abre una lista filtrable de atajos; al elegir uno rellena el campo (editable antes
  de enviar). Cargando/error/vacío.
- **Mensajes citados:** deslizar un mensaje a la derecha (o menú de mantener presionado → Responder) pone una tarjeta de cita sobre la
  barra con su autor y fragmento; el envío incluye la referencia según el contrato; en la burbuja se ve el bloque citado y tocarlo
  salta al mensaje original si está cargado.

### Pruebas (`flutter test`, sin red)

Usa un `ClienteApi`/`Dio` falso con los JSON reales del contrato como fixtures; nada sale a internet.
- **Modelos:** `Conversacion` y `Mensaje` desde JSON real; nulos y campos extra no rompen.
- **Formato de fechas:** hoy / ayer / día / fecha larga, medianoche y zona horaria local, `HH:mm` de 24 h.
- **Agrupación:** mensajes del mismo emisor a menos de 2 min se agrupan; separadores de fecha correctos entre días.
- **SSE:** evento partido, varios en un fragmento, comentarios y `keepalive` ignorados, reconexión con espera creciente y tope
  (espera inyectable), cancelación limpia.
- **`ventana.dart`:** 23:59 h, 24:00 h, sin entrantes, notas internas y salientes que no cuentan.
- **`BandejaProvider`:** primera página; cursor sin duplicados ni doble petición; filtro reinicia; búsqueda de 1 carácter no
  filtra y de 2 sí y sin cursor; refrescar; evento SSE recarga con *debounce*; error de red conserva lo mostrado.
- **`ChatProvider`:** carga en paralelo; envío optimista éxito y fallo con reintento y sin duplicar; ventana cerrada deshabilita el
  texto pero permite notas; respuesta `ventanaCerrada`; cerrar/reabrir/asignarme; evento de otra conversación se ignora; el botón
  "↓" y su conteo cuando el usuario no está al fondo.
- **Widgets:** fila con no leídos; los tres estados de la bandeja; burbuja entrante vs saliente con hora y las marcas de estado;
  nota interna distinta; barra deshabilitada con la ventana cerrada; teclado/barra sin overflow en pantalla pequeña.
- **Fase 2:** validación de tamaño (rechaza > tope antes de codificar); armado del JSON de adjunto (`mediaBase64`, `mediaMime`, `caption`);
  envío optimista con progreso, fallo y reintento sin duplicar; tarjetas por tipo (imagen, video, documento, ubicación); descarga
  con Bearer y reutilización de la caché temporal; limpieza al cerrar sesión.
- **Fase 3:** estados de la grabación (grabando → enviar / cancelar / demasiado corta); JSON con `audioBase64` y `audio/mp4`; el
  reproductor solo reproduce uno a la vez (con un reproductor falso inyectado).
- **Fase 4:** filtrado de `APPROVED`; extracción de variables `{{n}}`; vista previa sustituida; no envía con variables vacías;
  oculta plantillas en canales no Cloud API; JSON `plantilla` correcto; errores 404/502 con mensaje legible.
- **Fase 5 (con Firebase falso/inyectado):** sin Firebase la app no falla; registra el token tras login; `onTokenRefresh` re-registra;
  cerrar sesión llama a `DELETE` antes de borrar la sesión; toque en notificación navega a `/chat/<id>`; sin `conversacionId` va a la
  bandeja; destino pendiente tras login; no se muestra la local si ese chat está abierto.
- **Fase 6:** solo si se implementó.

### Verificación

`flutter analyze` sin observaciones, `flutter test` en verde y `flutter build apk --debug`. `grep`: `core/` no importa `features/`,
ninguna `ui` importa `dio`, y `bandeja/` y `chat/` no se importan entre sí. Si puedes abrir un emulador, confirma que arranca y
revisa la pantalla en tamaño pequeño y en modo oscuro. El flujo real contra `demo-meta` lo prueba Julio.
**No marques como probado lo que no ejecutaste.**

### Reglas

- Solo los paquetes de la lista y sin generadores de código. Configuración nativa **solo** lo indicado por fase (permisos con texto en
  español, `POST_NOTIFICATIONS`, `google-services` condicional, `minSdk` si un paquete lo exige); cada cambio nativo se lista en el reporte.
- Permisos (cámara, fotos, micrófono, notificaciones) siempre **en el momento de usarlos**, con motivo en español. Sin `READ_MEDIA_*`.
- Todo archivo que baje o suba pasa por `ClienteApi`; nada de `dio` en `ui`. Los temporales se borran al cerrar sesión.
- No toques `docs/`, `CONTRIBUTING.md`, `.githooks/`, `.github/`, `.gitignore`. Puedes añadir **una línea** a `AGENTS.md` y a
  `docs/ARQUITECTURA.md` solo para registrar `eventos_api.dart` y `formato_fecha.dart` en el árbol.
- Nunca imprimas tokens, textos de mensajes ni teléfonos en logs. Prueba solo contra `demo-meta`, jamás producción.
- Commits pequeños en **Conventional Commits** (tipo en inglés, descripción en español, minúsculas, sin punto): por ejemplo
  `feat(eventos): ...`, `feat(bandeja): ...`, `feat(chat): ...`, `test(chat): ...`. Hook activo, sin `--no-verify`.
- Cierra todo emulador o proceso que abras.

### Al terminar

Un solo reporte, **por fase**: qué hiciste, resultados de `analyze`/`test`/`build` (y número de pruebas), los `grep`, el `git diff --stat`
contra `main`, el árbol nuevo de `lib/`, el bloque final de `dependencies`, cada cambio nativo con su archivo, **qué formato tenía
`mediaUrl` en los datos que viste** (o que no pudiste verlo), si la fase 6 se omitió y por qué, y una lista explícita de lo que **no**
ejecutaste ni pudiste verificar (cámara, micrófono, reproducción, push real, iOS) para que Julio lo pruebe en un celular. Incluye las
decisiones que deba revisar (por ejemplo, que el endpoint de mensajes devuelve todo el historial sin paginar). No hagas push ni merge.
