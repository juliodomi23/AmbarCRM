$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'entorno-local.ps1')
$contenedor='ambarcrm-nuevo-cobro-monto-20261014'
Push-Location (Join-Path $PSScriptRoot '../..')
try {
  docker inspect $contenedor --format '{{.Name}} {{.Id}} {{.Config.Image}} {{json .HostConfig.PortBindings}} {{json .HostConfig.Tmpfs}}' *> (Join-Path $PSScriptRoot 'contenedor.txt')
  foreach ($paso in @(@('schema','schema.sql'),@('multi-tenant','web/prisma/sql/multi-tenant.sql'),@('actualizaciones','web/prisma/sql/actualizaciones.sql'))) {
    docker cp $paso[1] "${contenedor}:/tmp/$($paso[0]).sql"
    docker exec $contenedor psql -U dueno -d crm -v ON_ERROR_STOP=1 -f "/tmp/$($paso[0]).sql" *> (Join-Path $PSScriptRoot "init-$($paso[0]).txt")
    $codigo=$LASTEXITCODE
    Add-Content (Join-Path $PSScriptRoot "init-$($paso[0]).txt") "EXIT $codigo"
    if ($codigo -ne 0) { throw "Falló $($paso[0])" }
  }
  docker exec $contenedor psql -U dueno -d crm -v ON_ERROR_STOP=1 -c "ALTER ROLE crm_app PASSWORD 'app_test'; UPDATE orgs SET slug='ambar-rojo', nombre='Fixtures cobros locales' WHERE id=1; SELECT version(), rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname='crm_app';" *> (Join-Path $PSScriptRoot 'postgres-rol.txt')
  if ($LASTEXITCODE -ne 0) { throw 'Falló la preparación del rol local' }
  node (Join-Path $PSScriptRoot 'fixture-local.mjs') *> (Join-Path $PSScriptRoot 'fixture-local.txt')
  $codigo=$LASTEXITCODE
  Add-Content (Join-Path $PSScriptRoot 'fixture-local.txt') "EXIT $codigo"
  if ($codigo -ne 0) { throw 'Falló el fixture local' }
} finally { Pop-Location }
