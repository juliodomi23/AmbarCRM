param([Parameter(Mandatory)][ValidateSet('checks','db','http')][string]$Tipo)
$env:DATABASE_URL='postgresql://crm_app:app_test@127.0.0.1:55453/crm'
$env:ADMIN_DATABASE_URL='postgresql://dueno:dueno_test@127.0.0.1:55453/crm'
$env:E2E_BASE_URL='http://127.0.0.1:3128'
$env:NEXTAUTH_URL='http://127.0.0.1:3128'
$env:WA_API_KEY='merge-ar-pruebas-cron'
$env:META_TOKEN_ENCRYPTION_KEY='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
$env:META_APP_SECRET='merge-ar-meta-ficticio'
$env:IP_HEADER='x-real-ip'
$env:AURUM_URL=''
$env:AURUM_SLUG=''
$env:AURUM_CLAVE=''
$env:AURUM_WEBHOOK_SECRET=''
Push-Location (Join-Path $PSScriptRoot '../../web')
try {
  $carpeta=if($Tipo -eq 'checks'){'scripts'}else{'prisma/scripts'}
  $patron=if($Tipo -eq 'checks'){'check-*.ts'}else{'test-*.ts'}
  $archivos=@(rg --files $carpeta -g $patron | Sort-Object)
  if($Tipo -ne 'checks') {
    $archivos=@($archivos | Where-Object {
      $http=Select-String -LiteralPath $_ -Pattern 'E2E_BASE_URL' -Quiet
      if($Tipo -eq 'http'){$http}else{!$http}
    })
  }
  $fallos=0
  $resumen=Join-Path $PSScriptRoot "$Tipo-resumen.txt"
  Set-Content -LiteralPath $resumen -Value "BATERÍA $Tipo" -Encoding utf8
  foreach($archivo in $archivos) {
    $nombre=[System.IO.Path]::GetFileNameWithoutExtension($archivo)
    $salida=Join-Path $PSScriptRoot "$nombre.txt"
    npx --no-install tsx $archivo *> $salida
    $codigo=$LASTEXITCODE
    Add-Content -LiteralPath $salida -Value "EXIT $codigo"
    Add-Content -LiteralPath $resumen -Value "${nombre}: EXIT $codigo"
    Write-Output "${nombre}: EXIT $codigo"
    if($codigo -ne 0){$fallos++}
  }
  $total="TOTAL $($archivos.Count); FALLOS $fallos"
  Add-Content -LiteralPath $resumen -Value $total
  Write-Output $total
} finally {
  Pop-Location
}
