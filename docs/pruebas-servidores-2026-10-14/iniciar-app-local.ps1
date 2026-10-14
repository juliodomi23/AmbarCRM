$env:DATABASE_URL='postgresql://crm_app:app_test@127.0.0.1:55453/crm_servidores'
$env:NEXTAUTH_URL='http://127.0.0.1:3128'
$env:NEXTAUTH_SECRET='merge-ar-local-nextauth-2026'
$env:WA_API_KEY='merge-ar-pruebas-cron'
$env:META_TOKEN_ENCRYPTION_KEY='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
$env:META_APP_SECRET='merge-ar-meta-ficticio'
$env:IP_HEADER='x-real-ip'
$env:AURUM_URL=''
Push-Location (Join-Path $PSScriptRoot '../../web')
try {
  npx --no-install next start --hostname 127.0.0.1 --port 3128
} finally {
  Pop-Location
}
