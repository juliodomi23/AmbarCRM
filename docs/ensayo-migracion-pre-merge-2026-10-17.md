# Ensayo de migración desde meta-tech-provider

Resultado: **SQL sin errores en tres corridas; datos previos conservados e
idempotencia comprobada en las corridas 2 y 3**. Ensayo sintético local, sin
dump, acceso o comandos contra producción.

## Reproducción

Con el contenedor desechable PostgreSQL 16 `ambarcrm-premerge-20261017` ya creado,
publicado solo en `127.0.0.1:55450`, desde la raíz del repo:

```powershell
node scripts/pre-merge/ensayar-migracion.mjs
```

El script verifica nombre, imagen y publicación del puerto con `docker inspect`.
Crea una BD nueva `ensayo_meta_<timestamp>`, sin reemplazar otras bases.
Lee las fuentes con:

```text
git show meta-tech-provider:schema.sql
git show meta-tech-provider:web/prisma/sql/multi-tenant.sql
git show meta-tech-provider:web/prisma/sql/actualizaciones.sql
git show modulos-fase-2:web/prisma/sql/actualizaciones.sql
```

`schema.sql` está en la raíz de esa rama, no en `web/prisma/`.
Se aplica el esquema base + multi-tenant + actualizaciones **anteriores** antes de
sembrar; después, solo el SQL nuevo. Cada comando psql usa `-X -v ON_ERROR_STOP=1`,
sin una transacción global. No se ejecutó `prisma db push`.
El script comprueba que el SQL nuevo coincide con el checkout.

- Origen: `e1c5e93ef2f85224d67ddc06b8def2375294f892`.
- Destino ensayado: `70e684b1eadcd03bb3686ddf06f6ec37984b1507`.
- BD de la corrida final: `ensayo_meta_1792216349342`.
- Evidencia de conteos y huellas: [JSON completo](ensayo-migracion-pre-merge-2026-10-17.json).

## Datos y conservación

Dos empresas sintéticas, además de la org inicial del esquema. Por empresa: tres
canales WhatsApp (solo token plano, solo cifrado AES-256-GCM `encv1`, y ambos),
diez conversaciones por canal, veinte mensajes por conversación y un bot por canal.
Todos los tokens son ficticios; no se consulta Graph ni se imprime su contenido.
Hay mensajes entrantes/salientes que cruzan medianoche en México y dos enlaces de
etiqueta existentes antes de migrar.

| Tabla / dato | Antes | Después de 1 / 2 / 3 | Comprobación |
|---|---:|---:|---|
| orgs | 3 | 3 / 3 / 3 | Huella original idéntica. |
| canales_whatsapp | 6 | 6 / 6 / 6 | Todas las columnas originales, incluido config, idénticas. |
| contactos | 60 | 60 / 60 / 60 | Todas las columnas originales idénticas. |
| conversaciones | 60 | 60 / 60 / 60 | Originales idénticas; nuevo ultimo_entrante_at poblado en las 60. |
| mensajes | 1200 | 1200 / 1200 / 1200 | Originales idénticas; nuevo canal_id poblado en los 1200. |
| bots | 6 | 6 / 6 / 6 | Originales idénticas; seis reciben exactamente los cinco permisos históricos. |
| etiquetas | 2 | 2 / 2 / 2 | Identidades y nombres conservados. |
| contacto_etiquetas | 2 | 60 / 60 / 60 | Conserva ambos enlaces originales y agrega 58 por el backfill previsto. |

Las huellas MD5 de JSON ordenado son comparaciones de integridad local, no firmas
de seguridad. Se comparan todas las columnas de las 21 tablas originales; la tabla
de enlaces admite las altas previstas y verifica que los enlaces anteriores sigan
presentes. Después de la primera corrida se compara la huella de **todas las tablas
y columnas** del esquema nuevo contra las corridas 2 y 3, sin cambios.
`datosIdempotentes: false` en la primera entrada del JSON significa que esa corrida
establece la referencia posterior; no significa que haya fallado.

Tokens antes/después: cuatro con plano, cuatro con cifrado y dos solo plano.
La migración preserva ambos formatos; no convierte tokens ni elimina el fallback.
La columna `mensajes.timestamp` continúa como `timestamp with time zone`.

## Tiempos reales

| Corrida del SQL nuevo | Tiempo |
|---|---:|
| Primera | 1.303 s |
| Segunda | 0.466 s |
| Tercera | 0.508 s |

Tiempo medido alrededor de cada ejecución `docker exec`/psql, incluyendo su arranque
local; excluye preparación, siembra, comparaciones y aislamiento. No predice el tiempo
con el volumen ni los bloqueos de producción.

`test-aislamiento.ts` también se ejecuta sobre la BD migrada con el rol `crm_app`;
su salida queda en [aislamiento del ensayo](pruebas-pre-merge-2026-10-17/aislamiento-ensayo.txt).

## Ajustes del verificador durante el ensayo

Dos intentos preliminares del script de ensayo fallaron en sus comprobaciones,
después de que el SQL terminara correctamente: primero exigía conteos idénticos
también en `contacto_etiquetas` (el backfill legítimo la hizo crecer de 0 a 60);
después intentaba interpretar el booleano psql `t` como JSON. Se corrigió el
verificador, se añadieron dos enlaces previos para comprobar su conservación y se
repitió el ensayo entero en otra BD nueva. No hubo que cambiar la migración.
Las tres bases de ensayo quedan dentro del contenedor desechable que se elimina
al terminar la preparación.

## Límite y ensayo con respaldo real posterior

🛑 Después de la aprobación, Julio debe autorizar el ensayo con una copia del
respaldo real y comprobar fechas, permisos históricos y conteos reales. No sustituir
esa evidencia por estos datos sintéticos. El SQL actual no necesita cambios de
código para ese ensayo; no usar el script sintético para restaurar el dump.

Procedimiento local, después de descargar el respaldo; puertos y contenedor exclusivos
de prueba, con la app de prueba anterior detenida. Desde la raíz, PowerShell:

```powershell
$Dump = Read-Host 'Ruta local del respaldo verificado .sql.gz'
docker run -d --name ambarcrm-ensayo-dump -e POSTGRES_USER=dueno -e POSTGRES_PASSWORD=dueno_test -e POSTGRES_DB=crm -p 127.0.0.1:55450:5432 postgres:16
docker exec ambarcrm-ensayo-dump pg_isready -U dueno -d crm
docker exec ambarcrm-ensayo-dump psql -U dueno -d crm -v ON_ERROR_STOP=1 -c "CREATE ROLE crm_app LOGIN PASSWORD 'app_test' NOSUPERUSER NOBYPASSRLS"
docker cp $Dump ambarcrm-ensayo-dump:/tmp/respaldo.sql.gz
docker exec ambarcrm-ensayo-dump bash -o pipefail -c 'gzip -dc /tmp/respaldo.sql.gz | psql -X -U dueno -d crm -v ON_ERROR_STOP=1'
docker exec ambarcrm-ensayo-dump psql -U dueno -d crm -c 'SELECT count(*) AS canales FROM canales_whatsapp; SELECT count(*) AS conversaciones FROM conversaciones; SELECT count(*) AS mensajes FROM mensajes;'
1..3 | ForEach-Object {
  Measure-Command { Get-Content web/prisma/sql/actualizaciones.sql -Raw -Encoding utf8 | docker exec -i ambarcrm-ensayo-dump psql -X -U dueno -d crm -v ON_ERROR_STOP=1 }
  if ($LASTEXITCODE -ne 0) { throw 'Falló el SQL del ensayo; detener y revisar' }
}
docker exec ambarcrm-ensayo-dump psql -U dueno -d crm -c 'SELECT count(*) AS canales FROM canales_whatsapp; SELECT count(*) AS conversaciones FROM conversaciones; SELECT count(*) AS mensajes FROM mensajes; SELECT permisos,count(*) FROM bots GROUP BY permisos;'
$env:DATABASE_URL = 'postgresql://crm_app:app_test@127.0.0.1:55450/crm'
$env:ADMIN_DATABASE_URL = 'postgresql://dueno:dueno_test@127.0.0.1:55450/crm'
Push-Location web
npx --yes tsx prisma/scripts/test-aislamiento.ts
Pop-Location
```

Esperar `pg_isready` en 0 antes de restaurar. Guardar salidas y comparar conteos,
permisos, timestamps y backfills con el respaldo; no avanzar si hay discrepancias
no explicadas. No usar esta copia para conectar canales o enviar mensajes.
Al cerrar la revisión local: `docker rm -f ambarcrm-ensayo-dump`; elimina únicamente
ese contenedor temporal. Nunca reemplazar el nombre por el de una BD real.
