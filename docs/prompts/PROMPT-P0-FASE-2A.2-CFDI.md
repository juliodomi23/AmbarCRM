# Prompt para DeepSeek Flash — Fase 2A.2: dos correcciones de CFDI

> Copia todo este archivo en el modelo. Solo corrige los dos puntos de abajo.
> Sigue sin PAC real, sin CSD y sin SAT. No rehagas la Fase 2A.1.

## Contexto

- Repo: AmbarCRM (Next.js 16, TypeScript, Prisma, PostgreSQL 16, multi-tenant con RLS).
- Rama base: `codex/p0-fase-2a.1-cfdi`.
- Commit base: `86a1e5d feat(cfdi): implementar Fase 2A.1 con timbrado mock`.
- Rama nueva: `codex/p0-fase-2a.2-cfdi`.
- Deja **un commit local** al final. No hagas push, merge ni deploy.
- No toques pagos, OAuth ni la Fase 1.3.
- No agregues PAC real ni cancelación SAT.
- No modifiques los documentos y prompts que ya estaban sin seguimiento.

## Lectura obligatoria

1. `web/src/lib/cfdi/servicio.ts`.
2. `web/src/lib/cfdi/calcular.ts`.
3. `web/src/lib/cfdi/tipos.ts`.
4. `web/prisma/schema.prisma` (modelos `Factura` y `ConceptoFactura`).
5. `web/prisma/sql/actualizaciones.sql` (bloque CFDI).
6. `web/src/app/(app)/facturas/[id]/page.tsx`.
7. `web/src/app/api/facturas/**`.
8. `web/prisma/scripts/test-cfdi-e2e.ts` y `web/scripts/check-cfdi.ts`.
9. `docs/cfdi.md`.

## Corrección 1 — No enviar XML/PDF en el detalle ni en las respuestas API

Hoy `selectFactura` incluye `xml` y `pdf`:

- `web/src/lib/cfdi/servicio.ts:705`

Ese `select` lo usan `obtenerFactura`, `crearFactura`, `timbrarFactura`, `cancelarFactura` y `FacturaPage`. Como `FacturaPage` hace `...factura` y `serializar(vista)`, y las rutas API devuelven la factura completa, el XML/PDF viaja al cliente aunque la UI no lo use. Con un PDF real eso infla el RSC/JSON.

### Cambios

1. Quita `xml: true` y `pdf: true` de `selectFactura`.
2. Mantén `descargarFactura` con su propio `select` que sí incluya `xml` y `pdf`; no cambies la descarga.
3. Verifica que `FacturaDetalleVista` y el detalle no esperen `xml`/`pdf`.
4. No agregues un endpoint nuevo para el detalle; el detalle debe usar metadatos, y la descarga sigue en `/api/facturas/[id]/xml` y `/pdf`.

### Pruebas

- Agrega una aserción en E2E: `obtenerFactura(id)` **no** tiene las propiedades `xml` ni `pdf`.
- Verifica que `descargarFactura(id, "xml")` y `descargarFactura(id, "pdf")` siguen devolviendo el contenido guardado.
- Si puedes probar la ruta HTTP, comprueba que `GET /api/facturas/[id]` no incluye `xml`/`pdf`.

### Criterio de aceptación

- El detalle y las respuestas de crear/timbrar/cancelar no incluyen XML/PDF.
- Las descargas XML/PDF siguen funcionando con el contenido persistido.

## Corrección 2 — Conservar la tasa exacta de IVA al timbrar

Hoy `timbrarFactura` reconstruye la tasa:

```ts
ivaTasa: Number(concepto.iva) / Number(concepto.importe)
```

- `web/src/lib/cfdi/servicio.ts:543`

Para un total de `100.00`, el cálculo guarda `subtotal 86.21` e `IVA 13.79`; la tasa reconstruida es `0.159961`, no `0.16`. El XML mock del concepto sale con `TasaOCuota="0.159961"` aunque el total use `0.16`.

El `check:cfdi` actual valida `conceptosDesdeTotal` (que sí conserva `0.16`), pero no el mapeo de `timbrarFactura`. El E2E usa una factura de `116`, donde la división sí da `0.16`; por eso no lo detecta.

### Cambios

1. Agrega a `conceptos_factura`:
   - `iva_tasa NUMERIC(7,6) NOT NULL DEFAULT 0.160000`
   - `retencion_tasa NUMERIC(7,6) NOT NULL DEFAULT 0.000000`
2. Agrega los campos a `ConceptoFactura` en Prisma (`Decimal @db.Decimal(7, 6)`), a `selectConcepto` y a la creación de conceptos en `crearFactura`.
3. En `timbrarFactura`, usa `concepto.ivaTasa` y `concepto.retencionTasa`; no dividas `iva/importe`.
4. Actualiza `web/prisma/sql/actualizaciones.sql` de forma idempotente:
   - `ALTER TABLE conceptos_factura ADD COLUMN IF NOT EXISTS ...`
   - Backfill de filas existentes: `iva_tasa = 0.16` cuando `iva > 0`, `retencion_tasa = 0` cuando no hay retenciones.
5. Mantén el cálculo de `conceptosDesdeTotal` con `TASA_IVA = 0.16`.
6. No cambies `totalCoincide` ni su tolerancia en esta fase; queda para 2B.

### Pruebas

- E2E con una factura de **total 100.00**:
  - `conceptos_factura.iva_tasa` debe ser `0.16`.
  - El XML guardado debe contener `TasaOCuota="0.160000"` en el concepto y en los totales.
- E2E con total `116.00` debe seguir pasando.
- `check:cfdi` debe seguir verde.
- Si puedes, agrega una aserción de que el XML de una factura de 100 no contiene `0.159961`.

### Criterio de aceptación

- El XML conserva la tasa `0.16` exacta para totales como `100.00` y `99.99`.
- La tasa no se reconstruye desde importes redondeados.
- La migración es idempotente y no rompe datos existentes.

## Validación obligatoria

Ejecuta desde `web/`:

```bash
npx prisma validate
npx tsc --noEmit
npm run lint
npm run check:cfdi
npm run build
```

Además, E2E de CFDI con PostgreSQL desechable:

```bash
npx tsx prisma/scripts/test-cfdi-e2e.ts
```

Mantén `next build --webpack`. No uses PAC real.

## Entrega

1. Rama y commit local.
2. Archivos cambiados.
3. Resultado de los checks, build y E2E.
4. Evidencia de que el detalle/API ya no incluye XML/PDF.
5. Evidencia del XML con `TasaOCuota="0.160000"` para total 100.
6. Pendientes para 2B (tolerancia exacta, cancelación SAT, PAC real).

No hagas push. No despliegues. No avances a 2B.
