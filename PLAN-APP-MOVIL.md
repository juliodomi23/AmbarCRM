# Plan · App móvil de AmbarCRM (iOS y Android)

> Para el equipo de Ámbar Rojo Studios. Documento vivo: actualízalo al cerrar cada fase.

## 1. Qué vamos a construir

Una app nativa para **iOS y Android** que use **el mismo backend** de AmbarCRM y que sirva a los **agentes en el día a día**: contestar chats, recibir notificaciones al instante, mover oportunidades y ver tareas desde el celular.

**Dentro de la app (v1):**

- Bandeja de conversaciones con filtros (mías, sin asignar, por número, por etiqueta) y búsqueda.
- Chat completo: texto, fotos, documentos, **notas de voz**, notas internas, asignar responsable, cerrar o reabrir.
- **Ventana de 24 h** igual que en la web: aviso y envío de **plantillas aprobadas** cuando está cerrada.
- Sugerencia de respuesta con IA.
- **Notificaciones push nativas** de mensajes nuevos y asignaciones.
- Contactos (ver, buscar, editar), **embudos Kanban** (ver y mover tarjetas) y **tareas** (ver y completar).
- Marca de cada empresa (logo y colores) y modo oscuro.

**Fuera de la app (se queda en la web):** conectar números con Meta (Embedded Signup), crear plantillas de Meta, configurar bots, IA, marca, usuarios, embudos y campañas de difusión. Es configuración que hace el admin una vez y no tiene sentido en una pantalla chica.

> **¿Y si el cliente usa Coexistence?** Aunque siga contestando en la app de WhatsApp Business, la app de AmbarCRM le da lo que WhatsApp no tiene: varios agentes en un número, asignación, Kanban, tareas y notas internas. Ese es el argumento de venta de la app.

## 2. Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Framework | **Flutter 3 (estable)** | El equipo ya lo usa (app de Dentu); un código para iOS y Android |
| Estado | **provider** | Mismo que Dentu. Si la app crece mucho, evaluar Riverpod después, no antes |
| HTTP | **dio** | Interceptores para el token, reintentos y subida de archivos con progreso (en Dentu se usó `http`; aquí `dio` ahorra código) |
| Navegación | **go_router** | Abrir un chat directo desde una notificación (deep links) |
| Sesión | **flutter_secure_storage** | Token guardado cifrado (Keychain/Keystore) |
| Caché local | **hive** | Última bandeja y mensajes para abrir rápido y sin señal |
| Push | **firebase_messaging** + **flutter_local_notifications** | FCM entrega en Android y, vía APNs, en iOS |
| Tiempo real | Cliente SSE sobre `dio` (stream) | El backend ya emite eventos por `/api/stream` |
| Media | **image_picker**, **file_picker**, **record** (grabar voz), **just_audio** (reproducir), **cached_network_image** | |
| Texto/fechas | **intl** + `flutter_localizations` (es_MX) | |

**Alternativas que descartamos:**
- **Capacitor** (meter la web en una app): más rápido, pero Apple suele rechazar apps que "solo son una web" y la experiencia de chat se siente menos nativa.
- **React Native**: equivalente técnicamente, pero el equipo no lo domina.

## 3. Backend: el mismo, con 3 adiciones

El backend (Next.js en `web/`) se reutiliza tal cual. Lo que falta para móvil:

### 3.1 Autenticación con token (sin reescribir las rutas)

Hoy las rutas leen la sesión desde la **cookie** de NextAuth (`getServerSession`, 44 rutas). Para no tocar cada una:

1. **`POST /api/movil/login`** `{ org, email, password }` → valida igual que el login web y devuelve un **token JWT firmado con `NEXTAUTH_SECRET`**, con el mismo contenido que la sesión web (id, rol, orgId). Usar `encode` de `next-auth/jwt`. Duración: 30 días, más **`POST /api/movil/renovar`** para renovarlo.
2. En **`src/proxy.ts`**: si una petición trae `Authorization: Bearer <token>` y no trae cookie, **copiar el token a la cabecera `Cookie`** con el nombre de la cookie de sesión. Así `getServerSession`, `requireSesion` y el contexto multi-tenant (RLS) funcionan sin cambios.
3. Aplicar el **rate limit** existente (`lib/rate-limit.ts`) al login móvil.
4. **`POST /api/movil/logout`**: borra el token de push del dispositivo.

> Verificar en Fase 0 que `/api/stream` (SSE) y `/api/media/*` también funcionan con el Bearer.

### 3.2 Notificaciones push nativas (FCM)

Hoy existe **web push** (`lib/push.ts`, tabla `push_suscripciones`). Para la app:

- Tabla nueva **`dispositivos_push`**: `org_id`, `usuario_id`, `token_fcm` (único), `plataforma` (ios/android), `ultima_vez`. Con RLS como las demás y creada en `prisma/sql/actualizaciones.sql`.
- **`POST /api/movil/dispositivo`** (registrar o actualizar el token) y su `DELETE`.
- En `enviarPushAOrg` (`lib/push.ts`), además del web push, enviar por **FCM HTTP v1** con una cuenta de servicio de Firebase (variable `FIREBASE_SERVICE_ACCOUNT_JSON`). Borrar tokens inválidos cuando FCM responda `UNREGISTERED`.
- El payload lleva `conversacionId` para abrir el chat al tocar la notificación.

### 3.3 Contrato de API documentado

Antes de escribir la app, documentar en `API-MOVIL.md` las respuestas reales de los endpoints que usará (ejemplos JSON). Puntos de partida existentes:

| Uso | Endpoint |
|---|---|
| Marca de la empresa (pantalla de login) | `GET /api/public/brand?slug=` |
| Contadores del menú | `GET /api/shell` |
| Bandeja | `GET /api/conversaciones` |
| Detalle, asignar, cerrar, borrar | `GET/PATCH/DELETE /api/conversaciones/:id` |
| Mensajes de un chat | `GET /api/conversaciones/:id/mensajes` |
| Enviar texto, media, audio, nota o plantilla | `POST /api/mensajes/enviar` |
| Mensajes programados | `/api/mensajes/programados` |
| Plantillas de Meta aprobadas | `GET /api/meta/templates?canalId=` |
| Tiempo real | `GET /api/stream` (SSE) |
| Archivos | `GET /api/media/:archivo` |
| Búsqueda global | `GET /api/buscar?q=` |
| Contactos | `/api/contactos` |
| Embudos y oportunidades | `/api/embudos`, `/api/oportunidades`, `/api/oportunidades/mover` |
| Tareas | `/api/tareas` |
| Etiquetas y usuarios | `/api/etiquetas`, `/api/usuarios` |
| Sugerir respuesta con IA | `POST /api/ia/sugerir` |

## 4. Estructura del proyecto Flutter

Igual que en Dentu (`config/`, `data/`, `ui/`, `utils/`), organizada por función:

```
lib/
  main.dart
  config/        → URL del API, tema y colores de marca, rutas (go_router)
  data/
    api/         → cliente dio + interceptor de token + cliente SSE
    models/      → Conversacion, Mensaje, Contacto, Oportunidad, Tarea, Plantilla…
    repos/       → una clase por área (ConversacionesRepo, MensajesRepo…)
    cache/       → hive
  ui/
    login/  bandeja/  chat/  contactos/  kanban/  tareas/  ajustes/
    widgets/     → burbuja, avatar con color por nombre, aviso de ventana 24 h…
  utils/         → formatos de fecha/dinero, ventana de 24 h, notificaciones
```

Reglas: la lógica de la ventana de 24 h y los textos de error de Meta se **copian** de `web/src/lib/meta/ventana.ts` y `errores.ts` para que web y app digan lo mismo.

## 5. Fases

Estimado para **1 desarrollador**; con 2 personas se recorta casi a la mitad.

| Fase | Contenido | Tiempo |
|---|---|---|
| **0 · Backend** | Login móvil + Bearer en proxy, tabla y endpoint de dispositivos, envío FCM, `API-MOVIL.md`, proyecto de Firebase | 1 semana |
| **1 · Base de la app** | Proyecto Flutter, tema con marca por empresa y modo oscuro, login con empresa/correo/contraseña, sesión segura, navegación con barra inferior | 1 semana |
| **2 · Bandeja y chat** | Lista con filtros y búsqueda, tiempo real por SSE, chat con texto, fotos, documentos, voz, notas internas, asignar y cerrar, **ventana de 24 h + plantillas**, motivo de mensajes fallidos, sugerencia IA | 2–3 semanas |
| **3 · Notificaciones** | FCM en Android e iOS (APNs), abrir el chat desde la notificación, contador en el ícono | 1 semana |
| **4 · CRM** | Contactos, Kanban (ver y mover), tareas (ver y completar) | 1–2 semanas |
| **5 · Pulido** | Caché sin señal, estados vacíos y de carga, accesibilidad (tamaño de letra, lectores de pantalla), pruebas en equipos reales | 1 semana |
| **6 · Tiendas** | Fichas, capturas, privacidad, beta (TestFlight / prueba interna) y envío a revisión | 1–2 semanas |

**Total aproximado: 8 a 11 semanas.**

## 6. Publicación en tiendas

Ya tenemos cuenta de desarrollador en **App Store** y **Google Play**.

- **Cuenta demo para los revisores** (ambas tiendas la piden): org `demo-meta` con datos de ejemplo. Ya existe `web/scripts/seed-meta-review.mjs`; crear un usuario aparte para Apple y otro para Google.
- **Privacidad:** etiqueta de privacidad de Apple y sección "Seguridad de los datos" de Google (datos de contacto, mensajes, fotos y audio; cifrados en tránsito; no se venden). Usar la URL `https://crm.ambarrojostudios.cloud/privacidad`.
- **Eliminación de cuenta:** las cuentas las crea el admin (no hay registro en la app), pero igual agregar en Ajustes un enlace a `…/eliminacion-datos`.
- **Permisos con su motivo en español:** cámara, fotos, micrófono (notas de voz) y notificaciones.
- **iOS:** activar Push Notifications y Background Modes (remote notifications); subir la llave APNs a Firebase.
- **Nombre y marca:** "AmbarCRM", ícono = isotipo (ya existen PNG en `web/public/icon-512.png`).
- **Versión mínima sugerida:** iOS 15 y Android 8 (API 26).
- Probar en **beta cerrada** con 2 o 3 clientes antes de publicar.

## 7. Riesgos y decisiones abiertas

- **Una sola app para todas las empresas** (marca cargada al iniciar sesión) **vs. una app por cliente** (white label en tiendas). Recomendación: **una sola app** para v1. Apps por cliente multiplican revisiones y mantenimiento.
- **SSE en segundo plano:** el sistema operativo cierra la conexión con la app en segundo plano. Ahí entran las notificaciones push; al volver, se recarga la bandeja.
- **Notas de voz:** WhatsApp espera audio OGG/Opus. Grabar en ese formato (o convertir en el backend) y probarlo pronto.
- **Ventana de 24 h:** si Meta cambia la regla, solo se ajusta `HORAS_VENTANA` en web y app.
- **Seguridad:** token en almacenamiento seguro, nunca en logs; cerrar sesión borra token, caché y dispositivo de push.

## 8. Siguiente paso

1. Revisar este plan con el equipo y decidir quién toma cada fase.
2. Crear el proyecto de **Firebase** (Android + iOS) y el repo `ambarcrm-app`.
3. Arrancar la **Fase 0** en el backend (rama nueva desde `meta-tech-provider`).
