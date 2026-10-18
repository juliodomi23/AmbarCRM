import os, pathlib, subprocess, time, json, urllib.request, sys
ROOT=pathlib.Path(__file__).resolve().parents[2]; WEB=ROOT/'web'; TEMP=pathlib.Path(os.environ['TEMP'])
OUT=ROOT/'docs/pruebas-citas-2026-10-17'; OUT.mkdir(exist_ok=True)
ENV=os.environ.copy()
for f in list(ROOT.glob('.env*'))+list(WEB.glob('.env*')):
 if f.is_file():
  for line in f.read_text(encoding='utf-8-sig').splitlines():
   if '=' in line and not line.lstrip().startswith('#'): ENV[line.split('=',1)[0].strip()]=''
ENV.update(DATABASE_URL='postgresql://crm_app:app_test@127.0.0.1:55450/crm',ADMIN_DATABASE_URL='postgresql://dueno:dueno_test@127.0.0.1:55450/crm',NEXTAUTH_URL='http://127.0.0.1:3118',E2E_BASE_URL='http://127.0.0.1:3118',NEXTAUTH_SECRET='cierre-local-prueba-20261017',META_TOKEN_ENCRYPTION_KEY='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',META_APP_ID='123',META_APP_SECRET='secreto-meta-simulado',META_WEBHOOK_VERIFY_TOKEN='verify-local',MESSENGER_VERIFY_TOKEN='verify-messenger',MESSENGER_GRAPH_SIMULADO='1',WA_API_KEY='cierre-local-key',AURUM_URL='',AURUM_WEBHOOK_SECRET='',ANTHROPIC_API_KEY='',NEXT_TELEMETRY_DISABLED='1',IP_HEADER='x-real-ip',META_GRAPH_VERSION='v26.0',NEXT_PUBLIC_META_GRAPH_VERSION='v26.0',DEFAULT_ORG_SLUG='inicial',BASE_DOMAIN_FIRST_LABEL='127',NODE_ENV='production',TZ='America/Mexico_City',NODE_OPTIONS='--import='+ (OUT/'sin-red.mjs').as_uri(),PRISMA_HIDE_UPDATE_MESSAGE='1',CHECKPOINT_DISABLE='1')
RESULTS=json.loads((OUT/'resultados.json').read_text()) if (OUT/'resultados.json').exists() else []
TSX=pathlib.Path(os.environ.get('TSX_BIN', str(pathlib.Path(os.environ['LOCALAPPDATA'])/'npm-cache/_npx/69f9afb961c37556/node_modules/tsx/dist/cli.mjs')))
assert TSX.is_file(), 'Indica TSX_BIN con una instalación local; no se descarga nada'
CONTAINER='ambarcrm-citas-20261017'
def run(label,args,cwd=WEB,data=None,timeout=600,extra=None,redact=False):
 start=time.monotonic(); env=ENV.copy(); env.update(extra or {})
 try:
  r=subprocess.run(args,cwd=cwd,env=env,input=data,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout)
  code=r.returncode; output=r.stdout.decode('utf-8',errors='replace')
 except subprocess.TimeoutExpired as e:
  code=124; output=(e.stdout or b'').decode('utf-8',errors='replace')+'\nTIMEOUT'
 if redact: output='Salida de credenciales sintéticas del seed omitida. Código real: '+str(code)
 row=dict(prueba=label,codigo=code,segundos=round(time.monotonic()-start,2)); RESULTS.append(row)
 (OUT/'resultados.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
 with (OUT/'ejecuciones.txt').open('a',encoding='utf-8') as f: f.write('\n## '+label+' · salida '+str(code)+'\n'+output+'\n')
 print(json.dumps(row,ensure_ascii=False),flush=True); return code
PSQL=['docker','exec','-i',CONTAINER,'psql','-X','-U','dueno','-d','crm','-v','ON_ERROR_STOP=1','-q']
mode=sys.argv[1]
if mode=='sql':
 for _ in range(30):
  if subprocess.run(['docker','exec',CONTAINER,'pg_isready','-U','dueno','-d','crm'],capture_output=True).returncode==0: break
  time.sleep(1)
 assert run('schema',PSQL,data=(ROOT/'schema.sql').read_bytes())==0
 assert run('multi-tenant',PSQL,data=(WEB/'prisma/sql/multi-tenant.sql').read_bytes())==0
 for i in range(1,4): assert run('actualizaciones-'+str(i),PSQL,data=(WEB/'prisma/sql/actualizaciones.sql').read_bytes())==0
 assert run('rol-prueba',PSQL,data=b"ALTER ROLE crm_app PASSWORD 'app_test';")==0
 assert run('fixture-plataforma',PSQL,data=b'''UPDATE orgs SET slug='ambar-rojo' WHERE id=1; INSERT INTO modulos_org(org_id,clave,activo,config) VALUES (1,'servidores',true,'{"puestosPermitidos":["Administrador"]}') ON CONFLICT (org_id,clave) DO UPDATE SET activo=true;''')==0
 assert run('fixture-ar',['node','scripts/seed-ambar-rojo.mjs','admin@ambar-rojo.local.test','AR-Prueba-2026'],extra={'NODE_ENV':'development','ALLOW_DEMO_SEED':'1','ORG_SLUG':'ambar-rojo'},redact=True)==0
elif mode=='base':
 for i in range(1,4): assert run('regresion-actualizaciones-'+str(i),PSQL,data=(WEB/'prisma/sql/actualizaciones.sql').read_bytes())==0
 for label,args in [('prisma-generate',['node','node_modules/prisma/build/index.js','generate']),('tsc',['node','node_modules/typescript/bin/tsc','--noEmit']),('lint',['node','node_modules/eslint/bin/eslint.js','.']),('prisma-validate',['node','node_modules/prisma/build/index.js','validate']),('build',['cmd','/c','npm run build'])]: run(label,args)
elif mode=='app':
 with (TEMP/'ambarcrm-citas-app.log').open('wb') as log:
  app=subprocess.Popen(['node','--import','./prisma/scripts/meta-facebook-simulado.mjs','node_modules/next/dist/bin/next','start','-p','3118','-H','127.0.0.1'],cwd=WEB,env=ENV,stdout=log,stderr=subprocess.STDOUT)
  (TEMP/'ambarcrm-citas-app-pid.txt').write_text(str(app.pid)); print('App PID',app.pid)
elif mode=='pruebas':
 for f in sorted((WEB/'prisma/scripts').glob('test-*.ts'),key=lambda p:(p.name!='test-aislamiento.ts',p.name)):
  if f.name=='test-lealtad-aurum.ts': continue
  run(f.name,['node',str(TSX),str(f)],extra={'NEXTAUTH_URL':'https://crm.prueba.test'} if f.name=='test-canales-messenger.ts' else None)
 for f in sorted((WEB/'scripts').glob('check-*.ts')): run(f.name,['node',str(TSX),str(f)])
