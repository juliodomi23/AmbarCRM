# Prompt para Codex: corregir el video de Messenger (v3) y regenerar sus 5 clips

**No toques el código de `web/`, no hagas commits ni push, no subas nada a ningún servicio y no envíes nada a Meta.** Solo `ffmpeg` en local. No modifiques ni borres los archivos `-v2`, los clips actuales de `recortes\` ni los originales: escribe archivos nuevos. No escribas contraseñas ni tokens en ningún archivo.

Carpeta del proyecto: `D:\AmbarRojo\Documentos de ambar rojo\docs\08-productos-internos\AmbarCRM\`.

## Qué cambia

Solo el video de **Messenger**. El de Instagram y sus 2 clips no se tocan.

1. **Subtítulo inexacto.** El subtítulo 2 dice «2. Facebook Login opens in a secure window and the admin signs in.» pero en la grabación Facebook no pide correo ni contraseña (la sesión ya estaba abierta). Cámbialo por: `2. Facebook Login opens in a secure window.` (en `video-edicion\subsm-v2.srt`; guarda la versión nueva como `subsm-v3.srt`). No cambies los demás subtítulos ni el rótulo superior `subsm-v2-top.ass`.
2. **Difuminar el nombre del perfil de Facebook.** En el diálogo de Facebook aparece el nombre del perfil con el que se conecta («ChatBots Tuxtla»), por ejemplo en «Se ha conectado ChatBots Tuxtla a AmbarCRM» (alrededor de 0:29–0:33 del `-v2`, que corresponde a un cuadro del tramo `src 20.5–36.0`) y, si sale, en «¿Continuar como …?». Localiza **todos** los cuadros donde aparezca el nombre (revisa cada 0.25 s los tramos donde el diálogo de Facebook está visible y confírmalo con cuadros) y difumina **solo la palabra del nombre**, con `boxblur` como los demás difuminados de `graphm-v2.txt` (`crop` + `boxblur=14:3` + `overlay` con `enable='between(t,a,b)'`), con el rectángulo mínimo que cubra el nombre.
   - No difumines «AmbarCRM», la lista de permisos, los botones ni el nombre «Ámbar Rojo Studios».
   - Añade los nuevos difuminados a una copia de la receta: `graphm-v3.txt` (a partir de `graphm-v2.txt`). El texto del subtítulo nuevo va con `subsm-v3.srt`.

## Salida

- `Messenger-App-Review-editado-PiP-v3.mp4` (misma resolución, 30 fps, sin audio, `libx264 -crf 20 yuv420p -movflags +faststart`).
- Los cinco clips de Messenger regenerados desde el v3 en la carpeta **`recortes-v3\`** (créala), con los **mismos nombres, mismos cortes y mismo rótulo de 2 s «Permission shown: <permiso>»** que los actuales de `recortes\`. Mismos tramos del v2 (los tiempos del v3 son idénticos porque no cambia la duración):

| Clip | Tramo(s) del video |
|---|---|
| `pages_show_list.mp4` | 0:00 – 0:12.5 |
| `business_management.mp4` | 0:02.5 – 0:19 |
| `pages_read_engagement.mp4` | 0:17.5 – 0:35 |
| `pages_manage_metadata.mp4` | 0:17.5 – 0:35 y 0:40.5 – 0:45 (corte directo) |
| `pages_messaging.mp4` | 0:29.5 – 0:51.9 |

Para recortar, usa los mismos comandos con los que se hicieron los clips actuales (inspecciona sus propiedades con `ffprobe` para igualar duración y parámetros). Si algún tramo no coincide exactamente con el clip actual, dímelo.

## Verificación obligatoria

- Hoja de contactos de cada clip nuevo (un cuadro cada 2 s) y, además, cuadros sueltos cada 0.5 s en los tramos donde se difumina el nombre.
- Confirma con cuadros que **no se lee** «ChatBots Tuxtla» en ningún clip, que no se tapó nada necesario, que el subtítulo 2 ya no dice «signs in», y que no hay contraseñas ni nombres de otras páginas.
- `ffprobe`: duración idéntica al clip anterior (±0.1 s), 30 fps, sin audio, decodifica completo.
- Si un cuadro no se puede verificar, dilo; no afirmes que quedó bien sin haberlo visto.

## Entrega

- `Messenger-App-Review-editado-PiP-v3.mp4` y los 5 clips en `recortes-v3\`.
- Tabla: archivo, duración, tramo exacto y qué cuadros se verificaron.
- No hagas commit de los videos ni de las carpetas nuevas.
