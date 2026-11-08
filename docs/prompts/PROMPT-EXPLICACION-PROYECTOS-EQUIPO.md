# Prompt para Codex — Explicar AmbarCRM y la app móvil al equipo

> Copia todo este archivo en Codex. Es una tarea de **solo lectura y documentación**: no se cambia código.

---

## Objetivo

Julio tiene una reunión con 2 personas nuevas del equipo que saben Flutter. Necesitan entender los dos proyectos para **elegir en cuál les interesa más trabajar**. Escribe una guía clara, en español, para alguien con 1–2 años de experiencia, sin jerga innecesaria y con ejemplos concretos de archivos reales.

## Repos a leer

1. **Backend + web: AmbarCRM** → `D:\AmbarRojo\Documentos de ambar rojo\docs\08-productos-internos\AmbarCRM` (código en `web/`).
2. **App móvil** → `D:\AmbarRojo\repos\ambarcrm-app` (Flutter).

Empieza por: `README.md`, `MODULOS.md`, `MULTI-TENANT.md`, `DESPLIEGUE.md`, `API-MOVIL.md`, `PLAN-APP-MOVIL.md`, `PLAN-EQUIPO-APP-MOVIL.md` y `web/AGENTS.md` (la versión de Next.js tiene cambios; consulta `web/node_modules/next/dist/docs/` si necesitas confirmar algo). En la app: `AGENTS.md`, `CONTRIBUTING.md`, `docs/ARQUITECTURA.md`, `pubspec.yaml` y `lib/`.

## Reglas

- **Solo lectura.** Lo único que creas es el archivo de salida indicado abajo.
- **No leas ni cites** archivos `.env*`, `google-services.json`, llaves, tokens ni contraseñas. No imprimas ningún secreto aunque lo veas.
- No ejecutes nada contra producción ni contra bases de datos reales. Si necesitas correr algo, usa una base local desechable; si no hace falta, no corras nada.
- Todo lo que afirmes debe salir del código o los documentos. Si algo no lo pudiste verificar, escríbelo como "no verificado". No inventes funciones, números ni fechas.
- Cuando el código y un documento se contradigan, gana el código y lo señalas.

## Qué debe contener la guía

### 1. Qué es AmbarCRM (máx. 1 página)
Qué problema resuelve, para quién, y cómo se vende/usa (varias empresas en una misma instalación, cada una con sus módulos).

### 2. Proyecto A: Backend + web (`AmbarCRM/web`)
- Stack real (versiones de `package.json`) y por qué importa cada pieza.
- Mapa de carpetas: dónde vive la web, la API, la base de datos, los cron, las pruebas.
- **Multi-tenant explicado simple**: qué es `org_id`, qué es RLS, y qué error típico comete un principiante aquí.
- Módulos: cuántos hay, cómo se activan por empresa, 5 ejemplos con su carpeta.
- Cómo se despliega a producción y por qué hay que tener cuidado (qué rama despliega, qué pasa al hacer push).
- Cómo levantarlo en local, paso a paso (base desechable en Docker incluida).
- Cómo se prueba (scripts de `check:*` y e2e) y qué significa "hecho" aquí.
- Qué tipo de tareas hay hoy ahí (ejemplos: endpoints para la app móvil, módulos nuevos, pagos, calendario, CFDI).

### 3. Proyecto B: App móvil (`ambarcrm-app`)
- Stack y paquetes principales (`pubspec.yaml`) y para qué sirve cada uno.
- Arquitectura por funcionalidades (`lib/features/*`, `core`, `data`, `state`, `ui`): cómo se agrega una pantalla nueva, con un ejemplo real del repo.
- Estado actual: qué funciona hoy (login, sesión guardada, bandeja, chat, contactos, tareas, kanban, ajustes, push) y qué es solo esqueleto o falta. Verifícalo en el código, no en el plan.
- Cómo conecta con el backend (cliente HTTP, token, SSE en tiempo real, push).
- Cómo correrla: `flutter pub get`, `flutter run`, `API_URL`, org de demostración (`demo-meta`) sin dar credenciales.
- Pruebas y reglas del equipo (ramas, Conventional Commits, PR chicos, `flutter analyze`).
- Qué tareas hay hoy ahí (ejemplos: chat con media y voz, ventana de 24 h, push iOS, contactos, tareas, publicación en tiendas).

### 4. Cómo se conectan A y B
Un diagrama simple en texto (ASCII o Mermaid) del flujo: app → API `/api/movil/*` → base de datos, y push por Firebase. Aclara qué endpoints ya existen y cuáles faltan para los módulos (hoy la app no sabe qué módulos tiene cada empresa; propón brevemente un `GET /api/movil/modulos`).

### 5. Comparativa para decidir
Tabla con columnas **Backend + web** vs **App móvil**, filas:
- Qué se aprende
- Habilidades que se necesitan (Flutter ya lo saben; TypeScript/Next/Postgres no necesariamente)
- Riesgo de romper producción
- Qué tan rápido se ve el resultado
- Qué tan independiente se puede trabajar
- Cuánto depende de Julio/Codex para revisar
- Tareas concretas disponibles hoy (3–5 por proyecto, con tamaño estimado: chica/mediana/grande)

Cierra con una sección **"Si te gusta X, elige Y"** de 4–5 líneas, sin recomendar uno solo: Julio decide con el equipo.

### 6. Primeros 3 días
Para cada proyecto, una lista de 5–7 pasos para que una persona nueva tenga el proyecto corriendo y haga su primer PR chico.

## Formato de salida

Un solo archivo Markdown nuevo: `docs/GUIA-EQUIPO-AMBARCRM.md` dentro del repo AmbarCRM. Máximo ~6 páginas, con títulos claros, tablas donde ayuden y ejemplos de código/rutas reales. Sin relleno ni frases de marketing.

Al terminar entrega: la ruta del archivo, un resumen de 5 líneas y una lista de **lo que no pudiste verificar** o de contradicciones entre documentos y código.
