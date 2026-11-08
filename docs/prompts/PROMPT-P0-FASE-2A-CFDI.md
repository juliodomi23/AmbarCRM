# Prompt para DeepSeek Flash — Fase 2A: CFDI 4.0 (diseño, modelo y mock)

> Copia todo este archivo en el modelo. Esta fase **no timbra de verdad**: deja el esqueleto, el modelo, los contratos, el mock y la UI base.
> El timbrado real con el PAC va en una Fase 2B aparte.

## Contexto

- Repo: AmbarCRM (Next.js 16, TypeScript, Prisma, PostgreSQL 16, multi-tenant con RLS).
- Rama base: `codex/p0-fase-1.3-pagos` (commit `e4ec2d3`).
- Rama nueva: `codex/p0-fase-2a-cfdi`.
- No hagas push, merge ni deploy.
- No uses credenciales reales, CSD, llaves privadas ni cuentas de PAC.
- No toques la lógica de pagos ya cerrada.

## Lectura obligatoria

1. `PLAN-P0-COMPETITIVIDAD.md` (Fase 2).
2. `MULTI-TENANT.md`.
3. `docs/DESPLIEGUE.md`.
4. `web/src/lib/db.ts`, `web/prisma/schema.prisma`.
5. `web/prisma/sql/multi-tenant.sql` y `web/prisma/sql/actualizaciones.sql`.
6. `web/src/lib/pagos/*` (patrón de adaptador, idempotencia y RLS).
7. `web/src/lib/modulos-catalogo.ts`, `web/src/lib/modulos.ts`.
8. `web/src/components/ui.tsx`, `PanelListado`, `FormularioModulo`.
9. `web/scripts/check-pagos-online.ts` y `web/prisma/scripts/test-pagos-online-e2e.ts` como referencia de pruebas.

## Objetivo de la Fase 2A

Dejar listo un módulo de facturación CFDI 4.0 con:

- ADR y elección provisional de PAC.
- Modelo de datos multi-tenant.
- Validadores fiscales puros.
- Adaptador `ProveedorFactura` + `ProveedorMock`.
- Rutas API y UI base.
- Pruebas con mock y RLS.
- Documentación y variables.

Sin llamadas reales al PAC, sin timbrado real y sin certificados reales.

## Alcance exacto

### 1. ADR

Crea `docs/cfdi.md` con:

- Comparación breve Facturama vs. SW Sapien.
- Elección provisional: **Facturama** como PAC principal, SW Sapien como alternativa.
- Flujo: venta/pago → datos fiscales → factura borrador → timbrado → XML/PDF → cancelación.
- Riesgos: CSD, régimen fiscal, IVA/retenciones, cancelación, sandbox, idempotencia.
- Variables de entorno y qué NO se guarda en BD.
- Decisión de no implementar todavía llamadas reales.

### 2. Modelo de datos

Agrega con RLS, FK, índices y SQL idempotente:

- `datos_fiscales`: org, contacto, RFC, razón social, régimen fiscal, CP, uso CFDI, correo, activo.
- `facturas`: org, venta_id o pago_id, proveedor, serie, folio, uuid, estado (`borrador`, `timbrada`, `cancelada`, `error`), total, subtotal, impuestos, moneda, forma_pago, metodo_pago, xml_url, pdf_url, error, timestamps.
- `conceptos_factura` (o JSON si justificas): factura, descripción, cantidad, valor unitario, importe, IVA, retenciones.
- `eventos_factura`: org, factura, evento_id único, tipo, payload mínimo, procesado_at.
- `datos_emisor`: org, RFC, régimen, CP, serie, folio siguiente; **sin CSD ni llave privada en BD**.
- Unicidad: una factura timbrada por venta/pago (índice parcial) para evitar duplicados.
- No guardes CSD, llave privada, contraseña ni tokens del PAC en la BD. Usa variables/secretos y documéntalo.

### 3. Validadores y cálculo

Crea `web/src/lib/cfdi/`:

- `tipos.ts`: tipos de factura, estados, conceptos, datos fiscales.
- `validar.ts`: RFC, régimen fiscal, uso CFDI, CP, forma/método de pago, correo, moneda, cantidades e impuestos. Funciones puras.
- `calcular.ts`: subtotal, IVA 16%, retenciones básicas, total; redondeo a 2 decimales; el servidor recalcula todo.
- `servicio.ts`: crear borrador, timbrar con proveedor, cancelar, consultar; idempotencia por clave y por venta/pago.
- No confíes en totales del cliente.

### 4. Adaptador de PAC y mock

- Interfaz `ProveedorFactura` con `timbrar`, `consultar`, `cancelar`, `descargar`.
- `ProveedorMock`: genera UUID ficticio, XML/PDF de ejemplo y estados simulados; sin red.
- `ProveedorFacturama` **solo esqueleto** con `fetch` detrás de variables de entorno; no lo ejecutes en pruebas ni lo uses sin credenciales.
- Selección por configuración de módulo/entorno.
- Manejo de errores tipado y idempotencia.

### 5. API

Crea rutas con `requireModuloActivo`/`conModulo`, permisos y validación:

- `POST /api/facturas` (borrador o timbrado mock).
- `GET /api/facturas` (lista paginada).
- `GET /api/facturas/:id`.
- `POST /api/facturas/:id/cancelar`.
- `GET /api/facturas/:id/xml` y `/pdf` (mock o placeholder).
- Módulo `facturacion` o `cfdi` en `modulos-catalogo.ts`; permisos Admin/Finanzas/Ventas.
- Rate limit básico en creación/timbrado.
- No expongas secretos ni XML reales de clientes.

### 6. UI base

- Datos fiscales en la ficha de cliente/paciente (RFC, razón social, régimen, CP, uso CFDI, correo).
- Botón “Facturar” desde venta/pago con estado y validación.
- Pantalla de facturas con `PanelListado`: folio, cliente, total, estado, fecha, acciones.
- Detalle con XML/PDF simulados y cancelación (solo mock).
- Configuración del emisor y del PAC (sin CSD real): RFC, régimen, CP, serie, ambiente sandbox.
- Reutiliza `EncabezadoPagina`, `Boton`, `Badge`, `surface`; responsive y modo oscuro.
- No inventes diseño nuevo; sigue el estilo actual.

### 7. Pruebas

- `check-cfdi.ts`: RFC, régimen, uso CFDI, CP, moneda, cálculos, redondeo, estados, cancelación.
- E2E con PostgreSQL desechable y `ProveedorMock`:
  - Crear borrador y timbrar.
  - UUID único, XML/PDF simulados.
  - Idempotencia: dos timbrados de la misma venta → una factura.
  - Cancelación y estados.
  - RLS: empresa A no ve facturas/datos fiscales de B.
  - FK compuesta / aislamiento.
  - Totales recalculados en servidor.
- `npx prisma validate`, `npx tsc --noEmit`, `npm run lint`, `npm run check:cfdi`, `npm run build`.
- Mantén `next build --webpack`.

### 8. Documentación

- `docs/cfdi.md` con arquitectura, variables, sandbox, CSD fuera de BD y flujo de cancelación.
- Actualiza `.env.example` (raíz y `web/.env.example`) con placeholders:
  - `CFDI_PROVEEDOR=mock`
  - `CFDI_AMBIENTE=sandbox`
  - `FACTURAMA_USUARIO=`, `FACTURAMA_PASSWORD=`, `FACTURAMA_URL=`
  - `CFDI_SERIE=`, `CFDI_RFC_EMISOR=`, `CFDI_REGIMEN_EMISOR=`, `CFDI_CP_EMISOR=`
  - `CFDI_TOKEN_ENCRYPTION_KEY=` (solo si hace falta cifrar algo; nunca CSD en BD)
- Actualiza `docs/DESPLIEGUE.md` si hay variables nuevas.

## Lo que NO debes hacer

- No llames al PAC real ni uses credenciales.
- No guardes CSD, llave privada, contraseña del PAC ni certificados en la BD.
- No implementes cancelación real ante el SAT.
- No toques pagos, OAuth, webhooks de pago ni la rama 1.3.
- No agregues dependencias sin justificar.
- No hagas push, merge ni deploy.

## Criterios de aceptación

- [ ] ADR y elección provisional del PAC documentados.
- [ ] Tablas con RLS, FK, índices y SQL idempotente.
- [ ] Validadores y cálculo probados.
- [ ] `ProveedorFactura` + mock funcionando sin red.
- [ ] API y UI base con estados reales del mock.
- [ ] Idempotencia y unicidad por venta/pago.
- [ ] Pruebas E2E con Postgres desechable y RLS.
- [ ] `tsc`, ESLint, `check:cfdi` y build verdes.
- [ ] Sin secretos, sin PAC real, sin push/deploy.

## Entrega

1. Rama y commit local.
2. Archivos cambiados.
3. Decisiones y supuestos.
4. Comandos y resultados.
5. Evidencia de RLS, idempotencia y cancelación mock.
6. Pendientes para la Fase 2B (sandbox real, CSD, PAC, cancelación SAT).
7. Riesgos para revisión de Julio.

No avances a la Fase 2B. No hagas push. No despliegues.
