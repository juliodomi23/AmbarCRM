# Despliegue de módulos Ámbar Rojo

Checklist para Julio. Esta sesión solo prepara y prueba el merge local;
los comandos de producción siguientes no se ejecutaron.

1. **Respaldo manual antes del push/redeploy.** En la consola del servicio
   `backup` de EasyPanel, cambia `AAAA-MM-DD` por la fecha del despliegue:

   ```sh
   fecha=AAAA-MM-DD
   archivo="/backups/ambarcrm-pre-modulos-ar-$fecha.sql.gz"
   pg_dump --no-owner -f /tmp/ambarcrm-pre-modulos-ar.sql &&
     gzip -c /tmp/ambarcrm-pre-modulos-ar.sql > "$archivo" &&
     gzip -t "$archivo" && ls -lh "$archivo"
   ```

   Usa `PGHOST`, `PGUSER`, `PGPASSWORD` y `PGDATABASE`, ya mapeadas por
   `docker-compose.yml`; no copies credenciales al comando. Conserva el archivo
   fuera del VPS antes de continuar. Desde una terminal SSH del VPS, identifica
   el contenedor del servicio backup y copia el archivo:

   ```sh
   docker ps --format '{{.Names}}'
   docker cp CONTENEDOR_BACKUP:/backups/ambarcrm-pre-modulos-ar-AAAA-MM-DD.sql.gz /tmp/ambarcrm-pre-modulos-ar-AAAA-MM-DD.sql.gz
   ```

   Desde tu PowerShell local, sustituye usuario, host y fecha:

   ```powershell
   scp USUARIO@HOST:/tmp/ambarcrm-pre-modulos-ar-AAAA-MM-DD.sql.gz "$env:USERPROFILE\Downloads\ambarcrm-pre-modulos-ar-AAAA-MM-DD.sql.gz"
   ```

   Confirma que el archivo descargado existe y conserva una copia externa.

2. **Variables de entorno.** AR no necesita ninguna variable nueva en el
   compose: reutiliza `DATABASE_URL`, la sesión NextAuth, `WA_API_KEY` para el
   cron y la configuración/cifrado de Meta para recordatorios manuales.
   `ALLOW_DEMO_SEED=1` ya existe como autorización puntual de seeds; no se
   añade al compose ni activa recordatorios. El cron no envía WhatsApp.
   Revisados: `docker-compose.yml`, `web/Dockerfile`, generación de cobros y
   servicio de recordatorios.

3. **Despliegue y humo, en este orden.** Push de `modulos-fase-2` → redeploy
   en EasyPanel → comprobar logs de `db-migrate` y app (SQL sin errores,
   cliente Prisma compatible, conexión como `crm_app` sin BYPASSRLS) → humo
   manual de Villafuerte (login, lista de chats y un mensaje de prueba autorizado
   por Julio) → humo de `/contratos`, `/cobros`, `/panel-ar`. El servicio
   `db-migrate` aplica `actualizaciones.sql` antes de arrancar app. Las pantallas
   requieren módulos activos en la organización; después del seed, repetir
   esas tres vistas con la sesión de `ambar-rojo`.

4. **Seed de AR, una vez, desde la consola del servicio app (`/app`).**

   ```sh
   ALLOW_DEMO_SEED=1 node scripts/seed-ambar-rojo.mjs
   ```

   Crea el administrador con correo placeholder `admin@ambar-rojo.local.test`
   y muestra una contraseña aleatoria solo cuando crea el usuario. Conserva
   esa contraseña. Para escoger correo/contraseña al crear el usuario, el
   mismo script admite dos argumentos; una repetición no cambia la contraseña
   de un usuario existente. Solo toca `ambar-rojo`, no crea canales ni envía
   mensajes. Datos dudosos y pagos históricos sin fecha permanecen por confirmar.

   **Comprobar primero `printenv NODE_ENV`.** Compose y Dockerfile no fijan
   `NODE_ENV` para la consola; Next usa producción dentro de su proceso.
   Si EasyPanel u otra configuración sí exporta `NODE_ENV=production`, el
   comando se rechaza incluso con `ALLOW_DEMO_SEED=1`. En ese caso detener
   este paso y pedir una decisión sobre un seed operativo para producción.
   No se cambia `NODE_ENV` para saltar el bloqueo ni se modificó el código del
   seed en el merge. En la BD desechable se comprobaron ambos bloqueos y dos
   ejecuciones autorizadas, con conteos idénticos y otras orgs intactas.

5. **Marcha atrás.** Volver a desplegar `a0b5fe4` (referencia remota inicial
   de `modulos-fase-2`), conservando la BD. Las tablas de AR son aditivas y
   quedan sin uso con ese código. No borrar tablas ni ejecutar `reset --hard`
   o push forzado para esta operación. Restaurar la BD solo con la app detenida,
   pidiendo ayuda y verificando el respaldo externo antes de comenzar.

Ver las salidas literales y el resultado de la batería completa en
[pruebas del merge](pruebas-merge-ar-2026-10-13/README.md).
