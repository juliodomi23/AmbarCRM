# Prompt para Codex: editar de nuevo los videos del App Review de Meta (v2, con las grabaciones que ya existen)

**No toques el código de `web/`, no hagas commits ni push, no subas ningún video a ningún servicio y no envíes nada a Meta.** Trabaja solo con `ffmpeg` en local. No modifiques ni borres los archivos originales ni los videos editados actuales: genera archivos nuevos con sufijo `-v2`. No escribas contraseñas ni tokens en ningún archivo.

Carpeta de trabajo: `D:\AmbarRojo\Documentos de ambar rojo\docs\08-productos-internos\AmbarCRM\`.

## Material

| Archivo | Qué es |
|---|---|
| `Video messenger 5 permisos.mp4` | Pantalla de la PC, Messenger (64.9 s, 1892x978) |
| `video mesenger cel.mp4` | Teléfono, Messenger (24.5 s, 576x1296) |
| `video instagram 2 permisos.mp4` | Pantalla de la PC, Instagram (56 s) |
| `video insta cel .mp4` | Teléfono, Instagram (16 s) |
| `Messenger-App-Review-editado-PiP.mp4` | Edición actual de Messenger (51.9 s) |
| `IG-App-Review-editado-PiP.mp4` | Edición actual de Instagram (36.5 s) |
| `video-edicion\graphm.txt`, `subsm.srt`, `fr.png` | Receta actual de Messenger (filtro, subtítulos y cuadro congelado de la pantalla de permisos) |
| `video-edicion\graph2.txt`, `subs2.srt` | Receta actual de Instagram |

Las recetas se usan con `ffmpeg -/filter_complex archivo`. Lee los grafos para ver el orden de entradas (`0` = pantalla, `1` = teléfono, `2` = cuadro congelado en Messenger) y reconstruye el comando. Estilo de subtítulos actual: Arial 20, negrita, fondo semitransparente, `Alignment=2`, sin audio (`-an`), 30 fps, `yuv420p`.

## Por qué se rehace

La guía oficial de grabaciones de Meta (`https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings/`) pide anotar en qué momento se usa **cada** permiso y empezar mostrando el inicio de sesión. Omitir un permiso provoca rechazo. Hoy faltan anotaciones y el video de Instagram no muestra el login del CRM.

## Tarea 1: Messenger (`Messenger-App-Review-editado-PiP-v2.mp4`)

Parte de la receta actual (`graphm.txt`) y conserva: difuminado de páginas/portafolios de otros clientes, cuadro congelado de 6 s con la pantalla de permisos, PiP del teléfono en los mismos tramos.

Cambia **solo** los subtítulos (inglés), de modo que cada permiso quede nombrado en el momento en que se usa:

- Durante el cuadro congelado de la pantalla de permisos (aprox. 0:19–0:25), pon un subtítulo **arriba de la imagen** (`Alignment=8`, con margen para no tapar el diálogo de Facebook) que diga: `Facebook lists the permissions: pages_show_list, pages_messaging, pages_manage_metadata, pages_read_engagement, business_management`. Si no cabe en una línea, usa dos líneas cortas arriba. Comprueba con un cuadro que no tape el diálogo.
- Durante la conexión (aprox. 0:25–0:35), subtítulo: `AmbarCRM subscribes the Page to its webhook so messages arrive (pages_manage_metadata). The Page access token is validated (pages_read_engagement).`
- Mantén los demás subtítulos actuales (selección de página con `pages_show_list`, portafolio con `business_management`, mensaje con `pages_messaging`, etc.).
- **Opcional:** difuminar el nombre del perfil de Facebook que aparece en el diálogo («¿Continuar como …?») solo si se puede hacer sin tocar el texto de los permisos ni el nombre «Ámbar Rojo Studios». Si hay riesgo de tapar algo necesario, no lo hagas y avísame.

## Tarea 2: Instagram (`IG-App-Review-editado-PiP-v2.mp4`)

La edición actual empieza en `src 12.0`. El original empieza en el login del CRM (`src 0–12`), donde la **contraseña está visible**. Antepón ese tramo para mostrar el inicio de sesión:

1. Antepón el segmento del original (`src ~0` hasta donde empieza la receta actual) y **difumina por completo el campo de contraseña** durante todo ese tramo (y cualquier otro cuadro donde aparezca). Verifica cuadro por cuadro (cada 0.5 s) que la contraseña no sea legible.
2. Desplaza todos los tiempos de subtítulos y de los PiP del teléfono por la duración del tramo antepuesto.
3. Añade un subtítulo al inicio: `The admin signs in to AmbarCRM (reviewer credentials are provided in the submission).`
4. Conserva los subtítulos actuales de Instagram (mencionan `instagram_business_basic` e `instagram_business_manage_messages`).

## Verificación obligatoria antes de entregar

- Genera una hoja de contactos de cada video nuevo (un cuadro cada 2 s) y revísala: no debe verse **ninguna contraseña**, ni nombres de páginas de otros clientes, ni notificaciones personales.
- Revisa con cuadros sueltos que los subtítulos nuevos no tapen la lista de permisos ni el nombre «Ámbar Rojo Studios» ni `@ambar_rojo_studios`.
- Confirma duración, 30 fps, sin pista de audio y que se reproducen (`ffprobe`).
- Si un cuadro no se puede verificar, dilo; no afirmes que quedó bien sin haberlo visto.

## Entrega

- `Messenger-App-Review-editado-PiP-v2.mp4` e `IG-App-Review-editado-PiP-v2.mp4` en la misma carpeta.
- Resumen: duración de cada uno, qué cambió, qué verificaste con cuadros y qué dudas quedan. No hagas commit de los videos ni de `video-edicion\`.
