# Prompt para Codex: recortar un clip por permiso para el App Review de Meta

**No toques el código de `web/`, no hagas commits ni push, no subas nada a ningún servicio y no envíes nada a Meta.** Solo `ffmpeg` en local. No modifiques ni borres los videos `-v2` ni los originales: genera archivos nuevos en la carpeta `D:\AmbarRojo\Documentos de ambar rojo\docs\08-productos-internos\AmbarCRM\recortes\` (créala). No escribas contraseñas ni tokens en ningún archivo.

## Material de entrada (ya editados, con subtítulos incrustados)

- `Messenger-App-Review-editado-PiP-v2.mp4` (51.9 s, 1892x978, 30 fps, sin audio)
- `IG-App-Review-editado-PiP-v2.mp4` (48.5 s, 1908x986, 30 fps, sin audio)

## Objetivo

Meta pide en cada formulario de permiso un video. Quiero un clip por permiso, de 20 a 40 s, que muestre solo el tramo donde se usa ese permiso, con su subtítulo, para facilitar el trabajo del revisor. Los subtítulos ya están dentro de los videos; conserva los que caen en cada tramo.

## Recortes (tiempos del video de entrada)

**Messenger** (`Messenger-App-Review-editado-PiP-v2.mp4`):

| Archivo de salida | Tramo(s) | Qué demuestra |
|---|---|---|
| `pages_show_list.mp4` | 0:00 – 0:13 | Conectar con Facebook, login y elección de la página |
| `business_management.mp4` | 0:02 – 0:19 | Login y elección del portafolio empresarial |
| `pages_read_engagement.mp4` | 0:17 – 0:36 | Lista de permisos y validación del token de la página |
| `pages_manage_metadata.mp4` | 0:17 – 0:35 **y** 0:40 – 0:45 (unidos, corte directo) | Suscripción al webhook y llegada del mensaje por el webhook |
| `pages_messaging.mp4` | 0:29 – 0:52 | Canal conectado, mensaje del cliente, respuesta del agente y entrega en Messenger |

**Instagram** (`IG-App-Review-editado-PiP-v2.mp4`):

| Archivo de salida | Tramo | Qué demuestra |
|---|---|---|
| `instagram_business_basic.mp4` | 0:00 – 0:29 | Login del CRM, conexión de la cuenta profesional y nombre de usuario mostrado |
| `instagram_business_manage_messages.mp4` | 0:12 – 0:48 | Conexión, mensaje directo que llega, respuesta y entrega |

Ajusta los puntos de corte hasta el límite de un subtítulo (no cortes a mitad de una frase ni a mitad de una acción visible). Si un tramo queda por debajo de 15 s o por encima de 45 s, dímelo.

## Reglas de edición

- Recodifica (no `-c copy`) para que el corte sea exacto: `libx264`, `-crf 20`, `yuv420p`, 30 fps, `-an`, `-movflags +faststart`. Mantén la resolución original.
- Añade un rótulo al inicio de cada clip, **durante los primeros 2 s**, arriba y centrado: `Permission shown: <nombre_del_permiso>` (Arial, negrita, fondo semitransparente, mismo estilo de los subtítulos). Comprueba que no tape el diálogo de Facebook ni los subtítulos que caen en ese instante.
- Sin transiciones, sin audio, sin efectos. En `pages_manage_metadata.mp4`, el corte directo entre los dos tramos no necesita fundido.
- No cambies el contenido visual (los difuminados y el PiP del teléfono ya están en el v2).

## Verificación obligatoria

- Para cada clip, genera una hoja de contactos (un cuadro cada 2 s) y revísala: no debe aparecer **ninguna contraseña**, ni nombres de páginas de otros clientes, ni notificaciones personales.
- Confirma con `ffprobe` duración, resolución, 30 fps y que no hay pista de audio.
- Comprueba que el primer cuadro de cada clip no esté cortado en medio de una transición y que el rótulo se lee.
- Si algo no se puede verificar, dilo; no afirmes que quedó bien sin haberlo visto.

## Entrega

- Los 7 archivos en `recortes\` con los nombres de las tablas.
- Una tabla final con: archivo, duración, tramo exacto usado y, **para cada clip, los tiempos relativos al clip** en que ocurre cada acción clave (login, permisos, conexión, mensaje que llega, respuesta, entrega). Los necesito para redactar las descripciones de cada formulario.
- No hagas commit de los videos ni de la carpeta `recortes\`.
