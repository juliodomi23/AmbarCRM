"""Arnés local: base desechable, sin credenciales ni llamadas a proveedores reales."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / 'web'
OUT = Path(__file__).resolve().parent
ENV = os.environ.copy()
for folder in [ROOT, WEB]:
    for path in folder.glob('.env*'):
        if path.is_file():
            for line in path.read_text(encoding='utf-8-sig').splitlines():
                if '=' in line and not line.lstrip().startswith('#'):
                    ENV[line.split('=', 1)[0].strip()] = ''
ENV.update(
    DATABASE_URL='postgresql://crm_app:app_test@127.0.0.1:55451/crm',
    ADMIN_DATABASE_URL='postgresql://dueno:dueno_test@127.0.0.1:55451/crm',
    NEXTAUTH_URL='http://127.0.0.1:3120', E2E_BASE_URL='http://127.0.0.1:3120',
    NEXTAUTH_SECRET='marketing-local-prueba-20261021',
    META_TOKEN_ENCRYPTION_KEY='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    META_APP_ID='', META_APP_SECRET='', WA_API_KEY='marketing-local-key',
    NEXT_TELEMETRY_DISABLED='1', DEFAULT_ORG_SLUG='fase3-demo', BASE_DOMAIN_FIRST_LABEL='127',
    NODE_ENV='production', TZ='America/Mexico_City',
    NODE_OPTIONS='--import=' + (ROOT / 'docs/pruebas-citas-2026-10-17/sin-red.mjs').as_uri(),
    PRISMA_HIDE_UPDATE_MESSAGE='1', CHECKPOINT_DISABLE='1',
)

def run(label, args, timeout=600):
    started = time.monotonic()
    result = subprocess.run(args, cwd=WEB, env=ENV, capture_output=True, timeout=timeout)
    output = result.stdout + result.stderr
    (OUT / (label + '.txt')).write_bytes(output)
    print(json.dumps({'prueba': label, 'codigo': result.returncode, 'segundos': round(time.monotonic() - started, 2)}), flush=True)
    if result.returncode:
        print(output.decode('utf-8', errors='replace')[-9000:], flush=True)
    return result.returncode

def tsx_local():
    if os.environ.get('TSX_BIN'):
        candidates = [Path(os.environ['TSX_BIN'])]
    else:
        candidates = list((Path(os.environ['LOCALAPPDATA']) / 'npm-cache/_npx').glob('*/node_modules/tsx/dist/cli.mjs'))
    assert candidates and candidates[0].is_file(), 'Define TSX_BIN con una instalación local de tsx'
    return str(candidates[0])

mode = sys.argv[1]
if mode == 'build':
    ENV['NEXT_FONT_GOOGLE_MOCKED_RESPONSES'] = str(ROOT / 'docs/pruebas-citas-integral-2026-10-18/fuentes.cjs')
    sys.exit(run('build-local-fuentes-simuladas', ['node', 'node_modules/next/dist/bin/next', 'build', '--webpack']))
elif mode == 'app':
    with (OUT / 'app.log').open('wb') as log:
        app = subprocess.Popen(['node', 'node_modules/next/dist/bin/next', 'start', '-p', '3120', '-H', '127.0.0.1'], cwd=WEB, env=ENV, stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW)
    (OUT / 'app-pid.txt').write_text(str(app.pid))
    print('Aplicación local PID', app.pid)
elif mode == 'checks':
    tsx = tsx_local()
    errors = []
    for check in sorted((WEB / 'scripts').glob('check-*.ts')):
        if run(check.stem, ['node', tsx, str(check)]):
            errors.append(check.name)
    print('Comprobaciones fallidas:', errors)
    sys.exit(bool(errors))
elif mode == 'tsc':
    sys.exit(run('tsc', ['node', 'node_modules/typescript/bin/tsc', '--noEmit']))
elif mode == 'test':
    tsx = tsx_local()
    script = WEB / sys.argv[2]
    sys.exit(run(script.stem, ['node', tsx, str(script)]))
