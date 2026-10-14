. (Join-Path $PSScriptRoot 'entorno-local.ps1')
Push-Location (Join-Path $PSScriptRoot '../../web')
try { npx --no-install next start --hostname 127.0.0.1 --port 3128 *> (Join-Path $PSScriptRoot 'app-local.txt') }
finally { Pop-Location }
