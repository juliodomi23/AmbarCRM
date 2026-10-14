$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'entorno-local.ps1')
Push-Location (Join-Path $PSScriptRoot '../../web')
$appProceso=$null
try {
  $archivos=@(rg --files prisma/scripts -g 'test-*.ts' | Sort-Object | Where-Object { Select-String -LiteralPath $_ -Pattern 'E2E_BASE_URL' -Quiet })
  $resumen=Join-Path $PSScriptRoot 'http-resumen.txt'
  Set-Content -LiteralPath $resumen -Value 'BATERÍA http' -Encoding utf8
  $fallos=0
  for($indice=0; $indice -lt $archivos.Count; $indice++) {
    if($indice % 4 -eq 0) {
      if($appProceso) { Stop-Process -Id $appProceso.Id; $appProceso.WaitForExit() }
      $grupo=[int]($indice/4)+1
      $appProceso=Start-Process -FilePath (Get-Command node).Source -ArgumentList @('node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3128') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot "app-http-$grupo.txt") -RedirectStandardError (Join-Path $PSScriptRoot "app-http-$grupo-error.txt")
      $lista=$false
      for($intento=0; $intento -lt 30; $intento++) {
        try { $respuesta=Invoke-WebRequest "$env:E2E_BASE_URL/api/auth/csrf" -TimeoutSec 2; if($respuesta.StatusCode -eq 200) { $lista=$true; break } } catch { Start-Sleep -Milliseconds 500 }
      }
      if(!$lista) { throw 'La app local no inició' }
    }
    $archivo=$archivos[$indice]
    $nombre=[System.IO.Path]::GetFileNameWithoutExtension($archivo)
    $salida=Join-Path $PSScriptRoot "$nombre.txt"
    npx --no-install tsx $archivo *> $salida
    $codigo=$LASTEXITCODE
    Add-Content -LiteralPath $salida -Value "EXIT $codigo"
    Add-Content -LiteralPath $resumen -Value "${nombre}: EXIT $codigo"
    Write-Output "${nombre}: EXIT $codigo"
    if($codigo -ne 0) { $fallos++ }
  }
  $total="TOTAL $($archivos.Count); FALLOS $fallos"
  Add-Content -LiteralPath $resumen -Value $total
  Write-Output $total
} finally {
  if($appProceso -and !$appProceso.HasExited) { Stop-Process -Id $appProceso.Id; $appProceso.WaitForExit() }
  Pop-Location
}
