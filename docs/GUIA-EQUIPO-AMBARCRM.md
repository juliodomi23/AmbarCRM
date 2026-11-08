# Guía para elegir dónde trabajar en AmbarCRM

Guía de incorporación para dos personas con experiencia en Flutter. El estado de la app se describe desde el código disponible; los planes se usan como contexto, no como prueba de que una función ya existe.

## 1. Qué es AmbarCRM

AmbarCRM reúne conversaciones de WhatsApp, contactos, oportunidades, agentes y automatizaciones para empresas que atienden clientes por chat. Se ofrece como una instalación compartida: una misma aplicación y base de datos sirven a varias empresas (organizaciones u *orgs*). Cada empresa entra con su propio usuario, sus datos quedan aislados y se le pueden habilitar módulos distintos. Por ejemplo, una clínica puede usar Pacientes y Citas; una tienda, Productos, Ventas y Caja. La web se usa para operar y configurar el CRM; la app móvil busca que los agentes atiendan conversaciones desde el teléfono.

## Dónde estamos hoy (26 de octubre de 2026)

"Hecho" significa que hay código y pruebas en una base desechable; no implica que todo tenga ya piloto con clientes reales. Producción despliega la rama `meta-tech-provider`.

### Lo que ya tenemos

| Área | Qué hay |
|---|---|
| Plataforma | Una instalación para muchas empresas (`org_id` + RLS, aislamiento probado en 86 tablas); usuarios con puestos y acceso por módulo; 36 módulos activables por empresa; recuperación de contraseña por correo; modo oscuro, UI móvil y demo fiel en `/demo`. |
| Conversaciones | WhatsApp Cloud API con alta guiada (Coexistence); Messenger e Instagram (en revisión de Meta); plantillas, ventana de 24 h, adjuntos, voz y notas internas; sugerencia con IA, asignación y tiempo real (SSE). |
| CRM | Contactos, campos personalizados y etiquetas; embudos y oportunidades; tareas y grupos; difusión, equipo y reportes; panel interno de Ámbar Rojo. |
| Bots e integraciones | API del bot compatible con Chatwoot (`/api/v1`) y canal API; integración con n8n; webhooks salientes; automatizaciones básicas con registro. |
| Dinero | Pagos en línea con Mercado Pago (en prueba en producción); CFDI 4.0 con timbrado simulado; caja de mostrador con turnos, cortes y modo sin internet; cobros y mensualidades internos. |
| Agenda y móvil | Citas con reservas en línea y recordatorios; Google Calendar por usuario (producción, con Google en modo prueba); app móvil con login, bandeja, chat con adjuntos y voz, y push en código. |

### Los 36 módulos por área

| Área | Módulos | Estado |
|---|---|---|
| CRM y agenda (7) | Google Calendar, Clientes, Citas, Reservas en línea, Reseñas de Google, Lealtad, Cotizaciones | Implementados. Calendar en producción con Google en modo prueba; Lealtad usa Aurum y falta su prueba con cuenta real. |
| Marketing y crecimiento (3) | Campañas de envío, Marketing, Meta Ads | Campañas de envío solo para una organización. Marketing y Meta Ads: trabajo interno de la fase 3A; la conexión y publicación reales con Meta están pendientes. |
| Ámbar Rojo (5) | Servidores, Servicios contratados, Cobros y fechas de pago, Facturación CFDI, Panel Ámbar Rojo | Implementados para uso interno. Servidores solo en la organización de la plataforma; CFDI con timbrado simulado. |
| Retail y comercio (6) | Productos e inventario, Compras y proveedores, Ventas y pedidos, Pagos en línea, Pedidos en línea, Caja de mostrador | Implementados: devoluciones, apartados y fiado, precios y promociones, reportes, varias cajas y modo sin internet opcional. Pagos en línea en prueba. |
| Clínica (1) | Pacientes | Implementado; se usa junto con Citas. |
| Automotriz (1) | Automotriz | Implementado. |
| Inmobiliaria (1) | Inmobiliaria | Implementado. |
| Legal (4) | Expedientes legales, Asesorías legales, Honorarios y caja, Operación del despacho | Implementados. |
| Viajes y tours (3) | Tours y salidas, Reservas y viajeros, Cobranza de viajes | Implementados. |
| Educación y academias (5) | Alumnos, Cursos y grupos, Inscripciones, Colegiaturas, Asistencia | Implementados. |

Pagos en línea y Google Calendar se configuran en Configuración → Módulos y no aparecen en el menú lateral.

### Lo que estamos por hacer

**Plan P0 de competitividad** (una fase por ejecución de Codex, con revisión de Julio entre fases):

| Fase | Tema | Estado hoy |
|---|---|---|
| 1 | Pagos en línea | Mercado Pago en prueba. Stripe en desarrollo; después, comparativa de Conekta, OpenPay, PayPal y Clip. Falta IVA por producto, comisión de la pasarela y anticipos de citas. |
| 2 | Facturación CFDI 4.0 | Fase 2A con timbrado simulado hecha. Falta conectar un PAC real (Facturama es la opción provisional). |
| 3 | Google Calendar bidireccional | Hecho y por usuario. Falta verificar la app en Google (video de demostración). |
| 4 | Email como canal | Por hacer. |
| 5 | Integraciones (Zapier / Make) | Por hacer. Ya hay webhooks salientes y API del bot como base. |
| 6 | Meta Ads y leads reales | Parte interna hecha. Faltan conexión, métricas y leads reales, que dependen de los permisos de Meta. |
| 7 | Automatizaciones visuales | Por hacer. Hoy hay automatizaciones básicas. |
| 8 | Reportes personalizados, metas y pronóstico | Por hacer. Hoy hay reportes de retail. |

Fuera del P0: constructor no-code completo, contabilidad y nómina, SSO empresarial (solo si un cliente lo exige).

**Otros planes en marcha**

- **App móvil (8 semanas, con 2 de colchón):** semana 4 MVP interno; semana 5 beta para los 2 clientes que la pidieron; semana 6 primer envío a las tiendas; después (v1.1) Contactos, Tareas, Kanban y módulos por empresa, empezando por Citas.
- **Revisiones externas:** permisos de Meta (WhatsApp, Messenger, Instagram, Ads) con su video; verificación de Google para abrir Calendar a todos (video, justificación y dominio); Apple y Google Play (cuenta demo, privacidad, eliminación de datos).
- **Cobros:** IVA por producto y desglose en la venta (con efecto en CFDI); comisión de la pasarela, absorberla o trasladarla como cargo visible; anticipo de citas y cotizaciones pagadas. Cada cliente cobra con su propia cuenta: el dinero va directo a ella y Ámbar Rojo no custodia fondos.
- **Pendientes externos por acreditar:** pruebas con Aurum real, piloto con proveedores reales, ensayo de migración con respaldo real y cobro de prueba de punta a punta con Mercado Pago.
- **Equipo:** accesos, usuarios en `demo-meta`, Firebase y una Mac para iOS; elegir proyecto entre app y backend.
- **Mejoras técnicas conocidas:** evitar citas duplicadas de eventos compartidos entre dos calendarios; renombrar la variable de cifrado que el calendario comparte con pagos; actualizar la documentación de arquitectura de la app.

## Dónde necesitamos ayuda

**App móvil (B):** Contactos (lista, búsqueda, detalle, edición); Tareas (ver y completar, filtros hoy/vencidas); Kanban (ver embudos y mover tarjetas); push en iOS y pruebas en celulares reales; módulos por empresa (primero Citas, después Cobros); actualizar `docs/ARQUITECTURA.md` y `AGENTS.md`, que aún dicen que el chat está vacío.

**Backend + web (A):** `GET /api/movil/modulos` para que la app sepa qué módulos tiene cada empresa; revisar que las rutas de Citas y Cobros acepten el token Bearer de la app; IVA por producto y desglose en la venta (y su efecto en CFDI); revisión de Stripe y demás proveedores; pruebas de flujos completos con una base local desechable.

**Julio prepara:** un usuario por persona en `demo-meta`, accesos a repos y canal, Firebase (`google-services.json` por canal privado) y una Mac para iOS. **Por confirmar:** si la cuenta de Google Play es personal u organización (cambia cuántos testers exige Google). Julio avanza además con la verificación de Google (video) y la revisión de permisos de Meta; no dependen del equipo.

## 2. Proyecto A: backend + web (`AmbarCRM/web`)

### Stack y mapa

| Pieza | Versión declarada en `web/package.json` | Para qué sirve |
|---|---:|---|
| Next.js | ^16.3.8 | Web y rutas API en el mismo proyecto. |
| React / React DOM | ^19.2.1 | Interfaz web. |
| TypeScript | ^5.5.4 | Tipado de UI, servicios y API. |
| Prisma / Prisma Client | ^5.18.0 | Modelos y acceso a PostgreSQL. |
| PostgreSQL (`pg`) | ^8.12.0 | Conexiones SQL directas usadas por algunos procesos. |
| NextAuth | ^4.24.15 | Sesión de la web. |
| Tailwind CSS | ^3.4.7 | Estilos. |

Las versiones con `^` son rangos declarados, no garantía de que el despliegue use exactamente esa versión. El proyecto además integra Meta/WhatsApp, n8n por webhooks, SSE, pagos y cron.

- `web/src/app/(app)`: páginas de la aplicación; `web/src/app/api`: handlers HTTP, incluidos módulos, conversaciones y `/api/movil/*`.
- `web/prisma/schema.prisma`, `web/prisma/sql/`: modelos y SQL de tenant/actualizaciones. `web/src/lib/`: acceso a datos, auth, módulos y reglas de negocio.
- `web/src/app/api/cron/`: rutas de trabajos programados (por ejemplo, recordatorios de citas y vencimientos). La programación/llamada puede depender de configuración externa; no se confirmó aquí el scheduler de producción.
- `web/scripts/` y `web/prisma/scripts/`: checks y pruebas, incluidas pruebas de integración/concurrencia.
- `docker-compose.yml`, `Dockerfile`, `schema.sql`, `deploy/`: stack local de Docker y arranque/migración.

### Multi-tenant sin jerga

`org_id` identifica la empresa propietaria de una fila. PostgreSQL usa `app.current_org` como contexto de la petición y aplica RLS (*Row-Level Security*): las políticas filtran lecturas y validan escrituras para que una empresa no vea ni modifique filas de otra. `web/src/lib/db.ts` establece el contexto en la transacción. La conexión de la app debe usar el rol `crm_app`, que no puede saltarse RLS.

Error típico: consultar o insertar sin el contexto/`org_id` correcto, o conectar la app como dueño de la base de datos. Puede causar datos no visibles o, peor, romper el aislamiento. Las claves foráneas por sí solas no aíslan tenants: las tablas de negocio también necesitan `org_id` y política RLS.

### Módulos y trabajo

El catálogo `web/src/lib/modulos-catalogo.ts` registra **36 claves**. La administración de plataforma activa cada módulo por organización; las páginas y APIs deben comprobar que está activo. Ejemplos reales:

| Módulo | Carpeta de páginas |
|---|---|
| Clientes | `web/src/app/(app)/clientes/` |
| Automotriz | `web/src/app/(app)/automotriz/` |
| Cotizaciones | `web/src/app/(app)/cotizaciones/` |
| Marketing | `web/src/app/(app)/marketing/` |
| Facturación CFDI | `web/src/app/(app)/facturas/` |

El catálogo y la cantidad se verificaron en código; los módulos transversales pueden no tener una carpeta con el mismo nombre exacto. Trabajo tangible: endpoints y permisos para móvil; módulos nuevos o ajustes de módulos; integración de pagos; calendario; CFDI. Tamaño orientativo en la comparativa.

### Local, validación y despliegue

El compose de la raíz crea PostgreSQL 16, aplica el esquema/migración inicial en un volumen vacío, ejecuta `actualizaciones.sql` y arranca la web. Para usar **una BD local desechable**, prepara el archivo local de variables ignorado por Git con valores de desarrollo y credenciales ficticias; no uses valores de producción. Luego, desde la raíz:

```bash
docker compose -p ambarcrm-local up -d --build
```

El proyecto `ambarcrm-local` separa los recursos del compose. Al terminar y querer borrar esa BD local, desde la raíz:

```bash
docker compose -p ambarcrm-local down -v
```

La configuración requerida está declarada en `docker-compose.yml` y `DESPLIEGUE.md`; si no se tiene experiencia con Docker/env vars, pedir a Julio el set de desarrollo. No ejecutar seeds ni comandos de despliegue contra un host real. `npm run dev` dentro de `web/` también está definido, pero necesita una PostgreSQL configurada.

Scripts de revisión: `npm run lint`, `npx tsc --noEmit`, `npx prisma validate`, `npm run build`. Hay checks específicos como `npm run check:app-movil`, `check:app-movil-http`, `check:pagos-online`, `check:cfdi`, `check:calendario` y `test:calendario:e2e`. Un check verde valida ese alcance, no sustituye pruebas de flujo completo. “Hecho” implica revisar cambios, validar tenant/permisos, pruebas relevantes y revisión de PR; no se encontró una definición global única de hecho para la web.

Producción corre con Docker/EasyPanel y **despliega la rama `meta-tech-provider`** (verificado en el servidor); el redeploy lo hace Julio a mano en EasyPanel, y si un push lo dispara solo no está verificado. Nadie hace push a `meta-tech-provider` ni a `main`: todo va por PR y lo fusiona Julio. El compose solo pasa al contenedor las variables que lista en `docker-compose.yml`: una variable nueva debe agregarse ahí. El riesgo principal es exponer datos de otra empresa o afectar conversaciones, cobros o inventario; por eso usar rama por tarea y BD local.

## 3. Proyecto B: app Flutter (`ambarcrm-app`)

### Stack y arquitectura

`pubspec.yaml` declara Dart `^3.11.0` y paquetes Flutter: `provider` (estado), `dio` (HTTP), `go_router` (rutas), `flutter_secure_storage` (sesión), `hive`/`hive_flutter` (caché), `intl` (fechas/formatos), `firebase_core`/`firebase_messaging`/`flutter_local_notifications` (push), `image_picker`/`file_picker` (adjuntos), `record`/`just_audio` (grabar y reproducir audio), `video_player`, `open_filex`, `url_launcher` y `path_provider` (archivos y sistema). Versiones concretas están en `pubspec.yaml` y `pubspec.lock`.

El flujo previsto es UI → estado → repositorio `data` → `core/api`; `core/` guarda cliente, errores, sesión, modelos y utilidades compartidas. Cada funcionalidad vive en `lib/features/<area>`. Para agregar una pantalla, crea sus modelos/repositorio, estado y UI en esa feature, conecta la ruta en `lib/rutas.dart` y llama al repositorio desde la pantalla/estado, no a Dio directamente. Ejemplo ya implementado: `lib/features/chat/data/chat_repo.dart` llama a API; `chat_provider.dart` coordina estado; `ui/pantalla_chat.dart` presenta el chat. Arquitectura y código coinciden aquí; el documento `docs/ARQUITECTURA.md` está atrasado al decir que chat está vacío.

### Qué funciona y qué falta (según código)

- **Implementado:** login por empresa/correo/contraseña; token en almacenamiento seguro, renovación al iniciar y cierre de sesión; bandeja con búsqueda/filtros; detalle y envío de texto; adjuntos, voz, plantillas y lógica de ventana de 24 horas en chat; SSE con reconexión; push Firebase y apertura del chat desde la notificación; pantalla de ajustes.
- **Parcial / no verificado extremo a extremo:** hay código de push y su registro contra la API, pero la recepción real depende de la configuración Firebase/APNs del equipo. Chat dispone de controles y acciones, pero no se confirmó aquí el flujo real con cuenta Meta/WhatsApp.
- **Esqueleto:** `lib/features/contactos/ui/pantalla_contactos.dart`, `kanban/ui/pantalla_kanban.dart` y `tareas/ui/pantalla_tareas.dart` muestran “Próximamente”. Hay una pantalla de perfil de contacto y código de datos asociado, pero no convierten esas secciones en listas completas; confirmar alcance con Julio.
- No se encontró implementación de selección de módulos por empresa en la app. No hay registro de cuentas en móvil; las cuentas las crea la empresa.

### Conexión y primeros pasos

`lib/core/config/entorno.dart` permite cambiar el host con `--dart-define=API_URL=...` (por defecto apunta al host compartido). `ClienteApi` agrega `Authorization: Bearer` y trata 401; el token vive en `flutter_secure_storage`. `EventosApi` abre `/api/stream` por SSE; al volver de segundo plano se debe recuperar estado, pues el SO puede cerrar la conexión. Push usa Firebase y endpoints de dispositivo. No copiar credenciales al repositorio.

```bash
flutter pub get
flutter run --dart-define=API_URL=https://<servidor-de-prueba>
```

Usar únicamente la org de demostración `demo-meta` y credenciales de prueba proporcionadas por Julio. Para Firebase la app puede requerir configuración local que no se incluye en el repo. `flutter analyze` y `flutter test`; las reglas del equipo piden probar en dispositivo Android real antes del PR. Ramas por tarea (`feat/...`), Conventional Commits, PR de una sola cosa (aprox. hasta 400 líneas), Julio revisa/mergea, no push a `main` ni `develop`, no secretos, no paquetes nuevos sin justificar.

Trabajo disponible: media/voz en chat y ventana de 24 h; push iOS/APNs; implementar listas y edición de contactos; tareas; Kanban; preparar publicación en tiendas. El plan reparte el chat a una persona y backend/push/CRM a otra, pero esa asignación es una propuesta, no el estado del código.

## 4. Cómo se conectan

```text
Flutter ── Bearer / HTTPS ──> Next.js /api/movil/* y APIs compartidas
  │                              │
  ├── SSE /api/stream <──────────┤── PostgreSQL (org_id + RLS)
  └── token FCM ────────────────> Firebase ── push al teléfono
```

Existen rutas móviles para login/renovar/logout, dispositivo, conversaciones, contactos, embudos, etiquetas, tareas y usuarios (`web/src/app/api/movil/`). El chat también usa APIs compartidas como `/api/conversaciones/:id`, `/api/mensajes/enviar` y `/api/stream`; confirmar cada contrato en `API-MOVIL.md` antes de consumirlo. No existe `GET /api/movil/modulos` en el contrato consultado ni en la lista de rutas: sería una propuesta útil para que la app adapte navegación a cada empresa, previa definición/revisión del endpoint.

## 5. Comparativa para decidir

| Criterio | Backend + web | App móvil |
|---|---|---|
| Qué se aprende | TypeScript, Next.js, PostgreSQL, RLS, APIs y reglas de negocio | Flutter/Dart, estado, UX móvil, HTTP/SSE, medios y Firebase |
| Habilidades necesarias | TS/Next y SQL se aprenden; entender tenant es obligatorio | Flutter ya lo saben; contrato HTTP, manejo de estado y configuración móvil |
| Riesgo de producción | Alto si se despliega código o se rompe aislamiento; trabajar solo en local/PR | Bajo mientras se usa demo; riesgo al cambiar API compartida o configuración de tienda |
| Resultado visible | Medio: UI de módulos aparece rápido; trabajo API/BD menos visible | Alto en UI móvil; chat y notificaciones se pueden mostrar en teléfono |
| Independencia | Media: cambios de dominio/RLS necesitan revisión experta | Alta en widgets/pantallas aisladas; rutas, `core` y backend requieren coordinación |
| Dependencia de Julio/Codex | Alta en decisiones de datos, RLS y despliegue | Media; alta en backend, Firebase, APNs y publicación |
| Tareas concretas hoy | API `GET /api/movil/modulos` (mediana); permisos/endpoint móvil (mediana); ajuste de calendario (mediana); módulo CFDI/pagos (grande) | Contactos (mediana); tareas (mediana); Kanban (mediana); push iOS (mediana); chat media/voz (mediana-grande) |

Estimaciones orientativas para una primera PR, no fechas del plan. Algunas tareas dependen de endpoints que ya existen; otras requieren coordinación backend.

### Si te gusta X, elige Y

- Si te gusta diseñar pantallas y probar rápido en un teléfono, App móvil.
- Si te interesa cómo se protegen datos y se modelan procesos para muchas empresas, Backend + web.
- Si quieres profundizar en Flutter, toma una feature móvil completa, empezando por Contactos, Tareas o Kanban.
- Si quieres aprender TypeScript, APIs y PostgreSQL con casos reales, toma un endpoint o módulo web pequeño.
- Julio decide junto con el equipo según intereses y disponibilidad.

## 6. Primeros 3 días

### Backend + web

1. Leer `README.md`, `MODULOS.md`, `MULTI-TENANT.md`, `DESPLIEGUE.md` y `API-MOVIL.md`.
2. Instalar Node compatible y Docker; pedir a Julio el set de variables **locales ficticias**.
3. Levantar PostgreSQL/web con el proyecto `ambarcrm-local`; confirmar que el entorno es local antes de navegar.
4. Ubicar un endpoint y su página/módulo relacionado; seguir la llamada hasta `src/lib` y Prisma.
5. Ejecutar lint, TypeScript, Prisma validate y el check específico de la tarea.
6. Tomar una tarea chica, crear rama `feat/...`, abrir PR con descripción y evidencia de validación.

### App móvil

1. Leer `AGENTS.md`, `CONTRIBUTING.md`, `docs/ARQUITECTURA.md` y el contrato `API-MOVIL.md` del repo/documentación compartida.
2. Instalar Flutter estable y Android Studio; conectar emulador o celular y revisar `flutter doctor`.
3. Ejecutar `flutter pub get`; solicitar a Julio acceso de prueba a `demo-meta` y configuración local Firebase si hace falta.
4. Correr con `API_URL` de prueba; verificar login y bandeja sin usar datos reales.
5. Elegir un cambio de UI acotado en Contactos, Tareas o Kanban y revisar la API existente antes de agregar llamadas.
6. Ejecutar `flutter analyze` y `flutter test`, probar en Android real y abrir PR chico hacia `main` (en el remoto no existe `develop`).

## No verificado / diferencias

- Producción despliega `meta-tech-provider` (verificado en el servidor); no se verificó si un `push` dispara el deploy automáticamente.
- No se comprobó el scheduler externo que invoca las rutas cron en producción.
- La app móvil se inspeccionó en código, sin ejecutar la app ni probar una cuenta real de Meta, FCM/APNs o tiendas. “Funciona” arriba significa que existe implementación, no certificación en producción.
- `docs/ARQUITECTURA.md` y `AGENTS.md` describen `chat/` vacío; el código actual contiene repositorios, estado, UI, adjuntos, audio y plantillas. La guía da prioridad al código.
- El plan menciona Contactos, Tareas y Kanban como trabajo; las pantallas actuales aún son placeholders aunque hay un perfil/contacto y rutas API disponibles.
- No existe endpoint móvil de módulos en las rutas inspeccionadas; `GET /api/movil/modulos` es una propuesta.
- La ubicación/estado de `ambarcrm-app` se leyó desde `D:\AmbarRojo\repos\ambarcrm-app`; no se verificó el enlace Git/PR entre los dos repos.
