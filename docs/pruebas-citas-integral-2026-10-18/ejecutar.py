import pathlib, sys

anterior = pathlib.Path(__file__).resolve().parents[1] / 'pruebas-citas-2026-10-17' / 'ejecutar-regresion.py'
source = anterior.read_text(encoding='utf-8')
source = source.replace("OUT=ROOT/'docs/pruebas-citas-2026-10-17'", "OUT=ROOT/'docs/pruebas-citas-integral-2026-10-18'")
source = source.replace("(OUT/'sin-red.mjs').as_uri()", "(ROOT/'docs/pruebas-citas-2026-10-17/sin-red.mjs').as_uri()")
source = source.replace("CONTAINER='ambarcrm-citas-20261017'", "CONTAINER='ambarcrm-citas-integral-20261018'")
source = source.replace("'./prisma/scripts/meta-facebook-simulado.mjs'", "'../docs/pruebas-citas-integral-2026-10-18/plantillas-simuladas.mjs'")
source = source.replace("(OUT/'resultados.json')", "(OUT/('resultados-'+sys.argv[1]+'.json'))")
source = source.replace("mode=sys.argv[1]", "ENV['NEXT_FONT_GOOGLE_MOCKED_RESPONSES']=str(OUT/'fuentes.cjs')\nmode=sys.argv[1]")
source = source.replace("elif mode=='base':", "elif mode=='focal':\n for archivo in ['test-citas-integral.ts','test-citas-horarios.ts','test-citas.ts','test-reservas-concurrentes.ts']:\n  run(archivo,['node',str(TSX),'prisma/scripts/'+archivo])\nelif mode=='base':")
source = source.replace("elif mode=='base':", "elif mode=='una':\n run(sys.argv[2],['node',str(TSX),sys.argv[2]])\nelif mode=='base':")
source = source.replace("elif mode=='base':", "elif mode=='compilar':\n detener_app()\n assert run('build-webpack',['node','node_modules/next/dist/bin/next','build','--webpack'])==0\nelif mode=='base':")
source = source.replace("elif mode=='base':", "elif mode=='ocupar':\n run('ocupar-visual',['node',str(TSX),'../docs/pruebas-citas-integral-2026-10-18/ocupar.mts',sys.argv[2]])\nelif mode=='base':")
source = source.replace("elif mode=='base':", "elif mode=='lint-final':\n archivos=subprocess.check_output(['git','diff','--name-only','--','web/src','web/prisma/scripts'],cwd=ROOT,text=True).splitlines()\n archivos=sorted({str(pathlib.Path(p).relative_to('web')) for p in archivos}|{'src/lib/reservas/configuracion.ts','prisma/scripts/test-citas-integral.ts','prisma/scripts/test-citas-precarga-e2e.ts'})\n run('lint-final',['node','node_modules/eslint/bin/eslint.js',*archivos])\nelif mode=='base':")
source = source.replace("elif mode=='base':", "elif mode=='tsc-final':\n assert run('tsc-final',['node','node_modules/typescript/bin/tsc','--noEmit'])==0\nelif mode=='base':")
source = source.replace("elif mode=='base':", "elif mode=='detener':\n detener_app()\nelif mode=='base':")
exec(compile(source, str(anterior), 'exec'), {'__file__': str(anterior), '__name__': '__main__'})
