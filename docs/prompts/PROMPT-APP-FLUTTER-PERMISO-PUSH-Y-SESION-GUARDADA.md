# Prompt para Codex — App Flutter: el permiso de notificaciones no se pidió y el arranque se atora con sesión guardada

Repo: `D:\AmbarRojo\repos\ambarcrm-app`. Continúa en la rama actual (revisa `git branch --show-current`; no crees otra). Sin push, merge ni PR. Responde en español.

## Antes de lanzarlo (Julio)

Abre Codex dentro de `D:\AmbarRojo\repos\ambarcrm-app`. Estas dos fallas salieron en el Pixel 9 (Android 16) con el APK debug de la rama actual, instalado limpio el 24-oct:

1. Tras iniciar sesión y llegar a la bandeja **no salió** el aviso "Notificaciones de mensajes" ni el permiso del sistema. `dumpsys` mostró `POST_NOTIFICATIONS: granted=false` sin flag `USER_SET`, o sea que nunca se pidió.
2. Al cerrar la app (force-stop) y reabrirla con la sesión guardada, se quedó en "Esto tarda más de lo normal". **Reintentar** no lo arregló; **Cerrar sesión / empezar de nuevo** sí llevó al login. Durante esos minutos el teléfono tuvo fallos de red intermitentes (otras apps con timeout y DNS), pero después ping y DNS funcionaban y la app seguía atorada.

No hay logs de Dart del teléfono. **No asumas la causa, pruébala** (emulador Android o pruebas con dobles). Si algo no lo puedes ejecutar, dilo; no lo marques como probado.

## Prompt

Lee `AGENTS.md`, `docs/ARQUITECTURA.md` y `docs/API-MOVIL.md`. Corre `git status`, `flutter analyze` y `flutter test` antes de empezar. Dos partes, un commit por parte, `analyze` y `test` en verde tras cada una.

### Parte 1 · El aviso de permiso de push debe salir siempre que corresponda

Flujo actual: `PantallaBandeja._prepararPush` llama `push.necesitaPermiso()`; si es `false` hace `registrar()` y termina sin avisar. `necesitaPermiso()` devuelve `false` cuando `iniciar()` dejó `habilitado = false`.

Hipótesis a confirmar o descartar:

1. `FirebasePush.iniciar()` envuelve `Firebase.initializeApp()`, `_local.initialize` y `createNotificationChannel` en un `timeout` de 3 s y **traga cualquier error** devolviendo `false`. En el primer arranque de una build debug puede tardar más de 3 s.
2. `ServicioPush.iniciar()` hace `_inicializacion ??= _iniciar()`: un fallo (o timeout) queda **cacheado para siempre en ese proceso**. No hay reintento hasta cerrar la app.
3. `EstadoPermisoSeguro` (`flutter_secure_storage`, clave `push_permiso`) podría traer un valor viejo tras reinstalar (backup automático de Android). Revisa si `android:allowBackup` / reglas de backup lo restauran y, si es así, exclúyelo del backup.

Qué dejar hecho:

- Un fallo de `iniciar()` **no se cachea**: la siguiente llamada (por ejemplo al volver a la bandeja o a primer plano) reintenta, con un límite razonable de intentos. Sube el tope de Firebase/plugins a un valor realista para el primer arranque sin volver a poner push en el camino crítico del arranque.
- Si el permiso sigue sin haberse respondido (`necesitaPermiso`), el aviso aparece aunque el primer intento de `iniciar()` haya fallado.
- Registra (con `debugPrint`, solo en debug) por qué quedó `habilitado = false`, para poder diagnosticar la próxima vez sin adivinar. No imprimas tokens ni credenciales.
- Pruebas: `iniciar()` que falla y luego funciona → se habilita y sale el aviso; `iniciar()` que nunca termina no bloquea la UI; el estado `rechazado` guardado no vuelve a mostrar el aviso.

### Parte 2 · El arranque con sesión guardada nunca debe quedarse atorado

`AuthProvider._resolverInicio` hace en cadena: `leerSesion`, `marcaRepo.leerGuardada`, `authRepo.renovar()`, `marcaRepo.obtener`, `guardarSesion`, `guardar marca`. Hay un tope de 15 s (`_limiteInicio`), pero en el teléfono la pantalla de carga siguió después de reintentar.

Revisa y corrige:

1. Qué pasa exactamente cuando vence el tope: `_terminarInicio(intento)` con `expiro = true`. Comprueba que el estado **sale de `iniciando`** en todos los caminos (timeout, excepción, `renovar` que nunca responde, almacén seguro que no responde, marca que nunca responde) y que la UI reacciona (¿`notifyListeners` llega a la pantalla de carga y al router?).
2. `reintentarInicio` / `iniciar(reintentar: true)`: ¿un intento anterior sin terminar (`_inicioEnCurso`) puede **bloquear** el siguiente? Verifica que un reintento realmente lanza un intento nuevo.
3. Un tope de 15 s con red mala puede hacer que **cada** arranque pase por el mismo límite. Con sesión guardada y sin respuesta de `renovar()`, conserva la sesión (`conSesion`) y entra a la bandeja con la caché, en vez de dejar al usuario esperando. Solo un 401 real cierra la sesión.
4. `leerSesion` (secure storage) y Hive tras un `force-stop`: ¿alguno puede esperar sin límite? Ponles timeout propio y camino de fallo.
5. La pantalla de carga debe mostrar "Esto tarda más de lo normal" **solo mientras el estado sea `iniciando`** y desaparecer en cuanto cambie.

Pruebas con dobles que **nunca terminan** (`Completer` sin completar) y que lanzan, para cada paso de la cadena: el estado termina en `conSesion` o `sinSesion` y nunca se queda en `iniciando`. Incluye una prueba de reintentar tras un intento colgado.

## Al terminar

Resumen corto: qué causa real encontraste en cada parte (confirmada o no), qué commits hiciste, y qué quedó sin poder probar. No subas `google-services.json` ni imprimas secretos.
