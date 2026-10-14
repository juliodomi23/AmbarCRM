# Despliegue de módulos Ámbar Rojo

Checklist para Julio. Los pasos 1–5 documentan el primer despliegue de AR.
Para el monitoreo de servidores de `56edbb9`, sigue la sección **Servidores**.
El merge y el push autorizado se verifican localmente; los comandos de producción
de esta guía no se ejecutaron.

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

## Servidores

Procedimiento manual para Julio después del push verificado. La org plataforma
es **id=1, slug `inicial`**, confirmado por Julio el 14-oct-2026. No se consultó
la BD de producción. `multi-tenant.sql` inicializa ese slug y `seed-admin.mjs`
usa org 1 por defecto. En cambio, `seed-ambar-rojo.mjs` usa `ambar-rojo` por
defecto y permite `ORG_SLUG`: ese valor predeterminado **no identifica por sí
solo la org plataforma**. Para este despliegue solo se ejecuta el seed de
servidores con `ORG_SLUG=inicial`; no hace falta volver a sembrar contratos/cobros.

1. **Respaldo previo al redeploy.** Usa el mismo procedimiento del paso 1 anterior
   en la consola del servicio `backup`, con sus variables PGHOST/PGUSER/PGPASSWORD/
   PGDATABASE ya mapeadas. Cambia la fecha y descarga el archivo fuera del VPS:

   ```sh
   fecha=AAAA-MM-DD
   archivo="/backups/ambarcrm-pre-modulos-ar-$fecha.sql.gz"
   pg_dump --no-owner -f /tmp/ambarcrm-pre-modulos-ar.sql &&
     gzip -c /tmp/ambarcrm-pre-modulos-ar.sql > "$archivo" &&
     gzip -t "$archivo" && ls -lh "$archivo"
   ```

   Copia con `docker cp` desde el contenedor backup al VPS y descarga con `scp`,
   como se indica arriba. Confirma que conservas el respaldo externo antes del
   redeploy.

2. **Redeploy y migración.** Redeploy de `modulos-fase-2` en EasyPanel. Revisados
   `docker-compose.yml`, `deploy/02-multitenant.sh` y `web/Dockerfile`:
   en cada despliegue que ejecuta el compose, `db-migrate` corre
   `psql -v ON_ERROR_STOP=1 -f /sql/actualizaciones.sql` con el dueño, cuando la BD
   está saludable. `app` depende de `service_completed_successfully`, así que
   arranca después de completar ese SQL. En un volumen nuevo, el init de Postgres
   aplica primero schema.sql, luego multi-tenant.sql y actualizaciones.sql.
   Reiniciar únicamente el proceso `npm start` no vuelve a correr la migración;
   debe recrearse/ejecutarse `db-migrate` como parte del redeploy. Confirma en sus
   logs que corrieron las tablas y función de heartbeat antes de usar las vistas.
   La app sigue conectándose como `crm_app`, sin BYPASSRLS; no ejecuta DDL ni
   `prisma db push` al arrancar. Servidores no necesita nuevas variables en el
   compose: utiliza DATABASE_URL, NextAuth y la WA_API_KEY existente.

3. **Seed, una vez, en la consola del contenedor web/app (`/app`).** Ejecutar con
   NODE_ENV **sin definir**, dentro de un subshell para no cambiar el entorno de
   la aplicación en ejecución. El slug real está indicado explícitamente:

   ```sh
   cd /app
   (
     unset NODE_ENV
     ORG_SLUG=inicial ALLOW_DEMO_SEED=1 node scripts/seed-servidores.mjs
   )
   ```

   Esto responde a la preparación autorizada por Julio; no se modificó la guarda.
   Con NODE_ENV=production el script rechaza incluso ALLOW_DEMO_SEED=1. Comprueba
   que informa `Seed inicial` y cuatro servidores nuevos, o conserva los nombres
   que ya existan. Solo acepta la organización id=1. No crea usuarios, cobros ni
   heartbeats, y no sobrescribe ediciones o activación de servidores existentes.

4. **Guardar los tokens inmediatamente.** Cada servidor nuevo imprime su token
   una sola vez, después de confirmar la transacción. Guarda cada token en el
   gestor de contraseñas, identificado con nombre e IP; no lo guardes en logs,
   tickets, Git ni workflows. No uses `tee` ni redirijas la salida de producción.
   Si un servidor ya existe, la segunda corrida no imprime su token: si falta,
   regénéralo desde `/servidores` y reemplázalo en el cron de ese VPS.

5. **Confirmar los datos ⚠️ antes de darlos por buenos.** Lista de la entrega de
   [servidores](pruebas-servidores-2026-10-14/README.md): compara **vence,
   costo_anual_mxn y cargas con la base real del panel original**. La copia local
   tenía cinco servidores y cero pagos; no representaba producción.

   - ⚠️ Ámbar Rojo: KVM 2 y fecha 2027-05-11 vienen del documento histórico.
     Confirmar renovación y costo real; todos los costos del seed quedan NULL.
   - ⚠️ Pie Feliz: **vence marzo 2027**, falta el día exacto; vence queda NULL con
     la nota del mes. Confirmar ambarcrm_demo y novegabienesraices.com.
   - ⚠️ Villafuerte: paga el cliente. Confirmar vencimiento/costo con él; no
     genera alerta de renovación pagada por AR.
   - ⚠️ Pruebas: AR/compartido, entorno no productivo. Confirmar reparto, costo
     y fecha.
   - ⚠️ Cargas de todos los VPS: validar contra producción, incluida Futura
     Fortuna en baja, panel Gestión y App 300 Lugares. Coparmex es una alianza
     sin contrato: aparece en texto; no se inventó un contrato ni deuda.
   - ⚠️ Revisar token de cada VPS e importar/configurar n8n antes del uso real.

6. **Heartbeat por VPS: seed → token en cron → comprobar reporte.** En el
   heartbeat.sh actual conserva las mediciones RAM, CPU, disco, RAM_TOTAL y UPTIME.
   Cambia la URL anterior con SERVER_ID por esta URL del CRM y pega el token
   exclusivo de ese servidor. No reutilices el token compartido de Gestión.

   | Servidor | IP | Token en el cron |
   |---|---|---|
   | VPS Ámbar Rojo | 31.220.49.58 | Token de VPS Ámbar Rojo |
   | VPS Villafuerte | 31.220.51.95 | Token de VPS Villafuerte |
   | VPS Pruebas | 77.37.67.251 | Token de VPS Pruebas |
   | VPS Pie Feliz | 187.77.20.78 | Token de VPS Pie Feliz |

   ```sh
   # CRM: URL real de AmbarCRM. TOKEN: el token exclusivo de este VPS.
   curl --fail-with-body -sS -X POST "$CRM/api/servidores/heartbeat" \
     -H "Content-Type: application/json" \
     -H "X-Heartbeat-Token: $TOKEN" \
     -d "{\"ram_pct\":${RAM:-0},\"cpu_pct\":${CPU:-0},\"disco_pct\":${DISCO:-0},\"ram_total_mb\":${RAM_TOTAL:-0},\"uptime_horas\":${UPTIME:-0}}"
   ```

   Conserva el cron existente, o programa el script cada cinco minutos si no
   estaba instalado. Después del primer reporte válido, abre `/servidores`
   como Administrador en `inicial`: debe pasar de gris a verde **si RAM y disco
   están por debajo de 80 %**. Si sale amarillo/rojo, revisa el motivo y las
   mediciones reales; no cambies los umbrales para ocultarlo. HTTP 201 indica
   reporte aceptado; antes de un minuto el duplicado recibe 204 sin cuerpo;
   token inválido, 401. Más de tres horas sin reportar se muestran en rojo.

7. **n8n, configurar después de verificar los reportes.** Crear un workflow de
   limpieza diario con Schedule Trigger y HTTP Request **POST** a
   `${AMBARCRM_URL}/api/cron/limpiar-heartbeats`. Seleccionar una credencial
   HTTP Header Auth: header `x-api-key`, valor WA_API_KEY del CRM. Revisar
   `ok`, `eliminados` y `empresasConError`; retiene 30 días de histórico.
   Importar [ALERTAS-Diarias-WhatsApp.json](n8n/ALERTAS-Diarias-WhatsApp.json),
   configurar AMBARCRM_URL en n8n y seleccionar la misma credencial para
   GET `/api/panel-ar/alertas`. Conectar el envío del equipo y revisar destinatario
   antes de activarlo. El JSON queda inactivo y sin secretos; **la importación
   no debe ejecutar el flujo**. La prueba local no importó ni ejecutó n8n.

Las pruebas del fast-forward y del seed, con tokens omitidos, quedan en
[pruebas-merge-servidores-2026-10-14](pruebas-merge-servidores-2026-10-14/README.md).

8. **Marcha atrás de Servidores.** Redesplegar `adc0836` (último commit antes de
   servidores), conservando la BD. Las tablas `servidores` y `heartbeats_servidor`
   son aditivas y quedan sin uso con ese código; los VPS recibirán 404 en el
   heartbeat sin afectar nada más. No borrar tablas ni usar `reset --hard`/push forzado.
