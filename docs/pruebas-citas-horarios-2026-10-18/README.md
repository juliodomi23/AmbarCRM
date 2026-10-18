# Regresión local de citas · 18 de octubre de 2026

`ejecutar.py` reutiliza el arnés de la revisión anterior, cambia únicamente directorio de
evidencia y contenedor, y separa resultados por modo. Borra del entorno las variables de
archivos .env y fija URLs locales y credenciales sintéticas. El preload `sin-red.mjs`
existente rechaza fetch, DNS y conexiones externas; los proveedores usados son simulados.
No descarga paquetes ni imágenes Docker. SQL desde schema.sql y multi-tenant.sql;
actualizaciones.sql se aplica tres veces. No se usa prisma db push.

Ejecutar desde la raíz, en orden (no simultáneamente):

```powershell
docker run -d --pull=never --name ambarcrm-citas-horarios-20261018 -e POSTGRES_USER=dueno -e POSTGRES_PASSWORD=dueno_test -e POSTGRES_DB=crm -p 127.0.0.1:55450:5432 postgres:16
python docs/pruebas-citas-horarios-2026-10-18/ejecutar.py sql
python docs/pruebas-citas-horarios-2026-10-18/ejecutar.py base
python docs/pruebas-citas-horarios-2026-10-18/ejecutar.py app
python docs/pruebas-citas-horarios-2026-10-18/ejecutar.py pruebas
```

Modos focales: `citas`, o `una prisma/scripts/test-citas-horarios.ts`.
Fixture visual: `una ../docs/pruebas-citas-horarios-2026-10-18/visual.mts`.
Reinicia la app por puerto entre archivos E2E para aislar los contadores de login.
La limpieza se registra en limpieza.json; debe detenerse :3118 y retirarse únicamente
el contenedor de esta corrida y su volumen anónimo.

## Evidencia

- `ejecuciones.txt`: salidas reales de todas las ejecuciones, incluidos los fallos iniciales.
  Conserva los retornos de carro de stdout en Windows; se excluye de la comprobación de
  espacios de código para mantener la evidencia original sin reformatearla.
- `resultados-base.json`: TypeScript, lint, Prisma, build y SQL repetido del código final.
- `resultados-pruebas.json`: resultado, código y duración por cada test/check de la batería.
- `resultados-una.json` y `resultados-citas.json`: iteraciones focales y fixture visual.
- `resultados.json`: primera preparación y comprobaciones iniciales; no sustituye el final.
- `fixtures.json`: tres giros de la prueba HTTP con sesión; datos sintéticos.
- `visual.json`: fixture sintético para capturas; no son credenciales de ningún servicio real.

## Incidencias conservadas

1. El fixture nuevo usó estado `pendiente` para SolicitudResena. El CHECK real solo acepta
   reservada/enviada/fallida/omitida. Se cambió a `reservada`, que representa el intento pendiente.
2. Generar Prisma mientras una prueba tenía la DLL abierta provocó EPERM al renombrar el
   motor de Windows. Se repitieron generación y batería base sin pruebas simultáneas: pasaron.
3. El caso de permiso del nuevo test esperaba 403 sin restringir los puestos del fixture
   tras reemplazar su configuración. Se fijaron puestosPermitidos antes de probar Cajero.
4. El primer fixture visual .ts estaba fuera del paquete ESM y tsx lo interpretó como CJS,
   rechazando top-level await. Se conservó como .mts y se ejecutó correctamente.

No se relajaron validaciones, permisos ni restricciones de SQL. La prueba de cobro ligado
no puede fabricarse: las únicas FK entrantes a Cita son evolución clínica y solicitud de
reseña, comprobadas mediante pg_constraint. No se añade una relación de dinero fuera de alcance.
