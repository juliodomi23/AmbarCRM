# Taller mecánico

## Activación y alcance

El módulo usa la clave `taller`, aparece en `/taller` y se activa por organización
en **Configuración → Clientes Ámbar CRM**. No está restringido a un `orgId` y
permanece apagado mientras la plataforma no lo active para la organización. Los
puestos sugeridos son Administrador, Recepcionista y Mecánico.

Taller registra unidades que pertenecen a los clientes. No lee ni modifica la
tabla `vehiculos` ni el módulo Automotriz, que representa inventario de venta.
La persona cliente es el contacto existente para conservar su teléfono e historial.

## Estados de las órdenes

| Estado | Uso |
| --- | --- |
| `recibido` | Se registra el vehículo, km de entrada y falla reportada. |
| `diagnostico` | El taller prepara diagnóstico y conceptos de trabajo. |
| `esperando_aprobacion` | Se generó una liga pública de un solo uso para el cliente. |
| `en_reparacion` | Inicia el trabajo, tras aprobación o decisión interna desde diagnóstico. |
| `listo` | Reparación terminada, pendiente de entrega. |
| `entregado` | Vehículo devuelto al cliente. |
| `cancelado` | Orden cancelada; las refacciones reservadas se regresan al inventario. |

Las transiciones inválidas se rechazan. Solo la API de aprobación genera el enlace
y mueve la orden a `esperando_aprobacion`. Cada cambio de estado guarda fecha y
actor (miembro del equipo o cliente). Las ediciones validan `version`; el servidor
recalcula el total desde cantidades y precios. Si se cambian conceptos tras una
aprobación, la orden vuelve a diagnóstico y requiere una aprobación nueva. El total
no puede quedar por debajo de los pagos registrados. El kilometraje de la ficha solo
sube cuando el valor capturado es mayor.

## Tablas

- `taller_vehiculos`: propietario, placa, VIN opcional, marca, modelo, año, color,
  kilometraje, notas y versión. Placa y VIN son únicos por organización.
- `taller_ordenes`: vehículo, folio, estado, km de entrada, falla, diagnóstico,
  responsable mecánico, fecha promesa, total, versión y aprobación.
- `taller_orden_conceptos`: mano de obra y refacciones con cantidad y precio.
- `taller_orden_cambios`: historial de estado, actor y fecha.
- `taller_fotos`: referencia a medios de ingreso, daños o evidencia.
- `taller_refacciones`: código, existencia, costo, precio y mínimo.
- `taller_pagos`: anticipos y liquidaciones ligados a una orden.
- `taller_recordatorios`: servicio próximo por kilometraje y/o fecha.

Todas las tablas tienen `org_id` por defecto desde `app.current_org`, RLS con la
política `org_isolation`, permisos de `crm_app` e índices por organización. Las
relaciones a contactos, vehículos, órdenes y refacciones comprueban el mismo tenant.

## Límites e integraciones

Las órdenes se cotizan con sus propios conceptos. El módulo Cotizaciones actual
genera partidas comerciales y no enlaza una orden de taller. La aprobación propia
muestra el importe y permite aprobar o solicitar revisión. El enlace solo funciona
una vez y se comparte manualmente; el módulo no envía mensajes de WhatsApp.

Citas se revisó como alternativa de agenda. La fecha promesa de entrega no incluye
hora ni duración y no representa por sí sola una cita; por eso el módulo no crea
eventos de calendario automáticamente. La ficha de cliente sí reutiliza el contacto
y su teléfono.

Las fotos aceptan JPG, PNG y WebP de hasta 8 MB y se sirven con el storage de medios
existente, bajo la sesión y organización correspondientes. El proxy de Next admite
cuerpos de hasta 12 MB para que una foto de 8 MB en base64 llegue completa a la API.

Los pagos se guardan directamente en la orden porque Caja solo cobra ventas de
mostrador y Cobros requiere un contrato. No crean movimientos en esos módulos.
Se pueden registrar pagos después de entregar mientras haya saldo; una orden
cancelada queda cerrada. Entregar con saldo exige confirmación expresa de un
administrador. Cancelar una orden con pagos también requiere confirmación de un
administrador; los pagos quedan visibles y cualquier reembolso se resuelve fuera del
sistema. No se permiten pagos mayores al saldo.

El folio de orden es consecutivo dentro de cada organización. Un contador por tenant
se actualiza de forma atómica al crear la orden; la migración lo inicializa desde el
mayor folio existente y conserva los folios históricos.

La lista `/taller/recordatorios` compara fecha y kilometraje del vehículo y separa
próximos de vencidos. Crear el recordatorio es manual. No hay cron ni envío de
WhatsApp; no existe interruptor, plantilla ni opt-in configurado para Taller.

La asignación `mecanico_id` valida que el usuario exista dentro de la organización
con `referenciaPropia`; no exige que el usuario tenga un puesto específico.

## Migración y comprobaciones

Las tablas se crean en `web/prisma/sql/actualizaciones.sql` y se reflejan en
`web/prisma/schema.prisma`. La prueba crea `taller_test` si no existe, aplica
`schema.sql`, `multi-tenant.sql` y `actualizaciones.sql`, y solo acepta conexiones a
localhost. Requiere PostgreSQL local, permiso de crear bases en `postgres`, el rol
`crm_app` creado por la migración y el servidor Next local.

En PowerShell, desde `web`, configura las conexiones de prueba (sustituye la clave
local de administrador):

```powershell
$env:DATABASE_URL = "postgresql://crm_app:CAMBIA_ESTA_CLAVE@127.0.0.1:5432/taller_test?schema=public"
$env:ADMIN_DATABASE_URL = "postgresql://postgres:TU_CLAVE_LOCAL@127.0.0.1:5432/postgres?schema=public"
$env:NEXTAUTH_SECRET = "secreto-local-solo-para-pruebas"
$env:APP_URL = "http://127.0.0.1:3011"
npm run dev -- --port 3011
```

En otra terminal PowerShell, dentro de `web`, define las mismas variables y corre:

```powershell
$env:DATABASE_URL = "postgresql://crm_app:CAMBIA_ESTA_CLAVE@127.0.0.1:5432/taller_test?schema=public"
$env:ADMIN_DATABASE_URL = "postgresql://postgres:TU_CLAVE_LOCAL@127.0.0.1:5432/postgres?schema=public"
$env:NEXTAUTH_SECRET = "secreto-local-solo-para-pruebas"
$env:APP_URL = "http://127.0.0.1:3011"
npm run check:taller
```

El script rechaza URLs fuera de `localhost/taller_test` (app) y `localhost/postgres`
(admin). No elimina una base existente. Limpia sus organizaciones de fixture al
finalizar. Las peticiones HTTP cubren página/API pública sin sesión, token de un solo
uso, cambios de conceptos y aprobación, módulo apagado, cobros y cancelaciones con
pagos, entrega con saldo y folios por organización bajo concurrencia. No simulan una
foto real de 7 MB; esa verificación sigue pendiente en un entorno con PostgreSQL y
servidor local disponibles.

## Demo de taller

`web/scripts/seed-demo-taller.mjs` crea la organización `demo-taller` ("Taller Rivera") con los
módulos Taller y Citas activos: 3 usuarios del equipo, 7 vehículos de 6 clientes, 7 órdenes en
todos los estados (una con saldo pendiente, una esperando aprobación con enlace público), 6
refacciones (dos con existencia baja), pagos, recordatorios (uno vencido), 3 citas, y chats,
oportunidades, tareas y reseñas del perfil `PERFIL_TALLER`.

```bash
ALLOW_DEMO_SEED=1 node scripts/seed-demo-taller.mjs [correo] [contraseña]
```

Es idempotente y solo toca `demo-taller`: reinicia pagos, recordatorios, órdenes, vehículos y
refacciones de esa organización y recalcula las fechas respecto a hoy; conviene correrlo antes de
cada demo. Imprime el enlace de aprobación de la orden que espera al cliente (`/taller-aprobacion/…`).
Requiere `actualizaciones.sql` aplicado y se niega a correr con `NODE_ENV=production`.

## Preparar la base de la prueba

`npm run check:taller` espera `taller_test` ya preparada. `actualizaciones.sql` usa valores de
enum nuevos en el mismo lote, así que `pg` no puede aplicarlo en una sola transacción: cárgalo con
`psql` (quita el BOM inicial de `actualizaciones.sql`):

```bash
createdb taller_test
for f in ../schema.sql prisma/sql/multi-tenant.sql prisma/sql/actualizaciones.sql; do
  sed 's/^\xEF\xBB\xBF//' "$f" | psql -d taller_test -q
done
```
