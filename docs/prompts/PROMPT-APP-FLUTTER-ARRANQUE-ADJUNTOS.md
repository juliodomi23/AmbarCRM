# Prompt para Codex — App Flutter: arranque que nunca se queda cargando, adjuntos estables y push con Firebase

Repo: `D:\AmbarRojo\repos\ambarcrm-app`. Continúa en la rama **`feat/bandeja-chat`** (no crees otra). Sin push, merge ni PR. Responde en español.

## Antes de lanzarlo (Julio)

Abre Codex dentro de `D:\AmbarRojo\repos\ambarcrm-app`. Ya copié `android/app/google-services.json` (ignorado por git; no lo subas ni lo imprimas).
Estas fallas salieron en el Pixel 9 (Android 16): al enviar una imagen (cámara o archivo) la app se bloqueó y se cerró; al reabrirla se
quedó en la pantalla de carga para siempre. No hay logs del teléfono todavía: **no asumas la causa, pruébala** en un emulador Android si
puedes, y si no puedes, dilo.

## Prompt

Lee `AGENTS.md`, `docs/ARQUITECTURA.md` y `docs/API-MOVIL.md`. Antes de empezar, el árbol tiene cambios sin commit de la ronda anterior
(ventana por canal y mapas): revisa `git status`, corre `analyze` y `test` y haz **dos commits** (`fix(chat): ...`, `feat(chat): ...`).
Después, tres partes, un commit por parte. `flutter analyze` y `flutter test` en verde tras cada una. No marques como probado lo que no ejecutaste.

### Parte 1 · El arranque nunca se queda cargando

Síntoma: tras cerrarse la app de golpe, al abrir queda la pantalla de carga infinita. Hipótesis a revisar (descarta o confirma cada una):

1. `CacheLocal.inicializar()` (Hive) se llama en `main()` **antes** de `runApp`. Un cierre abrupto puede dejar la caja bloqueada o corrupta
   y bloquear o lanzar. Hazlo a prueba de fallos: nada del arranque puede lanzar o esperar sin límite antes de `runApp`. Si Hive falla,
   borra sus archivos, reintenta una vez, y si sigue fallando arranca sin caché.
2. `AuthProvider.iniciar()` hace `leerSesion`, `renovar()` y `obtener marca` en cadena. Ponle un **tope total** (por ejemplo 15 s). Si se
   agota: con sesión guardada y sin señal, conserva la sesión (`conSesion`); si el almacén seguro no responde, cae a `sinSesion`.
3. El servicio de push (`ServicioPush.iniciar`, `Firebase.initializeApp`, `getInitialMessage`, `getToken`, `mensajeInicial`) **no debe**
   estar nunca en el camino crítico del arranque: que corra después de mostrar la UI, cada llamada con *timeout* y dentro de `try/catch`.
   Ojo: ahora que `google-services.json` existe, Firebase **sí** se inicializa de verdad, algo que antes no pasaba.
4. La imagen/foto que se estaba enviando al cerrarse: si había estado pendiente guardado, no debe bloquear nada al reabrir.

Además, la pantalla de carga inicial debe tener **salida**: si pasan más de ~10 s, muestra "Esto tarda más de lo normal" con botones
**Reintentar** y **Cerrar sesión / empezar de nuevo** (este borra sesión y caché y va al login).
Pruebas con dobles que **nunca terminan** (`Completer` sin completar) y que lanzan: el estado sale de `iniciando` en todos los casos.

### Parte 2 · Adjuntos: que enviar una imagen no tumbe la app

Síntoma: elegir cámara o archivo e intentar enviar bloqueó la app y se cerró. Revisa y arregla, comprobando cada punto:

1. **Android destruye la actividad mientras la cámara está abierta** (muy común). `image_picker` exige recuperar el resultado perdido:
   al reiniciar, llama a `ImagePicker().retrieveLostData()` y, si trae un archivo, reanuda el flujo de adjunto en el chat (o al menos no
   falles ni pierdas la sesión). Impleméntalo donde corresponda por capas, sin romper `ARQUITECTURA.md`.
2. **Trabajo pesado en el hilo de la UI:** leer `readAsBytes`, `base64Encode` de varios MB y construir el JSON bloquean la interfaz
   (ANR). Mueve codificación y armado del cuerpo a un *isolate* (`Isolate.run` / `compute`), evita copias innecesarias de los bytes y
   respeta el tope de 18 MB **antes** de codificar. Muestra el progreso de subida y que la UI siga respondiendo.
3. **Imagen:** las fotos de cámara vienen grandes; confirma que `imageQuality` y `maxWidth` realmente se aplican (en cámara y galería) y
   que el MIME (`image/jpeg`) es el correcto. Si `archivo.mimeType` viene nulo, el nombre decide. Revisa HEIC/WebP.
4. **Errores no capturados:** envuelve el flujo completo (selector → vista previa → envío) para que cualquier excepción termine en un
   aviso en español y el mensaje `fallido` con reintento, nunca en un cierre. Registra en modo debug (`kDebugMode`) solo el **tipo** del
   error y la etapa (sin rutas, contenido ni tokens).
5. **Permisos y manifiesto:** comprueba qué permisos fusionan los plugins en el `AndroidManifest` final (`flutter build apk --debug` y
   revisa el manifiesto fusionado). Si la cámara falla porque `CAMERA` está declarado sin concederse, o hace falta algún ajuste, corrígelo y
   anótalo en el reporte. Este es el único cambio nativo permitido en esta parte.
6. **Documentos:** `file_picker` v13: verifica el uso correcto de su API en Android 16 y que cancelar el selector no deja la barra
   bloqueada en "enviando".

Pruebas: envío con cuerpo codificado en isolate; tope de tamaño; fallo de lectura → mensaje `fallido` sin excepción; recuperación de
`retrieveLostData` con un doble; cancelar el selector deja la barra usable.

### Parte 3 · Push con Firebase ya configurado

Ahora existe `android/app/google-services.json` (proyecto `fir-ambarcrm`, paquete `cloud.ambarrojostudios.ambarcrm`).

- Confirma que `flutter build apk --debug` compila **con** el archivo (el plugin condicional ahora sí se aplica) y que sigue compilando
  **sin** él (renómbralo temporalmente para comprobarlo y devuélvelo; no lo subas ni lo imprimas).
- Revisa que el flujo de registro funciona de punta a punta con dobles: permiso (Android 13+ `POST_NOTIFICATIONS`) en un momento
  razonable, token FCM, `POST /api/movil/dispositivo`, renovación de token y `DELETE` al cerrar sesión **antes** de borrar la sesión.
- El servidor mandará un campo nuevo en `data`: **`tipo`** = `"mensaje"` o `"atencion_humana"`, además de `conversacionId` y `url`. Parsea
  con tolerancia (si falta, es `"mensaje"`). Para `atencion_humana`, usa el título "Requiere atención humana" tal como llega y que al
  tocar abra el chat. No cambies nada más de la lógica de notificaciones.
- En primer plano no muestres aviso si el usuario ya está dentro de ese chat (ya existe); verifícalo con una prueba.
- No ejecutes push reales: el servidor aún no tiene la clave de servicio. Repórtalo como no probado.

### Verificación y reglas

`flutter analyze` sin observaciones, `flutter test` en verde (indica el número; antes eran 52), `flutter build apk --debug`, y los `grep` de
dependencias de siempre (`core/` sin `features/`, ninguna `ui` con `dio`, `bandeja/` y `chat/` sin importarse). Si puedes abrir un emulador
Android, prueba arrancar la app, enviar una imagen de galería y reabrirla tras matar el proceso; si no, dilo.
Sin paquetes nuevos. Nunca imprimas tokens, mensajes, teléfonos ni el contenido de `google-services.json`. Commits pequeños en Conventional
Commits, hook activo, sin `--no-verify`. Cierra todo emulador o proceso que abras.

### Al terminar

Un solo reporte por parte: causa confirmada o descartada de cada hipótesis, qué cambió, resultados de `analyze`/`test`/`build`, el
`git diff --stat`, cualquier cambio nativo con su archivo y lo que **no** pudiste probar (cámara real, Pixel 9, push real, iOS). No hagas push ni merge.
