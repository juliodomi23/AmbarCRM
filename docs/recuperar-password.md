# Recuperación de contraseña

Las páginas públicas son `/recuperar` y `/restablecer/[token]`. El login muestra la liga
solo cuando el servidor tiene los seis campos SMTP válidos. La configuración se documenta
en `DESPLIEGUE.md` y se pasa al servicio `app` desde `docker-compose.yml`.

## Decisiones de seguridad

- Solicitar siempre responde HTTP 200 con el mismo mensaje. Next `after()` consulta la
  cuenta y envía el correo después de responder: ni la existencia de la cuenta ni el
  tiempo del SMTP afectan la respuesta. Aplica 5 solicitudes por hora por IP y por
  organización/correo con el limitador en memoria existente (por proceso).
- Para solicitar, se resuelve la organización por slug como en el login. Para consumir,
  `resolve_org_by_password_hash` solo devuelve la organización de un hash vigente sin usar.
  Esta es la única operación con `SECURITY DEFINER`; tiene `search_path = public`, sin
  permiso para `PUBLIC` y con ejecución para `crm_app`. Las lecturas y escrituras posteriores
  fijan el contexto del tenant y respetan RLS. `crm_app` conserva `NOBYPASSRLS`.
- La FK compuesta `(usuario_id, org_id)` evita asociar un restablecimiento a un usuario
  ajeno, además de la política `org_isolation`. El índice único de `token_hash` es también
  su índice de búsqueda. El token original de 32 bytes solo viaja en el correo y formulario.
- Solicitar y consumir bloquean al usuario para serializar solicitudes concurrentes.
  Crear otro token invalida los anteriores sin usar. Consumir marca usado y cambia el hash
  bcrypt de costo 10 en una transacción; un segundo consumidor pierde. El enlace vence
  en 60 minutos y se comprueban otra vez los estados de usuario y organización al consumir.
- `emitidoAt` conserva la emisión de la sesión aunque NextAuth renueve `iat`. El callback
  JWT compara esa fecha con `password_cambiada_at` al revalidar, como máximo cada 5 minutos
  de uso, o al actualizar la sesión. Los JWT anteriores usan su `iat` como respaldo.
  Recuperar, cambiar desde perfil y reiniciar desde admin actualizan la fecha de cambio.
- El cambio desde perfil reemite únicamente su cookie cifrada, con emisión nueva, atributos
  de NextAuth y soporte de fragmentos. Las otras cookies conservan la emisión anterior.
  El payload de `update()` nunca permite renovar esa fecha. No se usa margen temporal.
- El aviso de seguridad sale después de confirmar la transacción. Un fallo SMTP deja un
  log genérico. No se registran correos, contraseñas, tokens ni enlaces; también se excluye
  `/restablecer/` de los logs de solicitudes de Next en desarrollo.

## Prueba desechable

El script requiere Node 22.19 o posterior y un ejecutor `tsx`, como los otros `check-*.ts`.
Por protección, rechaza cualquier conexión distinta de `localhost`/`127.0.0.1`, puerto
`55461`, base `crm_recuperar`, y exige el usuario `crm_app` para la aplicación.

Crear un contenedor nuevo con imagen local PostgreSQL 16, puerto ligado a `127.0.0.1:55461`,
usuario dueño `dueno`, contraseña `dueno_test` y base `crm_recuperar`. Inicializar en orden:

1. `schema.sql` de la raíz.
2. `web/prisma/sql/multi-tenant.sql`.
3. `web/prisma/sql/actualizaciones.sql`, tres veces para comprobar idempotencia.
4. Como dueño: `ALTER ROLE crm_app PASSWORD 'app_test';`.

Desde `web/`, en PowerShell:

```powershell
$env:DATABASE_URL='postgresql://crm_app:app_test@127.0.0.1:55461/crm_recuperar'
$env:ADMIN_DATABASE_URL='postgresql://dueno:dueno_test@127.0.0.1:55461/crm_recuperar'
npx prisma generate
npx tsx scripts/check-recuperar-password.ts
npx tsx scripts/check-proxy.ts
npx tsx prisma/scripts/test-aislamiento.ts
npx tsc --noEmit
npx eslint <archivos modificados>
npx next build
```

El script sustituye `nodemailer` por `scripts/lib/smtp-simulado.cjs` antes de cargar los
handlers. El transporte solo conserva mensajes en memoria y simula demoras y fallos;
no abre conexiones SMTP. Prueba flujo completo, vencimiento, reutilización y consumo
concurrente, identidad de respuesta, usuarios/organizaciones inactivos, ambos límites,
RLS/FK, revocación de JWT, cookies fragmentadas y visibilidad del login con y sin SMTP.

## Verificación de esta implementación (20 de octubre de 2026)

| Comando o comprobación | Resultado |
|---|---|
| `actualizaciones.sql` tres veces sobre schema + multi-tenant | OK |
| `scripts/check-recuperar-password.ts` | OK con SMTP simulado |
| `npx tsc --noEmit` | OK |
| `npx eslint` sobre los archivos modificados | OK |
| `scripts/check-proxy.ts` | OK |
| `prisma/scripts/test-aislamiento.ts` | OK, 85 tablas |
| `next build` (Turbopack predeterminado) | OK, sin red externa |
| HTTP sobre la app compilada en loopback | OK: páginas, recuperación, aviso, login y cambio de perfil conservando su sesión |

Para no usar red, se ejecutó `tsx` desde la caché local y el build recibió las fuentes ya
existentes mediante un servidor temporal en loopback. Turbopack falló inicialmente al
recibir rutas Windows de fuentes; al servir esos mismos archivos por HTTP local pasó.
No se cambiaron las fuentes de la aplicación. Nodemailer quedó resuelto en `package-lock.json`
desde metadatos locales; su paquete no estaba en caché y no se descargó. La instalación
normal de dependencias debe completarse antes de un futuro despliegue.

El trabajo se realiza en `codex/recuperar-password`, sin push ni despliegue. La BD y los
servidores temporales se eliminan al terminar; no se modifica ninguna base existente.
