. (Join-Path $PSScriptRoot 'entorno-local.ps1')
Push-Location (Join-Path $PSScriptRoot '../../web')
try {
  npx --no-install tsc --noEmit *> (Join-Path $PSScriptRoot 'tipos.txt')
  $codigo=$LASTEXITCODE
  Add-Content (Join-Path $PSScriptRoot 'tipos.txt') "EXIT $codigo"
  Write-Output "tsc: EXIT $codigo"
  npm run lint *> (Join-Path $PSScriptRoot 'lint.txt')
  $codigo=$LASTEXITCODE
  Add-Content (Join-Path $PSScriptRoot 'lint.txt') "EXIT $codigo"
  Write-Output "lint: EXIT $codigo"
  npx --no-install next build *> (Join-Path $PSScriptRoot 'build.txt')
  $codigo=$LASTEXITCODE
  Add-Content (Join-Path $PSScriptRoot 'build.txt') "EXIT $codigo"
  Write-Output "build: EXIT $codigo"
} finally { Pop-Location }
