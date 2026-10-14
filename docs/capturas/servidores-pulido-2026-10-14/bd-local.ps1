param([Parameter(Mandatory)][ValidateSet('preparar','limpiar')][string]$Accion)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'entorno-local.ps1')
$contenedor='ambarcrm-servidores-pulido-20261014'
if ($Accion -eq 'limpiar') {
  docker stop $contenedor
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  docker rm $contenedor
  exit $LASTEXITCODE
}
Push-Location (Join-Path $PSScriptRoot '../../..')
try {
  docker run -d --name $contenedor -e POSTGRES_USER=dueno -e POSTGRES_PASSWORD=dueno_test -e POSTGRES_DB=crm_pulido -p 127.0.0.1:55454:5432 --tmpfs /var/lib/postgresql/data postgres:16
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el contenedor nuevo' }
  for ($intento=0; $intento -lt 30; $intento++) {
    docker exec $contenedor pg_isready -U dueno -d crm_pulido | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  foreach ($paso in @(@('schema','schema.sql'),@('multi-tenant','web/prisma/sql/multi-tenant.sql'),@('actualizaciones','web/prisma/sql/actualizaciones.sql'))) {
    docker cp $paso[1] "${contenedor}:/tmp/$($paso[0]).sql"
    docker exec $contenedor psql -U dueno -d crm_pulido -v ON_ERROR_STOP=1 -f "/tmp/$($paso[0]).sql" *> (Join-Path $PSScriptRoot "init-$($paso[0]).txt")
    $codigo=$LASTEXITCODE
    Add-Content (Join-Path $PSScriptRoot "init-$($paso[0]).txt") "EXIT $codigo"
    if ($codigo -ne 0) { throw "Falló $($paso[0])" }
  }
  docker exec $contenedor psql -U dueno -d crm_pulido -v ON_ERROR_STOP=1 -c "UPDATE orgs SET slug='ambar-rojo', nombre='Ámbar Rojo · fixtures locales' WHERE id=1;"
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar la org local' }
  $env:ALLOW_DEMO_SEED='1'; $env:ORG_SLUG='ambar-rojo'
  node web/scripts/seed-ambar-rojo.mjs admin@ambar-rojo.local.test AR-Prueba-2026
  if ($LASTEXITCODE -ne 0) { throw 'Falló el fixture AR' }
  node (Join-Path $PSScriptRoot 'fixtures-locales.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Fallaron los fixtures visuales' }
} finally { Pop-Location }
