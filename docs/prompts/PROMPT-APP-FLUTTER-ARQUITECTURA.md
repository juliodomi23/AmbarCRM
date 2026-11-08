# Prompt para Codex — App Flutter: arreglos de la revisión y arquitectura por funcionalidad

Repo: `D:\AmbarRojo\repos\ambarcrm-app`. Continúa en la rama local **`feat/esqueleto-base`** (ya tiene 5 commits; no crees otra rama).
Sin push, merge ni PR. Responde y comenta en español.

## Antes de lanzarlo (Julio)

Abre Codex dentro de `D:\AmbarRojo\repos\ambarcrm-app`. Esto va **antes** de fusionar la rama a `main` y de que el equipo empiece.

## Prompt

Hay dos trabajos, en este orden y en commits separados: **A)** tres arreglos que salieron de la revisión del esqueleto, y
**B)** reorganizar `lib/` de "por capas" a "por funcionalidad" **sin cambiar comportamiento**, más la documentación.
Lee antes `AGENTS.md`, `CONTRIBUTING.md` y `docs/API-MOVIL.md`.

### Parte A · Arreglos (commit `fix(...)`, uno por arreglo)

1. **La app no debe quedarse cargando para siempre si falla el almacenamiento seguro.**
   En `AlmacenSesion.leerSesion()` (y `leerMarca()`), cualquier excepción al leer (incluida `PlatformException` de
   `flutter_secure_storage`, que en Android ocurre al restaurar un respaldo o cambiar el almacén de claves) debe borrar lo
   guardado y devolver `null`, para caer en el login. Además, `AuthProvider.iniciar()` nunca debe dejar el estado en
   `iniciando`: cualquier error inesperado termina en `sinSesion`. Añade `android:allowBackup="false"` al `<application>` de
   `AndroidManifest.xml` para que el token no entre a los respaldos de Android (es el único cambio nativo permitido aquí).
   Prueba: un almacén falso que lanza excepción al leer termina en `sinSesion`.
2. **La empresa no distingue mayúsculas en el teléfono, pero el servidor sí.** El slug del servidor es minúsculas (`sembid`).
   En el login, aplica `trim()` y `toLowerCase()` **solo** al campo Empresa. El correo y la contraseña no se transforman
   (el servidor compara el correo tal cual). Prueba: "SEMBID " se envía como `sembid`.
3. **La marca guardada no se pisa con la predeterminada.** Si la petición `GET /api/public/brand` falla, conserva la marca
   guardada de la sesión y **no** la sobrescribas. La predeterminada se usa solo si no hay nada guardado. Prueba: marca de
   red caída no reemplaza la guardada.

### Parte B · Arquitectura por funcionalidad (commit `refactor(...)`)

**Objetivo:** que dos personas trabajen en paralelo sin pisarse, con el menor número de archivos y capas posible.
**No cambies comportamiento, nombres de clases ni la lógica**; es mover archivos con `git mv`, corregir imports y partir lo que
haga falta. Si algo te obliga a cambiar lógica, deténtate y repórtalo.

Estructura objetivo:

```
lib/
  main.dart · app.dart
  core/                         lo compartido; solo cambia con revisión de Julio
    config/    entorno.dart · rutas.dart · tema.dart
    api/       cliente_api.dart · error_api.dart
    storage/   almacen_sesion.dart · cache_local.dart
    modelos/   usuario.dart · org.dart · marca.dart        (los usan varias funcionalidades)
    ui/        vista_estado.dart  y widgets comunes
    utils/     (vacía; aquí irán formatos y la ventana de 24 h)
  features/
    auth/      data/ (auth_repo.dart · sesion.dart · marca_repo.dart) · state/auth_provider.dart · ui/pantalla_login.dart
    inicio/    ui/pantalla_inicio.dart        (barra inferior con las 5 pestañas)
    ajustes/   ui/pantalla_ajustes.dart
    bandeja/   data/ · state/ · ui/           (vacías con .gitkeep)
    chat/      data/ · state/ · ui/
    contactos/ data/ · state/ · ui/
    kanban/    data/ · state/ · ui/
    tareas/    data/ · state/ · ui/
test/        espeja lib/: test/core/... y test/features/...
```

Reglas de dependencia (documéntalas y respétalas en lo que ya existe):

- `ui` → `state` → `data` (repo) → `core/api`. Nunca al revés ni saltándose un nivel: una pantalla no llama a `dio`.
- Una funcionalidad **no importa la `ui` ni el `state` de otra**. Lo que comparten viven en `core/` (modelos y widgets).
  Si necesitan datos de otra, usan ids y los modelos de `core/modelos`.
- `core/` no importa nada de `features/`.
- `AuthProvider` es el único estado global. Los demás se crean con `ChangeNotifierProvider` en la ruta o pantalla que los usa,
  salvo que deban vivir con la sesión (la bandeja, por el tiempo real, se decidirá en su tarea).
- Un repo por área, con el `ClienteApi` por constructor. Sin contenedores de inyección ni generadores de código.
- Los repos lanzan `ErrorApi`; el `state` lo convierte en un mensaje; la `ui` nunca ve `DioException`.

**Una sola pieza nueva:** `core/ui/vista_estado.dart`, un widget pequeño que recibe `cargando`, `error` (texto), `vacio` y
`hijo`, y muestra el estado correcto (indicador, mensaje con botón "Reintentar", texto de vacío, o el contenido). Es para
cumplir la regla "toda pantalla de red tiene cargando, error y vacío" sin repetir código. Con una prueba de widget. No hagas
más abstracciones nuevas.

**Las pestañas** de `pantalla_inicio.dart` siguen siendo placeholders: cada placeholder queda en la carpeta `ui` de su
funcionalidad (por ejemplo `features/bandeja/ui/pantalla_bandeja.dart`), para que quien construya la bandeja reemplace solo ese
archivo. Tras la reorganización no debe haber carpetas de pantallas fuera de `features/`.

**Rutas:** `core/config/rutas.dart` sigue componiendo el router. Deja un comentario de una línea en cada bloque de rutas
indicando que cada funcionalidad añade las suyas ahí.

### Parte C · Documentación (commit `docs(...)`)

Esta es la única parte donde puedes editar `AGENTS.md`. Hazlo para que **coincida con lo construido**:

1. Reemplaza la sección "Estructura" de `AGENTS.md` por el árbol real y las reglas de dependencia de arriba.
2. Crea `docs/ARQUITECTURA.md`, en español, corto (una página), con: el árbol, las reglas de dependencia, y una sección
   **"Por qué esta arquitectura"** con estas razones:
   - *Por funcionalidad y no por capas:* dos personas trabajan en funcionalidades distintas y casi nunca tocan los mismos
     archivos; menos conflictos de merge; el contexto que se le da a la IA cabe en una carpeta; borrar o rehacer una
     funcionalidad es tocar una sola carpeta.
   - *`core/` pequeño y con dueño:* lo compartido cambia poco y lo revisa Julio; evita que cada quien invente su propio
     cliente HTTP o su propio manejo de errores.
   - *Sin capa de dominio ni casos de uso:* el backend ya es el dominio; la app muestra y envía datos. Una capa extra son
     archivos que nadie necesita en un equipo de dos y ocho semanas.
   - *`provider` + `ChangeNotifier`, sin Riverpod ni Bloc:* ya decidido en el plan; menos conceptos que aprender.
   - *Estado por pantalla, salvo `AuthProvider`:* se libera memoria al salir y no hay estado viejo mezclado entre empresas.
   - *Cuándo cambiar esto:* si una funcionalidad crece a más de ~15 archivos, se parte en subcarpetas; si algo se repite en
     tres funcionalidades, sube a `core/`; no antes.
   - *Quién toca qué:* Persona 1: `bandeja/` y `chat/`. Persona 2: `contactos/`, `kanban/`, `tareas/` y `ajustes/`.
     `core/`, `app.dart` y `rutas.dart` solo con PR pequeño y revisado por Julio.
3. En `README.md`, enlaza `docs/ARQUITECTURA.md`.

No edites nada más en `docs/`, ni `CONTRIBUTING.md`, `.githooks/`, `.github/` ni `.gitignore`.

### Reglas generales

- Sin paquetes nuevos. Sin generadores de código. Sin cambios de lógica en la Parte B.
- No toques configuración nativa salvo `allowBackup` (Parte A.1).
- Nada de tokens ni credenciales en logs ni en el repo. No pruebes contra producción.
- Commits pequeños en Conventional Commits (tipo en inglés, descripción en español, minúsculas, sin punto): por ejemplo
  `fix(auth): ...`, `fix(marca): ...`, `refactor(estructura): ...`, `docs(arquitectura): ...`. Hook activo, sin `--no-verify`.
- Cierra todo emulador o proceso que abras.

### Verificación

Después de **cada** parte: `flutter analyze` sin observaciones y `flutter test` en verde. Al final también
`flutter build apk --debug`. Compara el número de pruebas con el de antes (11) y explica cualquier diferencia. Comprueba con
`grep` que ningún archivo de `core/` importe de `features/` y que ninguna `ui` importe `dio`. **No marques como probado lo que no
ejecutaste.**

### Al terminar

Un solo reporte: qué hiciste por parte, los comandos y resultados de `analyze`/`test`/`build`, el árbol final de `lib/`, el
`git diff --stat` contra `main`, los resultados de los `grep` de dependencias, y cualquier decisión que Julio deba revisar.
No hagas push ni merge.
