import pathlib, sys

anterior = pathlib.Path(__file__).resolve().parents[1] / 'pruebas-citas-2026-10-17' / 'ejecutar-regresion.py'
source = anterior.read_text(encoding='utf-8')
source = source.replace("OUT=ROOT/'docs/pruebas-citas-2026-10-17'", "OUT=ROOT/'docs/pruebas-citas-horarios-2026-10-18'")
source = source.replace("(OUT/'sin-red.mjs').as_uri()", "(ROOT/'docs/pruebas-citas-2026-10-17/sin-red.mjs').as_uri()")
source = source.replace("CONTAINER='ambarcrm-citas-20261017'", "CONTAINER='ambarcrm-citas-horarios-20261018'")
source = source.replace("(OUT/'resultados.json')", "(OUT/('resultados-'+sys.argv[1]+'.json'))")
source = source.replace("elif mode=='base':", "elif mode=='citas':\n for archivo in ['test-citas-horarios.ts','test-citas.ts']:\n  run(archivo,['node',str(TSX),'prisma/scripts/'+archivo])\nelif mode=='base':")
source = source.replace("elif mode=='base':", "elif mode=='una':\n assert run(sys.argv[2],['node',str(TSX),sys.argv[2]])==0\nelif mode=='base':")
exec(compile(source, str(anterior), 'exec'), {'__file__': str(anterior), '__name__': '__main__'})
