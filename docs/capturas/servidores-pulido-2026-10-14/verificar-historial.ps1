param([Parameter(Mandatory)][ValidateSet('preparar','estaticos','app','e2e','capturas')][string]$Tipo)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'entorno-local.ps1')
Push-Location (Join-Path $PSScriptRoot '../../..')
try {
  if($Tipo -eq 'preparar') {
    $contenedor='ambarcrm-servidores-pulido-20261014'
    docker context show | Set-Content (Join-Path $PSScriptRoot 'historial-docker.txt')
    docker context inspect --format '{{.Endpoints.docker.Host}}' | Add-Content (Join-Path $PSScriptRoot 'historial-docker.txt')
    docker run -d --name $contenedor -e POSTGRES_USER=dueno -e POSTGRES_PASSWORD=dueno_test -e POSTGRES_DB=crm_pulido -p 127.0.0.1:55454:5432 --tmpfs /var/lib/postgresql/data postgres:16
    if($LASTEXITCODE -ne 0) { throw 'No se pudo crear el contenedor nuevo' }
    for($intento=0; $intento -lt 30; $intento++) {
      docker exec $contenedor pg_isready -U dueno -d crm_pulido | Out-Null
      if($LASTEXITCODE -eq 0) { break }
      Start-Sleep -Seconds 1
    }
    foreach($paso in @(@('schema','schema.sql'),@('multi-tenant','web/prisma/sql/multi-tenant.sql'),@('actualizaciones','web/prisma/sql/actualizaciones.sql'))) {
      docker cp $paso[1] "${contenedor}:/tmp/$($paso[0]).sql"
      if($LASTEXITCODE -ne 0) { throw 'Falló la copia al contenedor local' }
      docker exec $contenedor psql -U dueno -d crm_pulido -v ON_ERROR_STOP=1 -f "/tmp/$($paso[0]).sql" *> (Join-Path $PSScriptRoot "historial-init-$($paso[0]).txt")
      $codigo=$LASTEXITCODE
      Add-Content (Join-Path $PSScriptRoot "historial-init-$($paso[0]).txt") "EXIT $codigo"
      if($codigo -ne 0) { throw "Falló $($paso[0])" }
    }
    docker exec $contenedor psql -U dueno -d crm_pulido -v ON_ERROR_STOP=1 -c "UPDATE orgs SET slug='ambar-rojo', nombre='Ámbar Rojo · fixtures locales' WHERE id=1; SELECT current_database(); SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='crm_app';"
    if($LASTEXITCODE -ne 0) { throw 'Falló la preparación de la org local' }
    docker inspect --format '{{.Id}} {{.Name}} {{json .HostConfig.PortBindings}} {{json .HostConfig.Tmpfs}}' $contenedor | Set-Content (Join-Path $PSScriptRoot 'historial-contenedor.txt')
    $env:ALLOW_DEMO_SEED='1'; $env:ORG_SLUG='ambar-rojo'
    node web/scripts/seed-ambar-rojo.mjs admin@ambar-rojo.local.test AR-Prueba-2026
    if($LASTEXITCODE -ne 0) { throw 'Falló el fixture AR' }
    node (Join-Path $PSScriptRoot 'fixtures-locales.mjs')
    if($LASTEXITCODE -ne 0) { throw 'Fallaron los fixtures visuales' }
    exit 0
  }
  Set-Location web
  if($Tipo -eq 'app') { npx --no-install next start --hostname 127.0.0.1 --port 3129; exit $LASTEXITCODE }
  if($Tipo -eq 'e2e' -or $Tipo -eq 'capturas') {
    $nombre=if($Tipo -eq 'e2e') {'historial-test-servidores-e2e'} else {'historial-capturas'}
    if($Tipo -eq 'e2e') { npx --no-install tsx prisma/scripts/test-servidores-e2e.ts *> (Join-Path $PSScriptRoot "$nombre.txt") }
    else { node (Join-Path $PSScriptRoot 'capturar-historial.mjs') *> (Join-Path $PSScriptRoot "$nombre.txt") }
    $codigo=$LASTEXITCODE
    Add-Content (Join-Path $PSScriptRoot "$nombre.txt") "EXIT $codigo"
    Get-Content (Join-Path $PSScriptRoot "$nombre.txt")
    exit $codigo
  }
  $fallos=0; $resumen=@()
  foreach($prueba in @(@('tipos','tsc','--noEmit'),@('lint','eslint','.'),@('build','next','build'))) {
    $nombre=$prueba[0]; $argumentos=$prueba[1..($prueba.Length-1)]
    if($nombre -eq 'lint') { npm run lint *> (Join-Path $PSScriptRoot 'historial-lint.txt') }
    else { npx --no-install @argumentos *> (Join-Path $PSScriptRoot "historial-$nombre.txt") }
    $codigo=$LASTEXITCODE
    Add-Content (Join-Path $PSScriptRoot "historial-$nombre.txt") "EXIT $codigo"
    $resumen+="${nombre}: EXIT $codigo"
    Write-Output $resumen[-1]
    if($codigo -ne 0) { $fallos++ }
  }
  $archivos=@(rg --files scripts -g 'check-*.ts' | Sort-Object)
  $fallosChecks=0; $checks=@()
  foreach($archivo in $archivos) {
    $nombre=[System.IO.Path]::GetFileNameWithoutExtension($archivo)
    npx --no-install tsx $archivo *> (Join-Path $PSScriptRoot "historial-$nombre.txt")
    $codigo=$LASTEXITCODE
    Add-Content (Join-Path $PSScriptRoot "historial-$nombre.txt") "EXIT $codigo"
    $checks+="${nombre}: EXIT $codigo"
    Write-Output $checks[-1]
    if($codigo -ne 0) { $fallosChecks++ }
  }
  $checks+="TOTAL $($archivos.Count); FALLOS $fallosChecks"
  $checks | Set-Content (Join-Path $PSScriptRoot 'historial-checks-resumen.txt')
  $resumen+=$checks[-1]
  $resumen | Set-Content (Join-Path $PSScriptRoot 'historial-estaticos-resumen.txt')
  Write-Output $checks[-1]
  if($fallos -or $fallosChecks) { exit 1 }
} finally { Pop-Location }
