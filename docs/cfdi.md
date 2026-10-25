# CFDI 4.0 en AmbarCRM

Estado: **Fase 2A.1 (mock, sin PAC real)**. Esta fase no timbra contra el SAT,
no usa certificados (CSD) reales y no llama a ningún PAC. Deja listos el modelo,
los contratos, el mock, la API, la UI, las pruebas y las garantías de
concurrencia para que la Fase 2B conecte un PAC real en sandbox.

## 1. Decisión provisional de PAC (ADR)

### Contexto

AmbarCRM necesita emitir facturas CFDI 4.0 por ventas y pagos, con XML/PDF,
consulta de estatus y cancelación. La integración debe ser multi-tenant: cada
organización tiene su RFC, régimen fiscal, serie y credenciales de PAC.

### Opciones

| Criterio | Facturama | SW Sapien |
| --- | --- | --- |
| API | REST/JSON, documentación pública y sandbox | SOAP/REST, documentación pública y sandbox |
| Facilidad de integración | Alta: endpoints simples y respuestas JSON | Media: el flujo SOAP requiere más mapeo |
| Timbrado y cancelación | Cubre ambos, incluida aceptación del receptor | Cubre ambos |
| Multi-tenant | Credenciales por emisor | Credenciales por emisor |
| Costo / operación | Planes por volumen, consola administrativa | Planes por volumen, consola administrativa |
| Riesgo de dependencia | Medio | Medio |

### Decisión

- **PAC principal provisional: Facturama.**
- **Alternativa: SW Sapien.**

La decisión es provisional porque en Fase 2A.1 no se contrata ni se prueba
ningún PAC. Se elige Facturama por la simplicidad de su API JSON para el flujo
que ya usa el CRM (crear factura, timbrar, descargar, cancelar) y porque permite
dejar el adaptador detrás de una interfaz sin acoplar el dominio.

### Consecuencias

- El dominio no depende de Facturama: `ProveedorFactura` es la frontera.
- Cambiar a SW Sapien solo requiere un adaptador nuevo y configuración.
- Las credenciales viven en variables de entorno/secretos, nunca en la BD.
- La Fase 2B debe validar el sandbox real, el esquema de cancelación y los
  catálogos SAT vigentes antes de producción.

## 2. Flujo

```
Venta o pago
   |
   +-- Datos fiscales del contacto (RFC, razón social, régimen, CP, uso CFDI)
   |
   +-- Factura en borrador (conceptos recalculados en servidor)
   |
   +-- Timbrado con ProveedorFactura (mock en Fase 2A.1)
   |      +-- UUID, serie/folio, XML y PDF persistidos
   |
   +-- Consulta de estatus
   |
   +-- Cancelación (mock en Fase 2A.1; SAT real en Fase 2B)
```

Reglas del servidor:

- El cliente nunca define subtotal, impuestos ni total: se recalculan.
- El total de la venta/pago se interpreta como importe **con IVA incluido** y se
  desglosa con IVA 16 % exacto. Si el redondeo por concepto desvía el total, se
  separa un concepto de ajuste; la tasa no cambia.
- `TOLERANCIA_TOTAL = 0.01`. El total calculado debe coincidir con el origen
  dentro de un centavo.
- Una venta o un pago solo puede tener **una factura activa** (borrador,
  timbrando o timbrada) y **una timbrada**. La creación es idempotente por
  `idempotency_key`.
- Los estados válidos son `borrador`, `timbrando`, `timbrada`, `cancelada` y
  `error`.
- El timbrado se reclama con un `UPDATE ... WHERE estado IN ('borrador','error')
  OR (estado = 'timbrando' AND timbrando_at < now() - 10 minutes)`. Solo una
  petición puede reclamar la factura; las demás reciben
  `timbrado_en_proceso`.
- El folio se asigna de forma atómica con `UPDATE ... RETURNING`. La
  configuración del emisor no puede retroceder el folio por debajo del último
  usado en la serie (`folio_decreciente`).
- Al timbrar se guarda un snapshot fiscal del receptor y del emisor. Cambios
  posteriores en `datos_fiscales` o `datos_emisor` no alteran facturas ya
  timbradas.
- El XML y el PDF del PAC se guardan en `facturas.xml` y `facturas.pdf`. Las
  descargas leen esos archivos; no se regeneran. Si una factura antigua no los
  tiene, responde `409 archivo_no_disponible`.
- Solo Administrador o Finanzas pueden timbrar o cancelar. Configurar el emisor
  requiere rol administrador.

## 3. Modelo de datos

Todas las tablas llevan `org_id` con `DEFAULT
NULLIF(current_setting('app.current_org', true), '')::bigint` y política RLS
`org_isolation`, igual que el resto del CRM.

- `datos_fiscales`: un registro activo por contacto y organización.
- `datos_emisor`: RFC, razón social, régimen, CP, serie, folio siguiente,
  ambiente y proveedor. **Sin CSD, sin llave privada y sin contraseña.**
- `facturas`: origen (`venta_id` o `pago_id`), contacto, proveedor, serie,
  folio, UUID, estado, importes, XML/PDF, error, idempotencia, `timbrando_at`,
  `timbrada_at`, `cancelada_at` y snapshot fiscal del receptor/emisor.
- `conceptos_factura`: descripción, cantidad, valor unitario, importe, IVA y
  retenciones.
- `eventos_factura`: bitácora mínima de creación, timbrado, consulta,
  cancelación y errores.

### Unicidad e integridad

- `UNIQUE (org_id, idempotency_key)` en `facturas`.
- `UNIQUE (org_id, uuid)` cuando el UUID existe.
- `facturas_un_activa_venta_idx` y `facturas_un_activa_pago_idx`: una factura
  activa por venta/pago (`borrador`, `timbrando`, `timbrada`).
- `facturas_org_serie_folio_uq`: folio único por organización y serie para
  facturas `timbrada` o `cancelada`.
- FKs compuestas `(venta_id, org_id)`, `(pago_id, org_id)` y
  `(contacto_id, org_id)` para que RLS no se pueda saltar con un ID de otra
  organización.

La migración agrega las columnas de snapshot como nullable y rellena
best-effort las facturas ya timbradas con los datos actuales del contacto y del
emisor. Ese relleno es informativo: no convierte facturas históricas en CFDIs
reales ni sustituye el XML original del PAC.

## 4. Validadores y cálculo

- `web/src/lib/cfdi/validar.ts`: funciones puras para RFC, régimen fiscal, uso
  CFDI, CP, forma/método de pago, correo, moneda, cantidades e impuestos.
- `web/src/lib/cfdi/calcular.ts`: importes en centavos, redondeo a 2 decimales,
  IVA 16 % y retenciones básicas. Incluye el desglose desde total con concepto
  de ajuste.
- `web/src/lib/cfdi/servicio.ts`: crear borrador, timbrar, cancelar, consultar y
  descargar. Recalcula todo, aplica idempotencia, reclamo atómico y snapshot.
- `web/src/lib/cfdi/permisos.ts`: regla compartida de Administrador/Finanzas
  para timbrar y cancelar.

### Límite conocido del desglose

Con IVA 16 % exacto e importes de 2 decimales, algunos totales mínimos no se
pueden representar. Por ejemplo, `0.04` no admite una combinación de importe e
IVA al 16 % que sume exactamente `0.04`. `conceptosDesdeTotal` lanza un error
explícito para ese caso; la API lo convierte en `409`. Los totales normales y
`0.01` sí se procesan. Si el negocio necesita facturar esos centavos, la Fase 2B
debe definir una regla fiscal (por ejemplo, ajuste de IVA o partida exenta) con
respaldo contable.

## 5. Adaptador de PAC

```ts
interface ProveedorFactura {
  timbrar(datos: DatosTimbrado): Promise<ResultadoTimbrado>;
  consultar(uuid: string): Promise<ConsultaFactura>;
  cancelar(uuid: string, motivo: string): Promise<ResultadoCancelacion>;
  descargar(datos: DatosDescarga, formato: "xml" | "pdf"): Promise<Buffer>;
}
```

- `ProveedorMock`: sin red, UUID ficticio, XML/PDF de ejemplo y estados
  simulados. Bloqueado en producción salvo `CFDI_PERMITIR_MOCK=1`.
- `ProveedorFacturama`: **solo esqueleto**. Hace `fetch` a `FACTURAMA_URL` con
  Basic Auth si las variables existen, pero no se usa en pruebas ni se ejecuta
  sin credenciales.
- Selección: `datos_emisor.proveedor` o `CFDI_PROVEEDOR` (por defecto `mock`).
- En Fase 2A.1 solo se acepta `mock` al guardar el emisor. Facturama y SW Sapien
  responden `409 proveedor_fase_2b`.

## 6. Variables de entorno

```env
CFDI_PROVEEDOR=mock
CFDI_PERMITIR_MOCK=0
FACTURAMA_USUARIO=
FACTURAMA_PASSWORD=
FACTURAMA_URL=
```

- `CFDI_PERMITIR_MOCK=1` solo para entornos controlados. En producción el mock
  se rechaza.
- `FACTURAMA_PASSWORD` y cualquier token son secretos de despliegue; no se
  guardan en la base de datos ni se registran en logs.
- Las variables de emisor (`CFDI_AMBIENTE`, `CFDI_SERIE`, `CFDI_RFC_EMISOR`,
  `CFDI_REGIMEN_EMISOR`, `CFDI_CP_EMISOR`) y
  `CFDI_TOKEN_ENCRYPTION_KEY` se retiraron porque no tenían implementación. La
  configuración del emisor vive en `datos_emisor`.

### Qué NO se guarda en la BD

- Certificados de Sello Digital (`.cer`).
- Llaves privadas (`.key`).
- Contraseñas de llave privada.
- Usuario/contraseña o tokens del PAC.
- XML reales de clientes fuera de `facturas.xml`.

El XML/PDF del mock se persiste en `facturas.xml` y `facturas.pdf` para que la
descarga sea idéntica al archivo timbrado y para no regenerarlo después.

## 7. Cancelación

- Fase 2A.1: solo el proveedor mock puede cancelar. Se guarda motivo, fecha y
  evento; el estado pasa a `cancelada`.
- Fase 2B: la cancelación real requiere motivo SAT, folio de sustitución cuando
  aplique y aceptación del receptor. No se implementa en esta fase.

## 8. Riesgos

- **CSD**: generarlo y resguardarlo es responsabilidad del emisor; el CRM no
  debe almacenarlo.
- **Régimen fiscal**: un régimen incorrecto invalida el CFDI. Se valida contra
  el catálogo permitido, pero la Fase 2B debe contrastar con el SAT.
- **IVA y retenciones**: la Fase 2A.1 solo modela IVA 16 % y retenciones
  básicas. Honorarios, arrendamiento, RESICO y exentos requieren reglas
  adicionales.
- **Centavos no representables**: ver el límite conocido del desglose.
- **Cancelación**: el SAT exige plazos y aceptación; el mock no lo simula.
- **Sandbox**: las credenciales y el ambiente deben ser explícitos por
  organización.
- **Idempotencia**: reintentos de red o doble clic no deben crear dos facturas.
  Se cubre con `idempotency_key`, índices parciales y reclamo atómico.
- **Datos fiscales**: son datos personales/fiscales; la RLS y las FKs compuestas
  evitan cruces entre organizaciones.
- **XML/PDF**: se guardan en la BD; revisar tamaño y política de retención antes
  de producción.

## 9. Pruebas

- `web/scripts/check-cfdi.ts`: validadores, cálculo, redondeo, tolerancia,
  permisos y límite del desglose.
- `web/prisma/scripts/test-cfdi-e2e.ts`: PostgreSQL desechable, RLS,
  idempotencia, snapshot inmutable, XML/PDF persistidos, folio monotónico,
  reclamo de timbrado viejo, concurrencia y cancelación.

```bash
cd web
npx prisma validate
npx prisma generate
npx tsc --noEmit
npm run lint
npm run check:cfdi
npm run build
```

### E2E con PostgreSQL aislado

El script se niega a correr contra otra base: exige `localhost`/`127.0.0.1` y
nombre `cfdi_test`. Usa dos conexiones:

- `DATABASE_URL` con el rol de aplicación (`crm_app`) para ejercitar RLS.
- `ADMIN_DATABASE_URL` con el rol dueño (`dueno`) para preparar y limpiar las
  organizaciones de prueba 93 y 94.

```bash
# 1. Crear la base y aplicar el esquema (una sola vez)
docker exec -i <contenedor> psql -U dueno -d postgres -c "CREATE DATABASE cfdi_test TEMPLATE app_movil_test OWNER dueno"
docker exec -i <contenedor> psql -U dueno -d cfdi_test -v ON_ERROR_STOP=1 -q < prisma/sql/actualizaciones.sql

# 2. Ejecutar el E2E
$env:DATABASE_URL="postgresql://crm_app:<clave>@127.0.0.1:<puerto>/cfdi_test?schema=public"
$env:ADMIN_DATABASE_URL="postgresql://dueno:<clave>@127.0.0.1:<puerto>/cfdi_test?schema=public"
npx tsx prisma/scripts/test-cfdi-e2e.ts
```

El script limpia las organizaciones 93/94 antes y después, valida que la
organización B no puede leer facturas de la organización A, y comprueba que el
XML/PDF descargado es el mismo que se persistió.

## 10. API y UI

- `GET/POST /api/facturas`: listado paginado y creación desde venta o pago.
- `GET /api/facturas/[id]`: detalle.
- `POST /api/facturas/[id]/timbrar`: timbrado; requiere Administrador/Finanzas.
- `POST /api/facturas/[id]/cancelar`: cancelación con motivo SAT; requiere
  Administrador/Finanzas.
- `GET /api/facturas/[id]/xml` y `GET /api/facturas/[id]/pdf`: descargas desde
  los archivos persistidos.
- `GET/POST/PATCH /api/facturas/configuracion`: datos del emisor y folio.
- `GET/PUT /api/contactos/[id]/datos-fiscales`: datos fiscales del contacto.
- UI: `/facturas` (listado, KPIs, filtros y alta), `/facturas/[id]` (detalle,
  snapshot fiscal, timbrado, cancelación e historial), ficha de
  cliente/paciente y listado de ventas con acción "Facturar".
- La UI oculta timbrar/cancelar si la sesión no es Administrador/Finanzas, y
  oculta "Configurar emisor" si no es administrador.
- El flujo de facturación de **pagos** existe en la API (`pagoId`), pero todavía
  no tiene una pantalla propia. Queda documentado para no prometer UI que no
  existe.
- El selector de proveedor muestra solo mock; Facturama y SW Sapien aparecen
  deshabilitados como Fase 2B.

## 11. Pendientes para Fase 2B

1. Contratar y configurar Facturama en sandbox.
2. Implementar el adaptador real (timbrado, consulta, cancelación, descargas).
3. Definir el manejo de CSD fuera de la BD (KMS/secret manager o carga
   efímera).
4. Completar catálogos SAT (claves de producto/servicio, unidades, impuestos).
5. Cancelación real con aceptación del receptor y folio de sustitución.
6. Conciliación de pagos parciales, notas de crédito y complementos de pago.
7. Pruebas de contrato contra el sandbox y monitoreo de errores del PAC.
8. Política de retención y respaldo para XML/PDF almacenados.
