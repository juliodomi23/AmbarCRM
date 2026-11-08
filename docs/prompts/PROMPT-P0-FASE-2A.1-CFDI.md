# Prompt para DeepSeek Flash — Fase 2A.1: cierre de CFDI

> Copia todo este archivo en el modelo. Esta fase corrige los huecos de la Fase 2A.
> Sigue sin PAC real, sin CSD y sin SAT. No rehagas lo que ya funciona.

## Contexto

- Repo: AmbarCRM (Next.js 16, TypeScript, Prisma, PostgreSQL 16, multi-tenant con RLS).
- Rama actual: `codex/p0-fase-2a-cfdi`.
- Los cambios de la Fase 2A están en el árbol de trabajo, sin commit.
- Rama nueva para esta fase: `codex/p0-fase-2a.1-cfdi`.
- Antes de empezar, haz un commit local de la Fase 2A actual (`feat(cfdi): fase 2a ...`) o trabaja sobre el árbol y deja **un solo commit local** al final. No pierdas cambios.
- No hagas push, merge ni deploy.
- No uses PAC real, CSD, llaves privadas ni credenciales reales.
- No toques pagos, OAuth ni la lógica de la Fase 1.3.

## Lectura obligatoria

1. `docs/cfdi.md`.
2. `PLAN-P0-COMPETITIVIDAD.md` (Fase 2).
3. `web/src/lib/cfdi/servicio.ts`, `calcular.ts`, `validar.ts`, `tipos.ts`, `mock.ts`, `proveedor.ts`.
4. `web/prisma/schema.prisma` (modelos `Factura`, `ConceptoFactura`, `EventoFactura`, `DatosFiscales`, `DatosEmisor`).
5. `web/prisma/sql/actualizaciones.sql` (bloque CFDI).
6. `web/src/app/api/facturas/**`, `web/src/app/api/contactos/[id]/datos-fiscales`.
7. `web/src/components/facturacion/**`, `web/src/components/contactos/DatosFiscalesFicha.tsx`.
8. `web/prisma/scripts/test-cfdi-e2e.ts`, `web/scripts/check-cfdi.ts`.
9. `MULTI-TENANT.md`.

## Lo que ya está bien y NO debes rehacer

- Modelo base con RLS, FK compuestas y SQL idempotente.
- Creación de borrador, idempotencia por clave/origen, una factura activa por venta/pago.
- Validadores fiscales, cálculo base, mock, XML/PDF de ejemplo, cancelación mock.
- UI de facturas, detalle, datos fiscales y botón Facturar desde ventas.
- E2E básico y checks actuales.

## Correcciones obligatorias

### 1. Timbrado concurrente (bloqueante)

Hoy dos solicitudes pueden leer la misma factura `borrador` y timbrarla dos veces.

- Agrega el estado `timbrando` a `ESTADOS_FACTURA`, schema/SQL, UI y validaciones.
- En `timbrarFactura`, reclama la factura de forma atómica antes de llamar al PAC:
  - `UPDATE facturas SET estado = 'timbrando', timbrando_at = now() WHERE id = ... AND org_id = ... AND estado IN ('borrador','error') RETURNING ...`
  - Si no actualiza: carga la factura. Si ya está `timbrada`, devuélvela; si está `timbrando`, responde 409 “timbrado en proceso”; si está `cancelada`, 409.
- Incluye `timbrando` en el índice único activo por origen (`borrador`, `timbrando`, `timbrada`) y en la comprobación de factura activa.
- Si el PAC falla, pasa a `error` y limpia `timbrando_at`.
- Para un `timbrando` viejo (por ejemplo > 10 minutos), permite reintento/manual y documenta la recuperación.
- Prueba: dos `timbrarFactura` simultáneos → un solo UUID/folio, una respuesta 200 y otra 409/duplicada.
- No dejes que un `crearFactura` cree otra factura mientras hay una `timbrando` para el mismo origen.

### 2. Snapshot fiscal inmutable (bloqueante)

La factura no guarda el receptor/emisor con el que se timbró; hoy las descargas usan datos actuales.

- Agrega a `facturas`: `receptor_rfc`, `receptor_razon_social`, `receptor_regimen_fiscal`, `receptor_codigo_postal`, `receptor_uso_cfdi`, `receptor_correo`; `emisor_rfc`, `emisor_razon_social`, `emisor_regimen_fiscal`, `emisor_codigo_postal`.
- Al timbrar, guarda el snapshot dentro de la misma transacción/actualización final; no lo sobrescribas en reintentos si ya está timbrada.
- `descargarFactura` y el detalle deben usar el snapshot para facturas `timbrada`/`cancelada`; para borradores pueden usar los datos actuales.
- Muestra RFC y razón social del receptor en `FacturaDetalle` (hoy solo muestra nombre/email del contacto).
- Migración: agrega columnas nullable; para facturas ya timbradas, rellena best-effort desde los datos actuales y documenta que no son un CFDI real.
- Prueba: timbra, cambia los datos fiscales del contacto y del emisor, y verifica que el XML/PDF/detalle conservan el snapshot original.

### 3. Guardar XML/PDF del timbrado

Hoy `timbrarFactura` descarta `resultado.xml` y `resultado.pdf`; las descargas regeneran un documento mock.

- Agrega `xml` (TEXT) y `pdf` (BYTEA) a `facturas` o usa almacenamiento privado; para 2A usa columnas en BD.
- En `timbrarFactura`, guarda el XML y PDF devueltos por el proveedor junto con UUID/folio/fecha.
- Las rutas XML/PDF deben servir el contenido guardado; si no existe (factura legacy), devuelve 409 claro, no regeneres silenciosamente.
- No guardes XML/PDF en logs ni en el listado.
- Prueba: descarga XML/PDF antes y después de cambiar datos; deben ser idénticos; el XML debe contener el UUID del timbrado guardado.

### 4. IVA exacto y tolerancia

`conceptosDesdeTotal` ajusta la tasa de IVA para forzar el total y `totalCoincide` acepta 2 centavos; eso no es válido para un CFDI real.

- Usa siempre `ivaTasa = 0.16` exacta para el régimen general.
- Desglosa `subtotal = round(total / 1.16, 2)`, `iva = round(total - subtotal, 2)`.
- Si el total no cuadra al centavo por redondeo, ajusta el valor unitario con hasta 6 decimales (cambia `valorUnitario` a `Decimal(12,6)` si hace falta) o agrega un concepto de ajuste por el centavo, sin cambiar la tasa.
- Reduce `TOLERANCIA_TOTAL` a 0.01 o exige igualdad exacta; actualiza `check-cfdi`.
- Prueba: totales 100.00, 116.00, 99.99, 0.01 y 1,000,000.00; el IVA debe ser 16% exacto y el total debe coincidir.

### 5. Folios únicos y monotónicos

- No permitas bajar `datos_emisor.folio_siguiente` por debajo del último folio usado para esa serie.
- Agrega índice único `(org_id, serie, folio)` para facturas `timbrada` (o `timbrada`/`cancelada`; decide y documenta).
- `asignarFolio` debe seguir siendo atómico.
- Prueba: intentar bajar el folio, timbrar dos veces y verificar que no hay folio duplicado.

### 6. Permisos y UI

- Restringe `timbrar` y `cancelar` a Administrador/Finanzas; crear borrador puede quedar para Admin/Finanzas/Ventas/Cajero según el módulo.
- No confíes en la UI: valida en el servidor.
- En 2A, el selector de PAC debe ofrecer **solo mock** o marcar Facturama/SW Sapien como “Fase 2B”; no dejes que el usuario seleccione un proveedor que devuelve 501.
- Muestra el motivo de cancelación en el historial (hoy el evento guarda `motivo` pero la UI no lo enseña).
- Si agregas “Consultar estatus”, usa `consultarFactura` y una ruta protegida; si no, documenta que queda para 2B.

### 7. Consistencia Prisma/SQL y documentación

- Alinea las relaciones de `Factura` con las FK compuestas del SQL (`venta`, `pago`, `contacto`). Si no puedes hacerlo sin romper, documenta la divergencia y no agregues una FK simple que contradiga la compuesta.
- Revisa que `prisma db push` y `schema.sql → multi-tenant.sql → actualizaciones.sql` dejen el mismo esquema.
- Elimina de `.env.example` y `docs/cfdi.md` las variables CFDI que el código no usa (`CFDI_AMBIENTE`, `CFDI_SERIE`, `CFDI_RFC_EMISOR`, `CFDI_REGIMEN_EMISOR`, `CFDI_CP_EMISOR`, `CFDI_TOKEN_ENCRYPTION_KEY`) o impleméntalas como fallback real. No dejes documentación que prometa algo que no pasa.
- Actualiza `docs/cfdi.md` con: `timbrando`, snapshot, XML/PDF persistidos, IVA exacto, folios, permisos y límites de 2A.
- Documenta que el flujo de facturación de **pagos** existe en API pero no tiene UI todavía, si no lo agregas.

### 8. Pruebas

- `check-cfdi` actualizado con IVA exacto/tolerancia y folios.
- E2E con PostgreSQL desechable:
  - Timbrado concurrente: un solo UUID/folio.
  - Snapshot inmutable tras cambiar datos fiscales/emisor.
  - XML/PDF guardados e idénticos en dos descargas.
  - Folio monotónico/único.
  - Permisos de timbrar/cancelar.
  - Flujo de pago por API si lo conservas.
  - RLS con dos organizaciones.
- `npx prisma validate`, `npx tsc --noEmit`, `npm run lint`, `npm run check:cfdi`, `npm run build`.
- Mantén `next build --webpack`.

## Criterios de aceptación

- [ ] Un solo timbrado por factura aunque haya concurrencia.
- [ ] Snapshot de receptor/emisor inmutable en facturas timbradas/canceladas.
- [ ] XML/PDF reales del mock se guardan y se sirven sin regenerarse.
- [ ] IVA 16% exacto y totales al centavo.
- [ ] Folios únicos y no decrecientes.
- [ ] Permisos de timbrar/cancelar aplicados en servidor.
- [ ] UI solo ofrece mock en 2A.
- [ ] Prisma y SQL alineados o divergencia documentada.
- [ ] Docs/env sin variables muertas.
- [ ] E2E, checks y build verdes.
- [ ] Sin push, deploy, PAC real ni CSD.

## Entrega

1. Rama y commit local.
2. Archivos cambiados.
3. Decisiones y supuestos.
4. Comandos y resultados.
5. Evidencia de concurrencia, snapshot, XML/PDF y folios.
6. Pendientes para Fase 2B (PAC real, CSD, cancelación SAT, XML/PDF en almacenamiento definitivo).
7. Riesgos para revisión de Julio.

No avances a la Fase 2B. No hagas push. No despliegues.
