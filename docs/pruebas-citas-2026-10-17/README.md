# Regresión local de Citas · 17-oct-2026

Solo PostgreSQL 16 desechable en **127.0.0.1:55450**, contenedor `ambarcrm-citas-20261017`.
No usar `ambarcrm-db`, producción, `prisma db push`, push ni deploy.

`ejecutar-regresion.py` usa Python estándar, Node y los binarios ya instalados en `web/node_modules`.
Para TypeScript usa tsx de la caché local indicada en el script; `TSX_BIN` permite señalar otra
instalación existente. No descarga herramientas. Neutraliza variables de `.env*`, fija credenciales
sintéticas y precarga `sin-red.mjs` para impedir sockets/fetch/DNS externos. Graph se simula con
`web/prisma/scripts/meta-facebook-simulado.mjs`.

Desde la raíz del proyecto, sobre un contenedor nuevo:

```powershell
docker run -d --pull=never --name ambarcrm-citas-20261017 -e POSTGRES_USER=dueno -e POSTGRES_PASSWORD=dueno_test -e POSTGRES_DB=crm -p 127.0.0.1:55450:5432 postgres:16
python docs/pruebas-citas-2026-10-17/ejecutar-regresion.py sql
python docs/pruebas-citas-2026-10-17/ejecutar-regresion.py base
python docs/pruebas-citas-2026-10-17/ejecutar-regresion.py pruebas
```

- `sql`: espera al servidor final por TCP; aplica `schema.sql`, `multi-tenant.sql` y actualizaciones ×3;
  prepara rol y fixture sintético de plataforma.
- `base`: otras tres actualizaciones, Prisma generate, tsc, lint, Prisma validate y build.
  La app debe estar detenida: Windows bloquea la DLL de Prisma si está en uso.
- `pruebas`: descubre **todos** los `test-*.ts`, salvo `test-lealtad-aurum.ts`, y todos los `check-*.ts`.
  Incluye `test-citas.ts` y `test-citas-e2e.ts`. Reinicia la app compilada entre archivos E2E,
  sin desactivar límites de login ni alterar autenticación. Empieza por aislamiento.
- `app`: abre `next start` solo en 127.0.0.1:3118; útil para revisar visualmente los fixtures.

`resultados.json` conserva códigos y tiempos; `ejecuciones.txt`, salidas completas, incluidos fallos.
`regresion-primera.json` preserva la primera batería completa (reseñas y login de sin red fallidos).
`regresion-final.json` identifica la batería final aprobada y `regresion-pre-merge-2026-10-17.md`
contiene la tabla por prueba. Los errores esperados por los tests también pueden aparecer en logs
con código 0: el código de salida y las aserciones determinan el resultado.

Después de verificar, detener **solo** el proceso `next start` del puerto 3118 y retirar este contenedor.
La entrega deja ambos retirados. Las capturas y los fixtures guardados contienen únicamente datos
sintéticos. `fixtures-visual.json` corresponde a las primeras capturas; `fixtures.json`, a la batería final.

Se normalizaron saltos de línea y espacios al final en los logs para guardarlos en Git;
se conservan los mensajes, códigos, tiempos y fallos.
