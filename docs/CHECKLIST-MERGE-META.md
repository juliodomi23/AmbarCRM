# Checklist único para el despliegue después de Meta

**Preparado, no ejecutado.** Usar solo cuando Julio confirme la aprobación de
Meta y autorice la ventana de mantenimiento. No ejecutar tests ni seeds de demo
contra producción. Esta lista conserva respaldo → despliegue → migración →
Villafuerte → AR de [DESPLIEGUE-MODULOS-AR.md](DESPLIEGUE-MODULOS-AR.md).
Para este salto completo, la fuente final será `meta-tech-provider` tras el
fast-forward; las referencias antiguas de los despliegues parciales de AR no
son el punto de regreso de este despliegue.

Antes de empezar: 🛑 Julio confirma URL HTTPS del CRM, host SSH, servicio Compose
en EasyPanel y nombres reales de los contenedores `backup` y `app`. No se
descubrieron consultando producción. Conservar esos valores en la bitácora de
la ventana; los nombres de ejemplo no son comandos listos para pegar.

En PowerShell local, desde la raíz del repositorio:

```powershell
$CRM = (Read-Host 'Origen HTTPS del CRM').TrimEnd('/')
$Vps = Read-Host 'USUARIO@HOST del VPS'
$Backup = Read-Host 'Nombre real del contenedor del servicio backup'
$App = Read-Host 'Nombre real del contenedor del servicio app'
$Fecha = Get-Date -Format 'yyyy-MM-dd-HHmm'
$Nombre = "ambarcrm-pre-merge-meta-$Fecha.sql.gz"
```

Los pasos de panel y navegador indican la acción exacta porque el repo no
contiene una API/CLI de EasyPanel verificada. No se inventa un comando de redeploy.
Abrir `/bin/bash` para los bloques de consola del servicio `backup` que usan `read`.

- [ ] **1. Respaldo verificado y externo, antes de modificar nada.** En la consola
  del servicio `backup` de EasyPanel, definir `archivo` con el mismo `$Nombre`
  registrado arriba. Usa las variables PG ya mapeadas, sin copiar contraseñas:

  ```sh
  read -r -p 'Nombre del respaldo .sql.gz registrado en la bitácora: ' nombre
  archivo="/backups/$nombre"
  pg_dump --no-owner -f /tmp/ambarcrm-pre-merge-meta.sql &&
    gzip -c /tmp/ambarcrm-pre-merge-meta.sql > "$archivo" &&
    gzip -t "$archivo" && sha256sum "$archivo" && ls -lh "$archivo"
  ```

  Descargar desde PowerShell local:

  ```powershell
  ssh $Vps "docker cp '${Backup}:/backups/$Nombre' '/tmp/$Nombre'"
  scp "${Vps}:/tmp/$Nombre" "$env:USERPROFILE/Downloads/$Nombre"
  Get-FileHash "$env:USERPROFILE/Downloads/$Nombre" -Algorithm SHA256
  ```

  Esperado: `pg_dump` y `gzip -t` terminan en 0, archivo no vacío, SHA256 local
  idéntico al del VPS. Guardar copia externa y commit anterior:
  `git rev-parse meta-tech-provider`. En esta preparación es
  **`e1c5e93ef2f85224d67ddc06b8def2375294f892`**. 🛑 Si cambió, reevaluar el ensayo
  y registrar el nuevo punto de regreso antes de continuar.

- [ ] **2. Verificar RLS y tokens legacy, solo lectura.** Subir los scripts antes
  del merge, pues la versión anterior no los contiene:

  ```powershell
  scp scripts/pre-merge/verificar-rls.sql scripts/pre-merge/canales-token-legacy.sql "${Vps}:/tmp/"
  ssh $Vps "docker cp /tmp/verificar-rls.sql '${Backup}:/tmp/verificar-rls.sql'"
  ssh $Vps "docker cp /tmp/canales-token-legacy.sql '${Backup}:/tmp/canales-token-legacy.sql'"
  ```

  En la consola del servicio `backup`, introducir de forma oculta la URL interna
  que usa `app`, obtenida del panel; no pegar su valor en la bitácora:

  ```sh
  read -r -s -p 'DATABASE_URL de app: ' URL_APP; printf '\n'
  URL_APP_PSQL="${URL_APP%\?schema=public}"
  PGOPTIONS='-c default_transaction_read_only=on' psql "$URL_APP_PSQL" -X -v ON_ERROR_STOP=1 -f /tmp/verificar-rls.sql
  unset URL_APP URL_APP_PSQL
  PGOPTIONS='-c default_transaction_read_only=on' psql -X -v ON_ERROR_STOP=1 -f /tmp/canales-token-legacy.sql
  ```

  Esperado RLS: rol de app `crm_app`, `f/f/f/0/0` y cero contactos sin empresa.
  Tokens: la consulta con dueño cubre todas las organizaciones y no imprime
  credenciales. Ideal: `con_token_plano=0`, `solo_plano=0`.
  🛑 Si hay bypass o tablas sin RLS, detener el despliegue. Si hay tokens en claro,
  Julio decide reconectar esos canales o conservar temporalmente la compatibilidad
  documentada en [canales-token-legacy.md](canales-token-legacy.md); no ejecutar
  un UPDATE improvisado. Mantener la misma clave de cifrado en el panel.

  🛑 Antes de pasar al merge, ensayar el respaldo real en un Postgres aislado con los
  [comandos preparados](ensayo-migracion-pre-merge-2026-10-17.md#límite-y-ensayo-con-respaldo-real-posterior),
  conforme a `PLAN-CIERRE-FASE-2.md` §3.5: la evidencia sintética no sustituye
  ese ensayo, ni verifica el volumen/estado real. Restaurar solo en una BD
  desechable y aplicar el SQL sin `--single-transaction`; comprobar permisos de
  bots, conteos, fechas y aislamiento antes de continuar.

- [ ] **3. Variables en EasyPanel; no editar `.env` en el VPS.** Desde `web/`, local:

  ```powershell
  npx --yes tsx ../scripts/pre-merge/check-env-despliegue.ts
  ```

  Esperado: `faltantesObligatorias: []`, `META_APP_ID` y `META_APP_SECRET` mapeadas
  en `runtime`. En EasyPanel → servicio Compose → Environment, confirmar valores
  reales de ambas y de `MESSENGER_VERIFY_TOKEN`, `META_TOKEN_ENCRYPTION_KEY`,
  `NEXTAUTH_URL` HTTPS, `NEXTAUTH_SECRET`, `WA_API_KEY`, `IP_HEADER`, credenciales
  PostgreSQL y admin. Conservar las de WhatsApp y `NEXT_PUBLIC_META_*` del build.
  `IP_HEADER=cf-connecting-ip` solo si el proxy es Cloudflare y sobrescribe esa
  cabecera; en otro caso, comprobar `x-real-ip`. Los defaults opcionales de bot/IA
  sin mapeo se enumeran en el informe; ponerlos solo en el panel no los propaga.
  Esperado: configuración guardada, sin rotar accidentalmente claves existentes.

- [ ] **4. Merge fast-forward, local, después de las comprobaciones anteriores.**

  ```powershell
  git status --short
  git merge-base --is-ancestor meta-tech-provider preparar-merge-meta
  if ($LASTEXITCODE -ne 0) { throw 'La historia dejó de permitir fast-forward' }
  git switch meta-tech-provider
  git merge --ff-only preparar-merge-meta
  git log -1 --oneline
  ```

  Esperado: árbol limpio antes del cambio y `Fast-forward`. Esto incluye los
  módulos y esta preparación. Si hay cambios ajenos o historia divergente,
  detenerse; no resolver con reset, rebase o push forzado.

- [ ] **5. Push de la rama de despliegue, expresamente autorizado en esa ventana.**

  ```powershell
  git push origin meta-tech-provider
  git rev-parse meta-tech-provider
  git ls-remote origin refs/heads/meta-tech-provider
  ```

  Esperado: mismo SHA local/remoto; guardar el SHA nuevo en la bitácora.

- [ ] **6. Redeploy desde EasyPanel.** Proyecto CRM → servicio Compose → Source:
  rama `meta-tech-provider` → guardar → **Deploy**. Esperado: el panel construye
  el SHA registrado, ejecuta/recrea `db-migrate` y arranca `app` al finalizar.
  Reiniciar solo `npm start` no ejecuta la migración. No ejecutar `prisma db push`.

- [ ] **7. Logs de migración y app.** EasyPanel → servicio Compose → logs del
  contenedor `db-migrate`: `psql -v ON_ERROR_STOP=1 -f /sql/actualizaciones.sql`.
  Alternativa desde PowerShell, usando el nombre de ese contenedor que muestre el panel:

  ```powershell
  $Migracion = Read-Host 'Nombre del contenedor db-migrate de este redeploy'
  ssh $Vps "docker logs '$Migracion'"
  ssh $Vps "docker inspect --format '{{.State.ExitCode}}' '$Migracion'"
  ssh $Vps "docker logs --tail 100 '$App'"
  ```

  Esperado: salida 0, DDL/GRANT completados y ninguna línea `ERROR`; `NOTICE ...
  already exists` es normal. Confirmar `app` lista, sin fallos Prisma. Copiar la
  salida de migración a la bitácora, sin variables ni tokens. Si el panel no
  ejecutó `db-migrate`, detener el humo hasta corregir el redeploy.

- [ ] **8. Humo de Villafuerte primero.** Abrir `${CRM}/login`, entrar con la
  organización y cuenta autorizadas de Villafuerte; después, en el navegador:
  `location.assign('/chat')`. Esperado: lista de chats existente e histórico
  intacto. Enviar desde el número de prueba autorizado un texto identificable,
  verlo una vez y responder desde el CRM dentro de 24 h; confirmar recepción y
  operación habitual del bot. No usar destinatarios reales sin la autorización
  puntual de Julio. Si falla, no seguir con AR y evaluar marcha atrás.

- [ ] **9. Humo de AR en `/contratos`, `/cobros`, `/panel-ar`.** Entrar en la org
  plataforma confirmada `inicial` (id=1) con puesto Administrador. En la consola
  del navegador autenticado, hacer únicamente lecturas:

  ```js
  for (const ruta of ["/contratos", "/cobros", "/panel-ar"]) {
    const r = await fetch(ruta, { redirect: "manual" });
    console.log(ruta, r.status);
  }
  ```

  Esperado: tres HTTP 200; abrir las tres páginas y verificar contratos, saldos y
  MRR contra la bitácora previa. No volver a sembrar AR para hacer pasar el humo.
  Si faltan módulos/datos, revisar la guía de AR y obtener decisión de Julio;
  no confundir `ambar-rojo` del fixture local con el slug real `inicial`.

- [ ] **10. Humo de un canal Messenger de prueba.** Usar exclusivamente la página
  y organización de pruebas confirmadas para App Review. Abrir
  `${CRM}/configuracion`, elegir Messenger, «Conectar con Facebook» → «Iniciar
  sesión en Facebook» → «Elegir página». Esperado: conexión exitosa. Enviar desde
  el perfil de prueba, recibir en `/chat`, responder manualmente dentro de 24 h
  y confirmar entrega sin duplicados. Comprobar firma/rechazos con las pruebas
  locales, sin enviar peticiones de prueba malformadas a producción.
  Después, en la tarjeta de ese canal Messenger de prueba, pulsar «Desconectar»,
  confirmar y elegir «Conservar historial». Esperado con token válido: toast de
  desconexión de Facebook, canal ausente en la lista y conversaciones/mensajes
  anteriores conservados. Si aparece aviso de token invalidado/página no disponible,
  el retiro es local (`desuscrito:false`), sin afirmar cancelación remota confirmada.
  Ante fallo temporal, debe informar el error y mantener canal e histórico para
  reintentar. No desconectar ningún canal de cliente para este humo.
  Solo para soporte, fuera del humo: [retiro forzado de Messenger](canales-decisiones.md#retiro-forzado-de-messenger--17-oct-2026) tras 502 y confirmación; puede dejar la suscripción activa en Facebook.
  🛑 Si Messenger aún no tiene el acceso que exige Meta, probar solo con roles
  habilitados en la app; no ofrecerlo a clientes ni usar HUMAN_AGENT sin aprobación.

- [ ] **10b. Instagram de prueba (opcional hasta disponer de cuenta real).**
  🛑 Julio confirma una cuenta profesional enlazada a una página y la app propia
  de pruebas. Revisar en Meta permisos efectivos (`instagram_basic`,
  `instagram_manage_messages` y los demás que Meta exija), acceso a mensajes,
  token de página, callback `/api/instagram/webhook` y verify token existente de
  Messenger. No usar un canal de cliente ni hacerlo como parte de la regresión local.
  Conectar manualmente en Configuración → Instagram. Enviar un DM desde el perfil
  de pruebas, comprobar una sola entrada en chat y responder dentro de 24 h.
  Probar imagen y un adjunto compartido: si no es compatible debe aparecer un
  marcador. Confirmar con el panel y la cuenta que `/me/messages`, IGSID, perfil
  y suscripción `messages` corresponden al flujo elegido.
  HUMAN_AGENT solo si la app tiene habilitación; nunca usarlo para bots.
  Confirmar ausencia de duplicados y aislamiento; revisar que conectar o retirar
  Instagram no altere Messenger si comparten página/app. Desconectar conservando
  historial; ante 5xx debe conservar canal, y un retiro forzado requiere confirmar
  que podría dejar la suscripción en Facebook. Los supuestos siguen **no
  verificados** hasta completar este humo y anotar su resultado.

- [ ] **11. Marcha atrás preparada: restaurar respaldo y volver al código anterior
  de `meta-tech-provider`.** 🛑 Julio decide ejecutarla y acepta la pérdida de los
  cambios posteriores al respaldo. Detener recepción/escrituras y `app` desde
  EasyPanel; conservar un dump adicional del estado fallido para recuperar esas
  operaciones si hiciera falta. Detener también tareas que escriban en la BD.
  Verificar de nuevo el respaldo externo del paso 1 y su SHA256.

  En la consola del servicio `backup`, con `PGHOST/PGUSER/PGPASSWORD/PGDATABASE`
  ya definidos, tras confirmar la ventana y la BD correcta:

  ```sh
  read -r -p 'Ruta /backups del respaldo verificado: ' archivo
  test -s "$archivo" && gzip -t "$archivo" || exit 1
  printf 'Se restaurará %s en %s/%s\n' "$archivo" "$PGHOST" "$PGDATABASE"
  read -r -p 'Escribe RESTAURAR para reemplazar esa BD: ' respuesta
  test "$respuesta" = RESTAURAR || exit 1
  dropdb --force --maintenance-db=postgres "$PGDATABASE" &&
    createdb --maintenance-db=postgres --owner="$PGUSER" "$PGDATABASE" || exit 1
  set -o pipefail
  gzip -dc "$archivo" | psql -X -v ON_ERROR_STOP=1
  ```

  Usar Bash para `pipefail`, como la consola de Postgres 16. Esperado: restauración
  en 0 sobre BD vacía, sin app/tareas reconectándose durante la operación.
  En EasyPanel, seleccionar el commit anterior guardado en el paso 1
  (`e1c5e93ef2f85224d67ddc06b8def2375294f892` en esta preparación) y redesplegar
  **ese código de `meta-tech-provider` y su Compose/SQL antiguos**. No ejecutar
  de nuevo el SQL nuevo después de restaurar. La rama ya avanzó por fast-forward:
  volver a seleccionar su nombre sin fijar el SHA no revierte el despliegue.
  Si el panel no permite fijar commit, crear localmente una referencia de reversión
  al SHA ya confirmado y publicarla, sin mover la rama de despliegue:

  ```powershell
  git branch rollback-meta-e1c5e93 e1c5e93ef2f85224d67ddc06b8def2375294f892
  git push origin rollback-meta-e1c5e93
  ```

  Elegir `rollback-meta-e1c5e93` como fuente en EasyPanel y Deploy. Si el SHA previo
  de la bitácora fuera diferente, esta lista necesita actualizarse antes de empezar
  la ventana. No resetear ni hacer push forzado.
  Repetir RLS y humo de Villafuerte; esperado: conteos previos y operación anterior.

Los seeds, fechas/costos de servidores y workflows diferidos siguen sujetos a
[DESPLIEGUE-MODULOS-AR.md](DESPLIEGUE-MODULOS-AR.md). No son condición para probar
lecturas de los módulos ya configurados ni se ejecutaron como parte de esta lista.
