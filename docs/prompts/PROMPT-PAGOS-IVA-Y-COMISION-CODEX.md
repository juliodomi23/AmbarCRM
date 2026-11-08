# Prompt para Codex — IVA por producto y comisión de la pasarela en los cobros

> Copia todo este archivo en Codex. Dos fases con parada entre ellas. **La Fase B depende de que la rama `codex/pagos-stripe` ya esté revisada y fusionada** (toca los mismos archivos de `web/src/lib/pagos/`). La Fase A es independiente.

---

## POR QUÉ

Los clientes de AmbarCRM empezarán a cobrar en línea y necesitan que **la cuenta cuadre**: hoy el cobro es exactamente `venta.total`, así que (1) no hay desglose de IVA por producto, y (2) la comisión de la pasarela (Mercado Pago, Stripe…) se la come el cliente sin que el CRM la muestre ni permita trasladarla. Objetivo: que cada organización vea cuánto le queda **neto** por cada cobro y pueda, si quiere, trasladar la comisión al comprador de forma transparente.

Fuera de alcance: anticipos de citas, cotizaciones, suscripciones, retenciones de ISR/IVA, nuevos proveedores, PAC real (Fase 2B de CFDI), calendario. No cambies el comportamiento de ninguna venta ni cobro existente cuando la organización no active lo nuevo.

## Rol y reglas

Ingeniero senior full-stack en **AmbarCRM** (Next.js 16 App Router, TypeScript, React 19, Prisma 5.22, PostgreSQL 16, Tailwind, NextAuth; multi-tenant con `org_id` y RLS). Julio solo revisa: tú implementas, pruebas y entregas evidencia.

Lee antes: `web/AGENTS.md` (esta versión de Next.js tiene cambios; consulta `web/node_modules/next/dist/docs/`), `MULTI-TENANT.md`, `docs/pagos-online.md`, `docs/cfdi.md`.

- Dinero **siempre** con `Prisma.Decimal`/enteros, nunca `Number` flotante. Redondeo a 2 decimales, explícito y documentado (half-up).
- Migraciones **idempotentes** en `web/prisma/sql/actualizaciones.sql` (RLS incluido, `crm_app` no es dueño de las tablas) y reflejadas en `schema.prisma`. Aplícalas dos veces en la prueba.
- Pruebas solo con base **desechable** (mismo estilo que `test-pagos-online-e2e.ts` y `test-cfdi-e2e.ts`). Nada contra producción ni la base `5433` de Julio. Sin llaves reales de ningún proveedor.
- Todo es **opt-in por organización**, con el comportamiento actual como valor por defecto.
- Si algo del código contradice este prompt, gana el código y lo señalas.
- No decidas por Julio cuestiones fiscales o legales: impleméntalas como configuración, con advertencia visible, y márcalas en la entrega como "validar con contador".
- Rama: Fase A desde `meta-tech-provider`; Fase B desde la rama fusionada de Stripe. Sin push ni merge.

---

## FASE A — IVA por producto y desglose en la venta

### Estado actual (verificado)
- `Producto` solo tiene `precio`; `Venta` tiene `subtotal`, `descuento`, `costoEnvio`, `total`; sin IVA.
- `web/src/lib/cfdi/calcular.ts`: `TASA_IVA = 0.16` fija; trata el total de venta/pago como **IVA incluido** y desglosa con ajuste de centavos sin cambiar la tasa.
- Los totales de venta se calculan en varios sitios: `src/app/api/ventas/route.ts`, `src/lib/retail-calculos.ts`, `src/lib/venta-importes.ts`, `src/lib/caja-db.ts`, `caja-a2-db.ts`, `caja-sinred-db.ts`, `caja-offline/ticket.ts`, `src/app/api/public/tienda/[slug]/route.ts`, `src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/quotes/route.ts`. **Primero lista todos los puntos donde se calcula o muestra un total** y confirma cuáles tocar; no dupliques la fórmula, centralízala en un solo módulo.

### Diseño
1. **Producto:** `ivaTasa` (`0.16`, `0.08` franja fronteriza, `0`, y `exento` distinto de tasa 0) y `precioIncluyeIva` (por defecto `true`). Valores por defecto = comportamiento actual (16 %, incluido). Verifica los valores y códigos fiscales vigentes en documentación oficial del SAT y cítala; si no puedes verificarlos, déjalos como configurables y dilo.
2. **Configuración de la organización:** `preciosIncluyenIva` en la `config` del módulo `ventas` (por defecto `true`). Si es `false`, el total = subtotal + IVA.
3. **Venta/partida:** guarda un **snapshot** por partida (`ivaTasa`, `ivaImporte`, `baseImporte`) al vender, para que cambiar el producto después no altere ventas pasadas. Ventas viejas sin snapshot se tratan como hoy (16 % incluido); no migres datos históricos salvo que sea necesario y seguro.
4. **Totales:** `total` de una venta existente **no cambia** de valor con la configuración por defecto. Agrega `ivaTotal` (suma de partidas) a la venta si hace falta para reportes. El descuento y el costo de envío deben tener un tratamiento de IVA definido y documentado (decide y explica: el envío suele llevar IVA; el descuento reduce la base proporcionalmente).
5. **CFDI:** `calcular.ts` deja de asumir 16 % para todo: usa el snapshot por partida (conceptos con su tasa exacta; exentos y tasa 0 correctos). Conserva el ajuste de centavos y la regla "la tasa nunca cambia". Regresión completa del e2e de CFDI.
6. **UI:** en el formulario de producto, tasa y "el precio ya incluye IVA"; en la venta/ticket, desglose subtotal / IVA / total. En Configuración del módulo, el interruptor de la organización con texto claro. Mobile-first, sin romper la caja offline.
7. **Reportes:** el reporte de ventas muestra IVA trasladado.

### Pruebas Fase A (obligatorias)
- 1500.00 con IVA incluido → base 1293.10, IVA 206.90. Casos de redondeo (0.01, 0.50, 99999.99, varias partidas que suman centavos distintos), tasa 0, exento, precio sin IVA incluido, descuento y envío.
- Venta antigua sin snapshot sigue dando exactamente el mismo total y el mismo desglose de CFDI que antes.
- Cambiar la tasa del producto no altera ventas ya hechas.
- CFDI con conceptos de tasas mixtas: total cuadra al centavo.
- Caja offline y tienda pública calculan igual que el servidor.
- RLS: la org B no ve nada de A. Migración aplicada dos veces sin error.

**Detente al terminar la Fase A y entrega el informe (abajo). Espera luz verde de Julio para la Fase B.**

---

## FASE B — Comisión de la pasarela (neto esperado y traslado opcional)

### Estado actual (verificado)
- `servicio-endurecido.ts`: el pago se crea con `monto: venta.total`; la conciliación exige `venta.total.equals(pago.monto)` y que el evento del proveedor coincida con `pago.monto`; reembolsos limitados a `pago.monto`.
- `PagoOnline` no guarda comisión ni neto. `DatosCheckout` (tipos.ts) manda un solo concepto.
- Configuración del módulo en `modulos_org.config` de `pagos_en_linea` (ya validada en `api/modulos/route.ts`).

### Diseño
1. **Configuración por organización** (`pagos_en_linea.config.comision`): `modo` = `absorber` (por defecto) | `trasladar`; `porcentaje`, `cuotaFija`, `ivaSobreComision` (por defecto `true`, 16 %), `etiqueta` (por defecto "Cargo por servicio"). **Los valores los captura la organización**: no hardcodees tarifas de ningún proveedor. Si quieres ofrecer valores sugeridos, solo con fuente oficial citada y fecha; si no, déjalos vacíos. Validación estricta de rangos (porcentaje 0–20, cuota fija ≥ 0).
2. **Fórmula** (una sola función pura, con Decimal): para recibir neto `X` con comisión `p` (fracción), cuota fija `c` e IVA `i` sobre la comisión,
   `bruto = (X + c·(1+i)) / (1 − p·(1+i))`, redondeado **hacia arriba** al centavo para no perder; `cargo = bruto − X`. Documenta el redondeo y verifica con pruebas que `bruto − comisiónReal ≥ X` en los casos de borde.
3. **Datos:** columnas nuevas en `PagoOnline` (migración idempotente + RLS): `montoBase` (lo que vale la venta), `cargoServicio` (0 por defecto), `comisionEstimada`, `netoEstimado`. `monto` sigue siendo **lo que cobra la pasarela** (base + cargo). Pagos existentes: `montoBase = monto`, `cargoServicio = 0`.
4. **Checkout:** `DatosCheckout` admite una línea adicional de cargo. En Mercado Pago, dos `items` (concepto y cargo de servicio); en Stripe, dos `line_items`; en el mock igual. El comprador **ve el cargo como línea separada antes de pagar**: es requisito, no opcional. Si el proveedor no puede mostrar líneas separadas, no permitas `trasladar` con ese proveedor.
5. **Conciliación:** la venta se compara con `montoBase`; el evento del proveedor con `monto`. Un cobro `absorber` se comporta exactamente como hoy. Toda discrepancia sigue generando tarea de revisión.
6. **Reembolsos:** documenta y aplica una política explícita: el reembolso total devuelve lo cobrado (base + cargo) salvo que el admin elija devolver solo la base; las pasarelas normalmente no devuelven su comisión, así que muéstralo como aviso ("la comisión del proveedor puede no reembolsarse"). El tope sigue siendo `monto`.
7. **Neto estimado visible:** en el detalle de cada cobro y en un resumen, mostrar `monto`, `cargo`, `comisión estimada` y `neto estimado`, etiquetados como **estimación** (la comisión real la confirma el proveedor; si la API del proveedor la devuelve de forma fiable, guárdala como `comisionReal` y verifica contra la documentación oficial cuál es el campo).
8. **CFDI:** el cargo por servicio es un ingreso del comercio: al facturar un pago con cargo, el CFDI debe incluirlo como concepto propio con IVA. Impleméntalo en `cfdi/calcular.ts` y marca la regla fiscal para validar con contador.
9. **UI** en `PagosConfig`: modo, porcentaje, cuota fija, IVA sobre comisión, etiqueta y una **calculadora de ejemplo** ("si cobras $1,500 recibes $X; el comprador paga $Y"). Aviso visible: "Trasladar comisión al comprador puede tener implicaciones fiscales y de protección al consumidor. Consulta a tu contador." Solo admin.

### Pruebas Fase B (obligatorias)
- Fórmula: casos de borde (p = 0, c = 0, p alto, montos 0.50 / 1500 / 99999.99), y propiedad `neto recibido ≥ X`.
- `absorber`: idéntico a hoy (regresión completa de Mercado Pago, Stripe y mock).
- `trasladar`: el checkout lleva dos líneas con el total correcto; el webhook aprobado concilia contra `montoBase`/`monto`; monto distinto → tarea de revisión.
- Reembolso total, parcial y repetido (idempotente) con cargo; no supera `monto`.
- Org con `trasladar` y proveedor sin líneas separadas → rechazado con mensaje claro.
- CFDI de un pago con cargo: total cuadra, el cargo aparece como concepto con IVA.
- RLS y migración dos veces. `npm run lint` y `npx tsc --noEmit` limpios; pruebas de pagos, CFDI, ventas y caja existentes en verde.

---

## Documentación

Actualiza `docs/pagos-online.md` (comisión, traslado, reembolsos, neto estimado) y `docs/cfdi.md` (tasas por concepto, cargo por servicio). Sin `console.log` ni código muerto.

## Entrega

Al terminar cada fase, **detente** y entrega: archivos tocados, la migración SQL, la lista de puntos donde se calculaban totales y qué hiciste en cada uno, decisiones donde el prompt y el código no coincidieron, salida de las pruebas, y una lista **"validar con contador"** (IVA del envío y del descuento, cargo por servicio y su facturación, reembolso del cargo) además de lo que Julio debe hacer en producción (migración, variables). Sin push ni merge.
