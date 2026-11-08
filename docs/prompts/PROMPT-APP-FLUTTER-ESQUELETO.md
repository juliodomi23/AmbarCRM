# Prompt para Codex — App Flutter: esqueleto base (login, sesión, navegación, tema)

Repo: `D:\AmbarRojo\repos\ambarcrm-app` (GitHub: `Ambar-Rojo-Studios/APP-AmbarCRM`, privado). Rama nueva `feat/esqueleto-base` desde `main`.
No es el repo del CRM: aquí solo hay Flutter. El backend ya está en producción y no se toca.

## Antes de lanzarlo (Julio)

1. Abre Codex dentro de `D:\AmbarRojo\repos\ambarcrm-app` (no dentro de la carpeta del CRM).
2. Ten `flutter doctor` en verde para Android. iOS solo se compila en Mac, aquí no hace falta.
3. No necesita `google-services.json` ni credenciales: este prompt **no** instala Firebase.
4. Al terminar, tú pruebas el login en un celular o emulador contra `demo-meta` (Codex no tiene credenciales).

## Prompt

Eres un desarrollador Flutter senior. Vas a dejar el **esqueleto base** de la app móvil de AmbarCRM para que dos personas
puedan empezar el lunes en paralelo (una hará bandeja y chat; la otra contactos, embudos y tareas) sin pisarse el código base.
Responde y comenta en **español**. Trabaja en una rama local; **no hagas push, merge ni PR**.

### Lee primero (no asumas)

- `AGENTS.md` y `CONTRIBUTING.md` (reglas de código, estructura, commits, stack permitido).
- `docs/API-MOVIL.md`: contrato real del backend. **Si un endpoint no está ahí, no lo inventes.**
- `docs/PLAN-EQUIPO-APP-MOVIL.md`, tareas B1 y C1–C3, para entender qué construirá cada persona encima.
- `lib/main.dart` y `pubspec.yaml` generados por `flutter create`. Confirma `flutter --version` y reporta la versión.

### Alcance exacto

**Sí:** dependencias, estructura de carpetas, cliente HTTP, sesión segura, login funcional contra el backend real,
renovación del token al abrir, cierre de sesión, tema con la marca de la empresa, navegación con pestañas vacías, pruebas.
**No:** bandeja, chat, contactos, embudos, tareas, push, Firebase, notificaciones, SSE, modelos de esas áreas,
cache de listas. Esas pantallas quedan como **placeholders** con su carpeta lista. Nada de backend ni de `/api/v1`.

### Paquetes (solo estos)

`provider`, `dio`, `go_router`, `flutter_secure_storage`, `hive`, `hive_flutter`, `intl`, y para pruebas lo que ya trae `flutter_test`.
Instálalos con `flutter pub add` para que queden con la versión actual compatible. **No agregues Firebase ni nada más.**
Comprueba que `flutter_secure_storage` funciona con el `minSdk` del proyecto; si exige subirlo, súbelo al mínimo necesario y
repórtalo. Muestra el bloque de `dependencies` final.

### Estructura (la de `AGENTS.md`)

```
lib/
  main.dart
  app.dart                      MaterialApp.router + MultiProvider + tema
  config/    entorno.dart · rutas.dart · tema.dart
  data/
    api/     cliente_api.dart · error_api.dart
    models/  sesion.dart · usuario.dart · org.dart · marca.dart
    repos/   auth_repo.dart · marca_repo.dart
    cache/   cache_local.dart
  state/     auth_provider.dart
  ui/
    login/   pantalla_login.dart
    inicio/  pantalla_inicio.dart          (barra inferior con 5 pestañas)
    bandeja/ chat/ contactos/ kanban/ tareas/ ajustes/ widgets/
  utils/
```

Las carpetas vacías de pantallas futuras llevan un `.gitkeep` o un placeholder mínimo; no código especulativo.
Una pantalla no llama a `dio`: pasa por un repo. Un repo no conoce widgets.

### Piezas

1. **`entorno.dart`:** URL base desde `--dart-define=API_URL`, con valor por defecto `https://crm.ambarrojostudios.cloud`.
   Documenta en el `README.md` cómo apuntar a otro servidor.
2. **`ClienteApi` (dio):**
   - Timeouts de conexión y respuesta razonables; JSON.
   - Interceptor que añade `Authorization: Bearer <token>` cuando hay sesión.
   - Ante **401** en una petición con token: limpia la sesión y avisa a `AuthProvider` (una sola vez, sin bucles).
   - Convierte los fallos en `ErrorApi` con **mensaje legible en español** (sin conexión, tiempo agotado, 401, 4xx con el
     `error` del JSON, 5xx genérico). Las pantallas nunca ven `DioException`.
   - **Prohibido** `LogInterceptor` o cualquier `print` de cabeceras, cuerpos de login o tokens.
3. **Modelos inmutables** con `fromJson` a mano (sin generadores): `Sesion` (token, expiraEn, usuario, org), `Usuario`
   (id, nombre, rol, puesto), `Org` (slug, nombre), `Marca` (nombre, logo, colorPrimario, colorAcento, preset). Los IDs del
   backend llegan como **string**; respétalo.
4. **Sesión segura:** el token y la sesión viven **solo** en `flutter_secure_storage`. Guarda también la última `org`
   escrita (para precargarla en el login). Nada en `SharedPreferences`, ni en Hive, ni en logs.
5. **`AuthRepo`:** `login(org, email, password)` → `POST /api/movil/login`; `renovar()` → `POST /api/movil/renovar`;
   `cerrarSesion()` → `POST /api/movil/logout` en modo mejor-esfuerzo (si falla la red, igual se borra lo local).
   El login exige `org` (el campo "Empresa"); no lo omitas.
6. **`MarcaRepo`:** `GET /api/public/brand?slug=<org>` (pública, sin token) para el tema. Si falla, usa la marca por defecto
   (colores de Ámbar Rojo: primario `#D7083F`, acento `#E91E8C`).
7. **`AuthProvider`:** estados `iniciando`, `sinSesion`, `conSesion`, más `cargando` y `error` del login.
   - Al abrir la app: lee la sesión guardada; si existe, llama a `renovar()`. Si responde **401**, pasa a `sinSesion`.
     Si falla por **red**, conserva la sesión guardada (no expulsar al agente por no tener señal).
   - Tras login o renovar, guarda el token nuevo y la marca. Expón `usuario`, `org`, `marca`.
   - `cerrarSesion()`: llama al repo, borra token y sesión, **limpia el caché local** y vuelve a `sinSesion`.
8. **`CacheLocal`:** inicializa Hive (`hive_flutter`) y expone solo `limpiar()`. No guardes nada aún: el caché de listas lo
   llenan las otras tareas. Debe poder llamarse al cerrar sesión.
9. **Tema (`tema.dart`):** `ThemeData` Material 3 con `colorPrimario` de la marca (valida el hex; si es inválido usa el
   por defecto). Claro y oscuro con `ThemeMode.system`. Texto en español (`es_MX`) con `intl` inicializado en `main`.
10. **Navegación (`go_router`):** `/login` y `/` (inicio). El `redirect` lee `AuthProvider`: sin sesión → `/login`;
    con sesión estando en `/login` → `/`; mientras `iniciando` muestra una pantalla de carga sin parpadear el login.
    El inicio tiene `NavigationBar` con 5 pestañas: **Bandeja, Contactos, Embudos, Tareas, Ajustes**. Cada pestaña es un
    placeholder con título y mensaje "Próximamente". **Ajustes** sí es real: muestra nombre, rol, puesto y empresa, y el
    botón **Cerrar sesión** con confirmación.
11. **Login (`pantalla_login.dart`):** campos Empresa, Correo y Contraseña (con mostrar/ocultar); valida vacíos y correo
    básico; botón con indicador de carga y deshabilitado mientras carga; muestra el error del backend en español
    (`credenciales inválidas`, sin conexión…). Teclado adecuado, `autofillHints`, enter envía. Sin registro ni
    "olvidé mi contraseña" (las cuentas las crea la empresa). Tres estados: cargando, error, normal.
12. **Nombre e íconos:** nombre visible de la app **"AmbarCRM"** en Android (`android:label`) e iOS (`CFBundleDisplayName`).
    No toques el `applicationId` ni el bundle ID (`cloud.ambarrojostudios.ambarcrm`). Sin logos de WhatsApp ni Meta.
    **Importante:** `flutter create` solo declara el permiso `INTERNET` en los manifiestos debug/profile. Añádelo en
    `android/app/src/main/AndroidManifest.xml`, o la versión release no tendrá red. No agregues otros permisos.

### Zonas prohibidas

- No toques `docs/`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `.githooks/`, `.github/`, `.gitignore`.
- No edites configuración nativa salvo: nombre visible, permiso `INTERNET` y `minSdk` si lo exige un paquete.
- No agregues paquetes fuera de la lista, ni generadores de código (`freezed`, `json_serializable`, `build_runner`).
- No subas ni crees `google-services.json`, `GoogleService-Info.plist`, `.env` ni llaves.
- No uses credenciales reales ni pruebes contra producción. No imprimas ni guardes tokens.

### Pruebas (`flutter test`, sin red)

Usa un adaptador falso de dio o un repo falso; nada sale a internet.
- **Modelos:** `Sesion.fromJson` con el ejemplo real de `API-MOVIL.md`; `Marca` con color inválido cae al por defecto.
- **`ClienteApi`:** añade Bearer cuando hay token; un 401 con token limpia la sesión **una sola vez**; los errores de red y
  tiempo agotado se traducen a mensajes en español.
- **`AuthProvider`:** inicio sin sesión → `sinSesion`; con sesión guardada y renovar OK → `conSesion`; renovar 401 →
  `sinSesion`; renovar con fallo de red → conserva la sesión; `cerrarSesion` borra token y llama a `limpiar()` del caché.
- **Widget:** el login no envía con campos vacíos, muestra el error del backend y desactiva el botón mientras carga;
  la barra inferior muestra las 5 pestañas.

### Verificación

`flutter analyze` (sin errores ni warnings), `flutter test` en verde y `flutter build apk --debug` compila. Si puedes lanzar un
emulador, abre la app y confirma que arranca en el login; si no, dilo. **No marques como probado lo que no ejecutaste**:
el login real contra `demo-meta` lo prueba Julio.

### Git

Commits pequeños en **Conventional Commits** (tipo en inglés, descripción en español, minúsculas, sin punto final), por ejemplo
`feat(auth): ...`, `feat(config): ...`, `test(auth): ...`, `chore(deps): ...`. El hook `.githooks/commit-msg` ya está activo
(`git config core.hooksPath .githooks`; si no lo está, actívalo). Sin `--no-verify`. Cierra todo emulador o proceso que abras.

### Al terminar

Un solo reporte: versión de Flutter, lista final de paquetes, árbol de `lib/`, qué hace cada pieza en dos líneas, resultado de
`analyze`/`test`/`build`, el `git diff --stat` contra `main`, cualquier cambio nativo que hiciste (con el archivo), lo que
**no** pudiste ejecutar y cualquier decisión que Julio deba revisar. No hagas push ni merge.
