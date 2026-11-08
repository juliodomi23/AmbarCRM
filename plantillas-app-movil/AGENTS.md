# AGENTS.md — AmbarCRM App (Flutter)

Instrucciones para agentes de IA (Codex, Claude Code, etc.) y para quien programe con ellos.
Responde y comenta **en español**.

## Qué es esto

App móvil (iOS y Android) de AmbarCRM para que los agentes contesten chats de WhatsApp, reciban notificaciones y
muevan oportunidades. Usa **el mismo backend** de AmbarCRM (Next.js, repo `AmbarCRM/web`); aquí no hay backend.

Plan completo: `PLAN-APP-MOVIL.md` y `PLAN-EQUIPO-APP-MOVIL.md` (repo AmbarCRM).
**Contrato de API: `API-MOVIL.md`. Si un endpoint no está ahí, no lo inventes: pregunta.**

## Stack

Flutter 3 estable · `provider` (estado) · `dio` (HTTP) · `go_router` (navegación) · `flutter_secure_storage`
(token) · `hive` (caché) · `firebase_messaging` + `flutter_local_notifications` (push) · `intl` (es_MX).
No agregues paquetes sin avisar en el PR y justificar por qué no alcanza lo que ya hay.

## Estructura

```
lib/
  config/   URL del API, tema y colores de marca, rutas
  data/     api/ (dio, SSE) · models/ · repos/ (uno por área) · cache/
  ui/       login/ bandeja/ chat/ contactos/ kanban/ tareas/ ajustes/ widgets/
  utils/    formatos, ventana de 24 h, notificaciones
```

Una pantalla no llama a `dio` directo: pasa por un repo. Un repo no conoce widgets.

## Comandos

```
flutter pub get
flutter analyze          # debe quedar sin errores ni warnings nuevos
flutter test
flutter run              # en celular real o emulador
```

Antes de pedir revisión: `flutter analyze` y `flutter test` en verde.

## Reglas de código

- Funciones y widgets **chicos**; un widget grande se parte en varios.
- Nombres claros, en español de negocio (`Conversacion`, `bandejaRepo`, `ventanaCerrada`).
- Sin comentarios obvios. Comenta solo el **por qué** de algo no evidente.
- Sin abstracciones "por si acaso": nada de capas, interfaces o configuración que hoy no se use.
- Modelos de datos inmutables; el JSON se convierte en el modelo, no se pasa `Map` por la app.
- Todo texto visible al usuario va en español (es_MX). Fechas y dinero con `intl`.
- Todo estado de red tiene los tres casos: **cargando, error y vacío**.

## Reglas del negocio que no se rompen

- **Ventana de 24 h de WhatsApp:** con la ventana cerrada solo se envían **plantillas aprobadas**. La lógica
  vive en `utils/` y debe decir lo mismo que `web/src/lib/meta/ventana.ts` (`HORAS_VENTANA`).
- Los errores de Meta se muestran con el texto legible de `web/src/lib/meta/errores.ts`, no el código crudo.
- Multi-tenant: la app nunca mezcla datos de dos empresas; cerrar sesión borra token, caché y token de push.

## Envío de archivos y audio

- `POST /api/mensajes/enviar` recibe media y audio **en base64 dentro del JSON** (`mediaBase64`, `audioBase64`),
  no multipart. Tope ≈ 18 MB; comprime las fotos en el teléfono antes (`image_picker` con `imageQuality` y
  `maxWidth`) para no pasarte ni gastar datos.
- Notas de voz: graba en AAC/m4a y manda `mediaMime: "audio/mp4"`. El backend acepta `audio/ogg`, `audio/mp4`,
  `audio/mpeg`, `audio/aac` y `audio/amr`; otro formato devuelve 400.

## Permisos y tiendas

- Pide solo cámara, micrófono y notificaciones, **en el momento en que se usan**, con un texto de motivo en español.
  Sin `READ_MEDIA_*`: fotos y archivos con los selectores del sistema.
- Nada de pagos dentro de la app, ni registro de usuarios: las cuentas las crea la empresa.
- No pongas logos ni nombres de WhatsApp/Meta en el ícono, el nombre de la app ni las capturas.
- Antes de cada envío a tiendas, repasa el checklist de la sección 10 de `PLAN-EQUIPO-APP-MOVIL.md`.

## Seguridad

- Token **solo** en `flutter_secure_storage`. Nunca en logs, `print`, `SharedPreferences` ni en el repo.
- No subir `google-services.json`, `GoogleService-Info.plist`, llaves ni `.env` (están en `.gitignore`).
- Se prueba contra la org **`demo-meta`**. Nunca contra producción ni datos reales de clientes.

## Git

Commits en **Conventional Commits** y ramas por tarea. Detalle en `CONTRIBUTING.md`.
Nunca hagas push a `main` ni `develop`, ni `--force`, ni `--no-verify`.

## Cómo trabajar con IA en este repo

1. Dale a la IA una tarea chica y concreta (una pantalla, un repo), no "haz el chat".
2. Pídele que lea primero `API-MOVIL.md` y el código vecino, y que siga el estilo existente.
3. Revisa el diff completo. **Si no puedes explicar una línea, no la subas.**
4. Corre la app en un celular antes de abrir el PR; "compila" no es "funciona".
5. Si la IA propone un paquete nuevo, un cambio de arquitectura o tocar el backend: detente y consulta a Julio.
