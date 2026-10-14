Push-Location (Join-Path $PSScriptRoot '../../web')
try {
  foreach ($tipo in @('http','test')) {
    $archivos=@(rg --files prisma/scripts -g 'test-*.ts' | Sort-Object)
    if ($tipo -eq 'http') { $archivos=@($archivos | Where-Object { Select-String -LiteralPath $_ -Pattern 'E2E_BASE_URL' -Quiet }) }
    $salida=Join-Path $PSScriptRoot "$tipo-resumen.txt"
    Set-Content -LiteralPath $salida -Value "RESULTADOS FINALES $tipo; cada resultado proviene de su salida literal individual" -Encoding utf8
    $fallos=0
    foreach ($archivo in $archivos) {
      $nombre=[System.IO.Path]::GetFileNameWithoutExtension($archivo)
      $log=Join-Path $PSScriptRoot "$nombre.txt"
      $ultima=Get-Content -LiteralPath $log -Tail 1
      if ($ultima -notmatch '^EXIT (\d+)$') { throw "Falta resultado literal de $nombre" }
      $codigo=[int]$Matches[1]
      Add-Content -LiteralPath $salida -Value "${nombre}: EXIT $codigo"
      if ($codigo -ne 0) { $fallos++ }
    }
    $total="TOTAL $($archivos.Count); FALLOS $fallos"
    Add-Content -LiteralPath $salida -Value $total
    Write-Output "$tipo $total"
  }
} finally { Pop-Location }
