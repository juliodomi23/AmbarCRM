# Despacho contable

## Activación y alcance

El módulo usa la clave `despacho`, aparece en `/despacho` y se activa por
organización en **Configuración → Clientes Ámbar CRM**. No está restringido a un
`orgId` y permanece apagado mientras la plataforma no lo active. Los puestos
sugeridos son Administrador, Director general, Gerente general y Contador.

Despacho no modifica Contactos ni Tareas: usa el contacto existente como cliente
y guarda su propia ficha en `despacho_clientes`. Los clientes, procesos y
plantillas se desactivan (soft delete) para conservar el historial; no se borran
desde la aplicación.

## Procesos y periodos

Cada proceso define una periodicidad (`semanal`, `mensual`, `bimestral`,
`trimestral` o `anual`) y una lista ordenada de actividades con día límite.

- Semanal: el periodo inicia el lunes y el día límite se interpreta como día de
  la semana (1 = lunes, 7 = domingo).
- Mensual: periodo el día 1 y el límite se ajusta al último día del mes cuando se
  captura 29, 30 o 31.
- Bimestral: inicia en enero, marzo, mayo, julio, septiembre o noviembre.
- Trimestral: inicia en enero, abril, julio u octubre.
- Anual: inicia el 1 de enero.

Al generar un mes, un proceso semanal crea una instancia por cada lunes del mes;
el resto crea una sola instancia. La operación es idempotente: la unique parcial
`despacho_actividades_org_cliente_plantilla_periodo_uq` evita duplicados al
repetir la generación.

## Estados y avance

| Estado | Uso |
| --- | --- |
| `pendiente` | Actividad generada y sin iniciar. |
| `en_proceso` | El responsable ya trabaja en ella. |
| `completada` | Actividad terminada. |
| `bloqueada` | Requiere una acción externa antes de completarse. |

Una actividad `bloqueada` no puede pasar directamente a `completada`. El avance
se calcula como porcentaje entero de actividades completadas; sin actividades el
avance es `null`. Una actividad no completada se marca atrasada después del fin
del día de su fecha límite en `America/Mexico_City`.

El resumen agrupa el avance por gerencia (responsable del cliente), por personal
y por cliente. Las actividades atrasadas aparecen en el tablero y en la vista
**Mi trabajo**.

## Permisos

- Administrador, Director general y Gerente general pueden crear clientes,
  configurar procesos, asignar responsables, reasignar y generar meses.
- Contador solo puede cambiar estado y notas de las actividades donde es
  responsable. No puede tocar actividades ajenas ni reasignarlas.
- La comprobación se hace en el servidor, no solo en la interfaz.

## Rutas

| Ruta | Uso |
| --- | --- |
| `/despacho` | Resumen, avance y actividades atrasadas. |
| `/despacho/tablero` | Tablero general con filtros por cliente, responsable y estado. |
| `/despacho/mi-trabajo` | Actividades del usuario en sesión. |
| `/despacho/clientes` | Listado y alta de clientes del despacho. |
| `/despacho/clientes/[id]` | Ficha, procesos asignados y actividades recientes. |
| `/despacho/configuracion` | Procesos, plantillas y generación del mes. |

Las APIs viven en `/api/despacho/*` y están protegidas con
`conModulo("despacho", …)`. La generación responde a
`POST /api/despacho/generar` con `{ mes, procesoIds? }` y revalida las páginas
afectadas.

## Pruebas y demo

- `npx tsx scripts/check-despacho.ts` valida reglas puras; con `CHECK_DB=1`
  agrega RLS, activación del módulo, unique por contacto y control de versión.
- `ALLOW_DEMO_SEED=1 ORG_SLUG=refmex node scripts/seed-demo-despacho.mjs correo contraseña`
  crea la organización `refmex` con clientes, procesos, actividades del
  mes actual y anterior, y datos 100% ficticios.
- `prisma/scripts/test-aislamiento.ts` incluye los CHECK nuevos de estados y
  periodicidad.
