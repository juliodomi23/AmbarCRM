# Plan de módulos · Fase 2

Plan de trabajo para Codex, con revisión de Claude al final de cada bloque. Escrito el
2026-10-09. Ámbar Rojo Studios.

- **Ahora (4):** POS / Caja · Cotizaciones · Pedidos en línea y catálogo público · Reseñas de Google
- **Después (4):** Cobros con link · Facturación CFDI 4.0 · Campañas de Meta Ads · Vertical Óptica

---

## 0. Reglas para trabajar en este repo

### Rama y alcance

- Trabaja en la rama **`modulos-fase-2`**, creada desde `integraciones-citas-lealtad`.
- **No toques** `meta-tech-provider`, `modulos-personalizables` ni `main`. Producción no se
  despliega desde aquí.
- **No modifiques** los flujos que revisa Meta: `api/wa/onboard`, `api/meta/webhook`,
  `api/meta/templates`, `api/mensajes/enviar` (salvo lo que pida este plan, y entonces
  con pruebas).
- Un commit por bloque terminado, en español, que explique qué y por qué.
- **Detente al final de cada bloque** (marcados con 🛑) y entrega el resumen de la sección 3.
  No sigas al siguiente bloque sin revisión.

### Convenciones obligatorias (ya existen; úsalas, no las reinventes)

| Necesidad | Usa | Archivo |
|---|---|---|
| Rutas de un módulo | `conModulo("clave", { admin? }, handler)` | `src/lib/con-modulo.ts` |
| Catálogo de módulos | Entrada con clave, área, nombre, icono y ruta | `src/lib/modulos.ts` |
| Tablas nuevas | `org_id` con DEFAULT, RLS `org_isolation`, `GRANT` a `crm_app`, todo idempotente | `web/prisma/sql/actualizaciones.sql` + `schema.prisma` |
| IDs que llegan del cliente | `referenciaAjena()` / `referenciaPropia()` (las FK no respetan RLS) | `src/lib/referencias.ts` |
| Dinero | `dinero()`: máximo 2 decimales, nunca `Number()` crudo | `src/lib/dinero.ts` |
| Cupos, existencias, saldos | `transaccionTenant()` + `SELECT … FOR UPDATE` en orden estable | `src/lib/retail-db.ts`, `src/lib/cupos-db.ts`, `src/lib/ediciones-db.ts` |
| Editar y borrar por id | `idDeRuta`, `fusionar`, `respuestaNegocio` | `src/lib/rutas-edicion.ts` |
| Formularios | `FormularioModulo` (alta, edición, borrar, acciones rápidas) | `src/components/modulos/FormularioModulo.tsx` |
| Campos de formularios | Funciones compartidas por módulo | `src/lib/campos-modulos.ts`, `src/lib/opciones-formularios.ts` |
| Listados | `PanelListado` / `PanelLegal` con `take: LIMITE_PANEL` y métricas con `count`/`aggregate` | `src/components/modulos/`, `src/lib/paginacion.ts` |
| Páginas públicas | Patrón de Reservas: `negocioPublico`, `limitarIp`, disponibilidad recalculada en servidor, marca con `marca-local` | `src/lib/reservas/`, `src/app/reservar/` |
| Rutas públicas sin sesión | Agregar el prefijo al `matcher` de `src/proxy.ts` (como `reservar`) | `src/proxy.ts` |
| Búsqueda de contactos | `contactosQueCoinciden` (sin acentos) | `src/lib/busqueda.ts` |
| Errores de datos | 400/404/409, nunca 500 por entrada inválida | `src/lib/errores-api.ts` |
| Demos | `seed-demo-*.mjs` con `credencialesDemo()`, idempotente, bloqueado en producción | `web/scripts/` |

### Prohibido

- Nuevas dependencias de npm sin justificarlo en el resumen (preferir plataforma y lo instalado).
- `EXCLUDE` constraints o cambios de tipo que puedan fallar sobre datos existentes sin un
  `UPDATE` previo que los haga válidos.
- Seeds en producción, datos reales de clientes en demos, secretos en el repo.
- Guardar datos de tarjetas o pedir contraseñas de terceros.
- Mensajes de WhatsApp fuera de la ventana de 24 h sin plantilla aprobada.

### Definición de terminado (aplica a cada bloque)

1. `npm run lint`, `npx tsc --noEmit`, `npx prisma validate`, `npx next build` en verde.
2. Todos los `scripts/check-*.ts` en verde, incluido uno **nuevo** por módulo.
3. Contra un Postgres 16 de prueba (`schema.sql` + `multi-tenant.sql` + `actualizaciones.sql` de
   `meta-tech-provider`, y encima el `actualizaciones.sql` nuevo **aplicado 3 veces**):
   `test-aislamiento.ts` (debe contar las tablas nuevas), `test-referencias.ts`,
   `test-cupos-concurrentes.ts`, `test-concurrencia-retail.ts`, `test-reservas-concurrentes.ts`
   y las pruebas nuevas del bloque.
4. **Prueba con dientes**: toda protección de concurrencia nueva se demuestra quitándola a
   propósito, viendo fallar la prueba y restaurándola. Reporta el número que dio sin protección.
5. Una prueba de punta a punta contra la app corriendo (`next start` en un puerto libre,
   login real de NextAuth con el campo `orgSlug`), con casos de error y de permisos.
6. Actualizar `check-arquitectura-modulos.ts` (conteo de rutas) y `MODULOS.md`.
7. Demo sembrada para el giro, si aplica.

---

## 1. Ahora

### Paso 0 · Cantidades decimales (compartido por POS y Pedidos) 🛑

**Por qué:** hoy `venta_partidas.cantidad`, `productos.stock`, `stock_minimo`,
`compra_partidas.cantidad` y `movimientos_inventario` (cantidad, existencia antes/después) son
`Int`. Una verdulería vende 1.5 kg y un POS de granel pesa. Sin esto, Pedidos y POS no sirven
para esos giros.

- Migrar esas columnas a `NUMERIC(12,3)` con `ALTER COLUMN … TYPE numeric(12,3) USING col::numeric`
  (seguro sobre enteros existentes; idempotente: comprobar el tipo antes en un `DO $$`).
- Agregar `productos.unidad TEXT NOT NULL DEFAULT 'pieza'` y `productos.vende_por_peso BOOLEAN
  NOT NULL DEFAULT false`. Las piezas siguen siendo enteras: validar en servidor que un producto
  que no se vende por peso reciba cantidad entera.
- Actualizar `schema.prisma` (Decimal) y **todo** el código de retail (`lib/retail.ts`,
  `lib/retail-db.ts`, rutas de productos, compras, ventas, inventario, pantallas) para operar con
  Decimal sin errores de flotante: sumar y comparar con `Prisma.Decimal` o con enteros en
  milésimas, nunca con `Number` acumulado.
- **Pruebas:** `test-concurrencia-retail.ts` debe seguir pasando sin cambiar sus expectativas, más
  un caso nuevo: vender 0.75 kg tres veces simultáneas con 2 kg en existencia → se aceptan 2, la
  existencia queda en 0.5. Un `check` de validación (pieza 1.5 → 400; 1.234 kg → ok; 1.2345 → 400).

### A. POS / Caja (a partir de `08-productos-internos/POS`)

Llevar el POS dentro de AmbarCRM **encima** de Productos, Ventas e Inventario: una venta de caja
es una `venta` con `canal = 'mostrador'` y partidas normales. **No crear tablas de ventas
paralelas.** Leer `POS/README.md` y `POS/app/` como referencia de comportamiento (no copiar su
SQLite ni su auth por PIN tal cual).

Módulo nuevo `caja` (área "Retail y comercio"), depende de `productos` y `ventas`.
Puestos: Cajero, Mesero, Gerente.

#### A1 · Caja de mostrador, turnos y corte 🛑

- **Tablas:** `turnos_caja` (usuario, sucursal o caja, fondo inicial, abierto_at, cerrado_at,
  efectivo_contado, diferencia, estado), `movimientos_caja` (turno, tipo entrada/salida, monto,
  motivo, usuario). En `ventas`: `turno_id`, `propina`, `pagos JSONB` (lista de {método, monto})
  o tabla `pagos_venta` (preferida: una fila por método).
- **Pantalla `/caja`**: buscador y botones por categoría, lector de código de barras (input que
  recibe el escaneo + Enter), cantidad y peso, descuento, propina, cobro con varios métodos,
  cambio calculado, botones de billetes. Pensada para tablet y teclado, rápida.
- **Reglas:** no se cobra sin turno abierto; una persona solo tiene un turno abierto (bloqueo);
  el corte calcula *fondo + efectivo + entradas − salidas* y guarda la diferencia; cerrar turno
  es irreversible; cancelar una venta del turno exige rol admin o puesto Gerente y devuelve
  inventario por la ruta existente.
- **Venta idempotente:** cada cobro lleva un `uuid` generado en el navegador (`ventas.uuid_cliente`
  UNIQUE por org); reenviarlo no duplica venta ni inventario. Prueba con el mismo uuid en 5
  peticiones simultáneas → 1 venta.
- **Ticket**: impresión de 76 mm por CSS de impresión (`@media print`), con marca del negocio.

#### A2 · Mesas, cuentas y meseros 🛑

- **Tablas:** `mesas` (nombre, zona, activa), `cuentas` (mesa, mesero, estado abierta/cobrada/
  cancelada, `version` para control optimista), partidas de cuenta (pueden reutilizar
  `venta_partidas` con la venta en estado `abierta` o tabla `cuenta_partidas`; justificar).
- Dos terminales sobre la misma cuenta: guardar con `version` vieja → **409** y la pantalla
  recarga. Prueba de concurrencia con dos guardados simultáneos.
- Dividir la cuenta por partes (2/3/4 o libre, cada parte con su método) y por producto.
- Reporte de ventas y propinas por mesero.

#### A3 · Extras, comanda y reportes 🛑

- **Modificadores por producto** (`modificadores_producto`: nombre, precio ± ) que viajan en la
  partida (snapshot del nombre y precio) y salen en ticket y comanda.
- **Comanda de cocina** imprimible para productos marcados "va a cocina".
- **Reportes:** vendido, ticket promedio, ventas por hora, más vendidos, por método, turnos con
  faltante; exportar CSV (con la protección de fórmulas de `lib/csv.ts`).

#### A4 · Modo sin internet (después de A1–A3 y de revisión) 🛑

- Service Worker + catálogo en almacenamiento local; la caja vende sin red y encola; al volver
  la conexión, sube la cola. Idempotencia por `uuid_cliente` (ya hecha en A1).
- El inventario puede quedar negativo por ventas offline: **a propósito** (no perder ventas);
  se marca y se corrige con ajuste. Documentarlo en la pantalla.
- Prueba: reenviar la cola dos veces no duplica; dos cajas offline no pierden ventas.

### B. Cotizaciones (a partir de `08-productos-internos/cotizador`) 🛑

Módulo `cotizaciones` (área "CRM y agenda"), sirve para todos los giros.

- **Tablas:** `cotizaciones` (folio por org, contacto, oportunidad opcional, estado
  borrador/enviada/aceptada/rechazada/vencida, vigencia, notas, condiciones, subtotal, descuento,
  impuestos, total, `token_publico` 32 hex, `version`), `cotizacion_partidas` (producto opcional
  del catálogo o concepto libre, cantidad Decimal, precio, descuento, total).
- **Desde la oportunidad y el chat**: "Nueva cotización" precarga contacto y oportunidad.
- **Cálculos en servidor** con `dinero()`; IVA configurable por empresa (16 % por defecto,
  opción "precios con IVA incluido"). Sin CFDI.
- **Documento**: página pública `/cotizacion/<token>` imprimible a PDF desde el navegador, con
  marca del negocio, botones **Aceptar** / **Rechazar** (con nombre de quien acepta, fecha e IP
  guardados). Al aceptar: estado `aceptada`, la oportunidad pasa a la etapa ganada si existe y
  queda un evento en su historial; opcional "convertir en venta" si el módulo Ventas está activo
  (respeta existencias con la transacción existente).
- **Enviar por WhatsApp**: texto con el enlace si la ventana de 24 h está abierta; si no, solo
  con plantilla aprobada configurada en el módulo (`{{1}}` nombre, `{{2}}` folio, `{{3}}` enlace).
- **Vencimiento**: un cron marca `vencida` al pasar la vigencia (sin atascos: filtrar por fecha,
  `try/catch` por empresa, como `cron/recordatorios-citas`).
- **Pruebas:** totales con decimales e IVA; aceptar dos veces → 409; token inventado → 404;
  aceptar una vencida → 409; otra empresa no ve la cotización.

### C. Pedidos en línea y catálogo público (a partir de `verduleria-piloto` y `productos-nfc/menu-digital`) 🛑

Módulo `pedidos_en_linea` (área "Retail y comercio"), depende de `productos` y `ventas`.
Mismo patrón que Reservas en línea.

- **Catálogo público** `/tienda/<empresa>`: categorías, búsqueda, foto, precio por unidad
  ("$32 / kg"), etiquetas (oferta, temporada…), agotado. Solo productos activos marcados
  "visible en línea" (`productos.visible_en_linea`).
- **Carrito y pedido**: entrega a domicilio o recoger (configurables), dirección, horario
  deseado, notas, nombre y WhatsApp. El pedido entra a **Ventas** con `canal = 'tienda_en_linea'`,
  estado `pendiente` (no descuenta inventario hasta confirmarse, como hoy), y crea o liga el
  contacto por teléfono (`contactoPorTelefono` de reservas).
- **Precios del servidor**: el total se recalcula siempre en servidor; el carrito solo manda ids
  y cantidades. Mínimo de compra y costo de envío configurables.
- **Seguridad**: límite por IP, tope de pedidos por teléfono por día (contando pedidos reales,
  no intentos), cantidades dentro de rango, producto agotado → 409.
- **Aviso al negocio**: nota interna + push al equipo; al cliente, mensaje con el resumen solo si
  hay ventana abierta o plantilla.
- **Seguimiento** `/tienda/pedido/<token>`: estado del pedido sin datos sensibles.
- **Edición rápida de precios en lote** y switch de "agotado" en Productos (lo más usado del
  día a día en la verdulería).
- **Pruebas:** total manipulado en el cliente → se ignora; 10 pedidos simultáneos del último kilo
  al confirmar → no sobrevende; otra empresa no ve pedidos.

### D. Reseñas de Google (a partir de `productos-nfc/maquina-resenas`) 🛑

Módulo `resenas` (área "CRM y agenda").

- **Página pública** `/opinion/<empresa>?o=<origen>`: estrellas → **siempre** redirige al enlace
  de reseñas de Google, sea 1 o 5 estrellas. **No filtrar por estrella**: la política de Google
  prohíbe solicitar selectivamente reseñas positivas y la sanción cae en la ficha del cliente.
  La calificación se guarda antes del salto.
- **Panel** `/resenas`: promedio, distribución, tendencia, conteo por origen (`?o=`), QR por
  origen para imprimir.
- **Solicitud automática**: al marcar una cita "atendida" o una venta "entregada", enviar el
  enlace por WhatsApp (dentro de ventana como texto; fuera, plantilla aprobada). Una sola
  solicitud por contacto cada N días (configurable), sin duplicar si dos eventos llegan juntos.
- **Pruebas:** la redirección no depende de la estrella; límite por IP; no se envía dos veces
  la solicitud al mismo contacto dentro del periodo.

---

## 2. Después

| # | Módulo | Alcance | Requisito para empezar |
|---|---|---|---|
| 1 | **Cobros con link** (Mercado Pago) | Link de pago por WhatsApp para anticipos de reservas, colegiaturas, saldos de tours, ventas y cotizaciones aceptadas; webhook firmado que registra el pago con idempotencia. AmbarCRM nunca toca datos de tarjeta. | Cuenta de Mercado Pago de prueba; decidir si cada negocio conecta su cuenta (OAuth) o usa la de Ámbar Rojo. |
| 2 | **Facturación CFDI 4.0** | Timbrar desde una venta o cotización aceptada con un PAC (Facturama u otro): datos fiscales del cliente, catálogos SAT, cancelación, PDF y XML. | Elegir PAC, costo por timbre y si cada negocio usa su CSD. Revisión fiscal antes de vender. |
| 3 | **Campañas de Meta Ads** (a partir de `agente-meta-ads`) | Vista sin jerga para el dueño y cola de aprobación; leads de anuncios directo al embudo. | **Solo después de que Meta apruebe la App Review actual**; requiere otra revisión de permisos (`ads_management`, `leads_retrieval`). |
| 4 | **Vertical Óptica** (a partir de `OpticaJoma`) | Exámenes de la vista con graduación, pedidos de lentes con estado de laboratorio, recordatorio de revisión anual. Se suma a Pacientes y Citas. | Revisar con el piloto de la óptica qué campos usan realmente. |

---

## 3. Orden de trabajo y revisión

1. **Paso 0** (cantidades decimales) → 🛑 revisión
2. **A1** Caja, turnos y corte → 🛑
3. **B** Cotizaciones → 🛑
4. **C** Pedidos en línea y catálogo público → 🛑
5. **A2** Mesas y cuentas → 🛑
6. **A3** Extras, comanda y reportes → 🛑
7. **D** Reseñas de Google → 🛑
8. **A4** Modo sin internet → 🛑

En cada 🛑 entrega:

- Qué se hizo, archivos tocados y por qué cada decisión que no estaba en este plan.
- Salida de lint, tipos, build y **todas** las pruebas (copiar los resultados, no resumirlos).
- Para cada protección de concurrencia: el resultado **sin** la protección y **con** ella.
- Qué **no** se verificó (por ejemplo, revisión visual en celular) y por qué.
- Riesgos o dudas abiertas.

No afirmes que algo funciona si no lo probaste; si una prueba no pudo correrse, dilo.
