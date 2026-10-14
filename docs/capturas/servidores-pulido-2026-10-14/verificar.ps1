param([Parameter(Mandatory)][ValidateSet('estaticos','compilar','app','e2e','capturas')][string]$Tipo)
. (Join-Path $PSScriptRoot 'entorno-local.ps1')
Push-Location (Join-Path $PSScriptRoot '../../../web')
try {
  if ($Tipo -eq 'app') { npx --no-install next start --hostname 127.0.0.1 --port 3129; exit $LASTEXITCODE }
  if ($Tipo -eq 'e2e') {
    npx --no-install tsx prisma/scripts/test-servidores-e2e.ts *> (Join-Path $PSScriptRoot 'test-servidores-e2e.txt')
    $codigo=$LASTEXITCODE
    Add-Content (Join-Path $PSScriptRoot 'test-servidores-e2e.txt') "EXIT $codigo"
    Get-Content (Join-Path $PSScriptRoot 'test-servidores-e2e.txt')
    exit $codigo
  }
  if ($Tipo -eq 'capturas') {
    node (Join-Path $PSScriptRoot 'capturar.mjs') *> (Join-Path $PSScriptRoot 'capturas.txt')
    $codigo=$LASTEXITCODE
    Add-Content (Join-Path $PSScriptRoot 'capturas.txt') "EXIT $codigo"
    Get-Content (Join-Path $PSScriptRoot 'capturas.txt')
    exit $codigo
  }
  $fallos=0
  foreach ($prueba in @(@('tipos','tsc','--noEmit'),@('lint','eslint','.'),@('build','next','build'))) {
    $nombre=$prueba[0]; $argumentos=$prueba[1..($prueba.Length-1)]
    if ($nombre -eq 'lint') { npm run lint *> (Join-Path $PSScriptRoot 'lint.txt') }
    else { npx --no-install @argumentos *> (Join-Path $PSScriptRoot "$nombre.txt") }
    $codigo=$LASTEXITCODE
    Add-Content (Join-Path $PSScriptRoot "$nombre.txt") "EXIT $codigo"
    Write-Output "${nombre}: EXIT $codigo"
    if ($codigo -ne 0) { $fallos++ }
  }
  if ($Tipo -eq 'compilar') { if ($fallos) { exit 1 }; exit 0 }
  $archivos=@(rg --files scripts -g 'check-*.ts' | Sort-Object)
  $fallosChecks=0; $resumen=@()
  foreach ($archivo in $archivos) {
    $nombre=[System.IO.Path]::GetFileNameWithoutExtension($archivo)
    npx --no-install tsx $archivo *> (Join-Path $PSScriptRoot "$nombre.txt")
    $codigo=$LASTEXITCODE
    Add-Content (Join-Path $PSScriptRoot "$nombre.txt") "EXIT $codigo"
    $resumen+="${nombre}: EXIT $codigo"
    Write-Output $resumen[-1]
    if ($codigo -ne 0) { $fallosChecks++ }
  }
  $resumen+="TOTAL $($archivos.Count); FALLOS $fallosChecks"
  $resumen | Set-Content (Join-Path $PSScriptRoot 'checks-resumen.txt')
  Write-Output $resumen[-1]
  if ($fallos -or $fallosChecks) { exit 1 }
} finally { Pop-Location }
