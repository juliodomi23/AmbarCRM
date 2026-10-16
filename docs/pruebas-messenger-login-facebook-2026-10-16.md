# Pruebas · Messenger con Facebook Login · 16-oct-2026

Rama `messenger-login-facebook`, creada desde `modulos-fase-2`. Sin push, despliegue, cambios
en `meta-tech-provider`, acceso a producción ni uso de `ambarcrm-db`. No se añadieron librerías.

## Entorno y SQL

- PostgreSQL 16 desechable, contenedor `ambarcrm-prueba-facebook`, expuesto solo en
  `127.0.0.1:55450`. Rol de app `crm_app`, dueño `dueno` y secretos exclusivamente de prueba.
- Base creada con `schema.sql` → `web/prisma/sql/multi-tenant.sql` →
  `web/prisma/sql/actualizaciones.sql`. Este último se ejecutó tres veces sin error.
  No se usó `prisma db push`.
- SQL nuevo: tabla `messenger_login`, índice por empresa/vencimiento, DEFAULT de empresa,
  política RLS `org_isolation` y GRANT SELECT/INSERT/UPDATE/DELETE para `crm_app`.
- Al finalizar se elimina el contenedor desechable. El arranque HTTP fue rechazado antes de
  crear el proceso, por lo que no quedó una app de pruebas escuchando en el puerto 3118.

## Resultados

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | OK |
| `npm run build` (Prisma + Next/Turbopack) | OK |
| ESLint de los archivos de código modificados y pruebas nuevas | OK, sin advertencias |
| `prisma/scripts/test-canales-base.ts` | OK |
| `prisma/scripts/test-canales-api.ts` | OK |
| `prisma/scripts/test-canales-messenger.ts` | OK, incluida regresión manual y carrera del UNIQUE |
| `prisma/scripts/test-messenger-facebook.ts` | OK, Graph completamente simulado |
| `prisma/scripts/test-messenger-facebook-rutas.ts` | OK, handlers reales con sesión y Graph simulados, sin servidor |
| `prisma/scripts/test-aislamiento.ts` | OK, lectura y escritura en 81 tablas |
| `scripts/check-seguridad.ts` | OK |
| `prisma/scripts/test-messenger-facebook-http.ts` | Pendiente: requiere servidor local autorizado |
| `prisma/scripts/test-canales-e2e.ts` | Pendiente por la misma restricción de arranque HTTP |

La prueba del servicio cubre intercambio corto/largo mediante POST sin credenciales en URL,
lista con solo ID/nombre/foto, cifrado de tokens, estado ausente/incorrecto, separación de
sesión/usuario/empresa, página no autorizada, vencimiento antes/después de listar, 409 entre
empresas, reconexión sin duplicar ni conservar error de token vencido, app propia, errores
de permisos recortados, paginación sin seguir URLs de Meta y consumo concurrente del intento.
También comprueba que una edición manual simultánea impide sobrescribir la configuración.
Sin el consumo atómico dos peticiones podrían utilizar el mismo intento; con él, solo una
conecta. Sin la condición sobre la configuración anterior una edición simultánea se perdería;
con ella, devuelve 409.

La prueba de rutas cubre 401/403, solo admin, Origin ausente/ajeno, cookie httpOnly y
SameSite/Max-Age, CSRF, respuestas sin tokens, selección, limpieza de cookie, replay y límite
429 en ambos endpoints. Se simula `getServerSession`, conservando `requireSesion(true)` y
la lógica de las rutas. No sustituye una prueba de login NextAuth sobre HTTP real.

El UNIQUE que ejercita la regresión existente genera errores esperados de Prisma y la prueba
los verifica como 409. Un segundo build inicialmente encontró `EPERM` al regenerar la DLL
de Prisma mientras otra prueba la utilizaba; se repitió después, sin pruebas concurrentes,
y terminó correctamente.

## Lo no probado y reproducción HTTP posterior

No hubo llamadas reales a Graph. No se validaron popup/SDK real de Facebook, roles efectivos,
permisos/acceso avanzado, foto/nombre reales ni configuración del panel de Meta. La revisión
automática rechazó iniciar Next en `127.0.0.1:3118` con `blocked by policy`, sin motivo más
específico. No se intentó eludir ese rechazo. No se ejecutó la regresión completa de módulos
ajenos a canales ni la integración con Aurum real.

Cuando esté permitido iniciar un servidor local, usar **solo** la BD desechable del puerto
55450 y las variables de prueba, `NEXTAUTH_URL=http://127.0.0.1:3118`,
`META_APP_ID=123`, `META_APP_SECRET=secreto-meta-simulado` y
`MESSENGER_GRAPH_SIMULADO=1`. Arrancar desde `web/` con:

```text
node --import ./prisma/scripts/meta-facebook-simulado.mjs node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3118
```

En otra terminal, con las mismas variables y `E2E_BASE_URL=http://127.0.0.1:3118`:

```text
npx tsx prisma/scripts/test-messenger-facebook-http.ts
npx tsx prisma/scripts/test-canales-e2e.ts
```

El preload simula Graph únicamente cuando `MESSENGER_GRAPH_SIMULADO=1` y exige una BD en
55450. No forma parte del arranque normal de la app. Nunca configurarlo en producción.
