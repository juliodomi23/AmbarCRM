# A5 · Modo sin internet · Diseño (para revisión, sin código)

Alcance: **solo `/caja`**. Venta de mostrador, anónima, pago efectivo/tarjeta/transferencia. Sin red **no** hay:
cliente, crédito, apartado, nota de crédito, devolución, abrir/cerrar turno, movimientos de efectivo.

## Hallazgos que condicionan el diseño
- `calcularPrecios` solo usa la fecha para la **vigencia de promociones** (`opciones.ahora`). No hay historial de
  precios: precio de catálogo, volumen y lista son los de *hoy*. "Precio a la fecha de la venta" = promociones de
  esa fecha + precios actuales; si cambiaron en medio, la diferencia cae en la regla del punto 6.
- `registrarVentaCaja` exige turno abierto, existencia suficiente y `pagado ≥ total` recalculado. Ninguna de las tres
  sirve tal cual para una venta ya ocurrida: el camino sin red necesita su propia función (reusa `calcularPrecios`,
  `bloquearProductos`, `bloquearTurnoCaja`), sin tocar la de siempre.
- `CajaCliente` recibe `productos` por props del servidor y calcula el total con `producto.precio` (sin volumen ni
  promos). Sin red eso cobraría mal: hace falta cálculo local fiel (punto 1).
- No existe "ajuste de inventario" aparte; el stock se corrige con `POST /api/productos/[id]/movimientos` (entrada).

## 1. Qué cachea el SW
Se **amplía `public/sw.js`** (mismo archivo, mismo registro de `PushSetup`; push no cambia). Añade solo:
- **Shell de `/caja`**: la navegación `GET /caja` (network-first; offline sirve la última copia) y
  `/_next/static/*` (hash inmutable, cache-first; son assets, no páginas ni datos). Nada más del CRM, ninguna `/api`.
- **Catálogo NO en Cache API sino en IndexedDB**, por identidad (punto 2): el SW nunca devuelve datos privados.
  Nuevo `GET /api/caja/catalogo` (`conModulo("caja")`): productos activos (id, nombre, sku, código, unidad,
  vendePorPeso, stock informativo), **precio unitario ya calculado** con `calcularPrecios` (lista pública), escalas de
  volumen, promociones vigentes (con su vigencia), `descuentoMaximo` del Cajero y zona. Sin clientes.
- **Cálculo local**: se extrae la regla pura (escala → promoción vigente → mejor descuento) a un módulo compartido
  usado por servidor y navegador, con el mismo `Decimal`. Prueba de paridad cliente-vs-servidor sobre casos aleatorios.
- **Versión**: `catalogoVersion` = hash corto del contenido + `generadoAt`. Se refresca al abrir `/caja`, al volver la
  red y cada 10 min con red. Sin red se usa el último y la UI muestra "Catálogo de hace X". Si es de más de 24 h,
  avisa (no bloquea).
- **Shell por identidad**: el HTML de `/caja` lleva datos de usuario/turno. `AppShell` escribe en cada carga online
  `identidadActiva = org:user`; el SW solo sirve la copia offline si su marca coincide. Sin coincidencia: "Conéctate
  una vez para usar la caja sin internet". Limitación: sin red hay que *recargar* `/caja` (la navegación interna RSC
  no se cachea).

## 2. Computadora compartida
- IndexedDB `ambar-caja` con stores `catalogo` y `cola`, claves `orgId:userId`. Una persona nunca lee lo de otra.
- Al cerrar sesión (`signOut` en `AppShell`): borra catálogo e `identidadActiva` y la copia del shell de esa
  identidad. **La cola pendiente NO se borra** (son ventas cobradas), pero queda bajo la clave
  `orgId:userId` y la UI no la muestra a otro usuario (no está cifrada: es separación lógica, no seguridad). Si hay cola, el cierre de sesión avisa "hay N ventas sin subir".
- `navigator.storage.persist()` para reducir el riesgo de que el navegador expulse la cola (Safari/ITP).

## 3. Cola local
Cada venta guarda: `uuidCliente`, `folio` provisional, `orgId`, `userId`, `turnoId`, `vendidaAt` (reloj del
dispositivo), `partidas` (producto, cantidad, descuento manual, precio unitario y total mostrados), `pagos`,
`totalCobrado`, `descuento`, `catalogoVersion`, `estado` (`pendiente | subiendo | esperando_turno | error`),
`intentos`, `ultimoError`.
- **Orden**: FIFO por `vendidaAt`, una a la vez.
- **5xx, sin red, timeout, 408/429**: reintento con espera 5 s → 15 s → 45 s … tope 5 min, con variación aleatoria.
- **4xx**: la venta pasa a `error` con el mensaje del servidor, **no se reintenta**, la cola sigue. El servidor además
  guarda el rechazo en `cola_caja_rechazos` (payload completo, motivo, uuid único) para que el Encargado lo vea desde
  cualquier equipo y decida (corregir y reenviar, o registrarla a mano). Una venta cobrada nunca se pierde en silencio.
- Cierre de turno (Z) se **bloquea en la UI mientras haya cola** de esa persona.

## 4. Sesión
- **401**: pausa la subida, conserva la cola y muestra "Inicia sesión para subir N ventas". Al volver a entrar, retoma.
- **Nunca con otra identidad**: el cliente solo procesa items cuya `orgId:userId` coincide con la sesión actual
  (`/api/caja/catalogo` devuelve la identidad) y el cuerpo declara `orgId`/`userId`; el servidor compara con la sesión
  y responde `403 IDENTIDAD_DISTINTA`, que el cliente trata como "no es mío", **sin** marcarla error ni rechazo.

## 5. Endpoint de subida
**Nuevo `POST /api/caja/ventas/sin-red`** (no un flag en el existente: el camino normal queda intacto y el servidor
jamás confía en un indicador del cliente en la ruta de siempre). Cuerpo = venta + `vendidaAt`, `totalCobrado`,
`folio`, `catalogoVersion`, `orgId`, `userId`. Valida: `vendidaAt` ≤ ahora + 5 min y ≥ ahora − 72 h; `vendidaAt` ≥
apertura del turno − 5 min; pagos solo efectivo/tarjeta/transferencia; sin `contactoId`; cantidades por unidad/peso;
tope de descuento del Cajero. Idempotente por `uuidCliente` (UNIQUE por org ya existe); folio = el del cliente
(`SR-` + 10 hex del uuid, UNIQUE por org) para que el ticket impreso coincida. `createdAt` de la venta = `vendidaAt`,
así reportes y cortes por fecha la ven cuando ocurrió.

## 6. Precio
El servidor recalcula con `calcularPrecios({ ahora: vendidaAt })` y compara con `totalCobrado`. Si difiere:
**se respeta lo cobrado** (`venta.total = totalCobrado`, `descuento = subtotal − total`), y la venta se marca
`revision_motivos ∋ 'precio_distinto'` con `diferencia_precio` (servidor − cobrado). No bloquea la cola. Sin red la
UI deshabilita el descuento manual por encima del tope del Cajero (`descuentoMaximo` del catálogo); el servidor lo
vuelve a validar. Dónde se ve: columnas nuevas en `ventas` (`sin_red`, `vendida_at`, `subida_at`, `revision_motivos`,
`diferencia_precio`, `revision_resuelta_at/por`) y un panel **"Ventas por revisar"** en `/caja` para Encargado/Admin
(`GET /api/caja/revision`, `PATCH` para marcar revisada).

## 7. Turno
- `vendidaAt` dentro del turno original (aunque ya esté **cerrado**): la venta entra a **ese** turno marcada
  `tardia`. No se reescribe el corte Z (irreversible): `efectivoEsperado` guardado no cambia. El sobrante que dejó
  (el efectivo ya estaba en el cajón al contar) se **explica**: el reporte de cortes muestra
  `diferencia − efectivo de ventas tardías`. Así el corte "cuadra" sin reabrirlo.
- `vendidaAt` posterior al cierre (el turno lo cerró otro equipo/Encargado antes de la venta): no pertenece a ese
  corte. Entra al **turno abierto actual** de la misma persona, marcada `tardia` con `turno_original_id`; si no tiene
  uno: `409 TURNO_REQUERIDO` → estado `esperando_turno` ("Abre turno para subir"), no es error.
- Lo que cobró en cada caso ya estaba físicamente en el cajón correspondiente; la regla evita doble conteo.

## 8. Inventario negativo
Solo en `/sin-red`: se omite la verificación de existencia (aunque la venta ya ocurrió) y se permite stock < 0.
Marca: `ventas.revision_motivos ∋ 'inventario_negativo'` y `movimientos_inventario.sin_red = true`. Se ve en el panel
"Ventas por revisar" y en Productos/Reportes (alerta existente de mínimo + lista "Existencia negativa"). Se corrige
con una **entrada** en `/api/productos/[id]/movimientos` (motivo "Ajuste venta sin red"); la marca se limpia al
volver a ≥ 0. Pedidos en línea y caja normal siguen rechazando sobreventa (ya calculan `stock − reservas`; con
stock negativo disponible ≤ 0).

## 9. Ticket sin red
Componente de ticket **en el cliente** con los datos de la cola, mismo CSS/anchos (58/80 mm) que
`caja/ticket/[ventaId]`, folio `SR-…` y leyenda "Venta sin conexión". Se imprime con `window.print()`. Al subir,
`/caja/ticket/[ventaId]` muestra la misma venta con el mismo folio.

## 10. Pruebas (sin protección → con protección)
| Prueba | Sin | Con |
|---|---|---|
| Cola reenviada 2 veces (y 5 en paralelo) | 2 ventas, stock −2 | 1 venta, stock −1 |
| Dos cajas sin red, mismo producto | — | 2 ventas entran, ninguna perdida, stock −1 marcado |
| Último producto: sin red vs. pedido en línea | pedido y venta ambos pasan | pedido rechazado/venta marcada, existencia −1 |
| Corte con ventas tardías (turno abierto y cerrado) | corte cambia/desbalancea | esperado intacto, diferencia explicada |
| Cola de otro usuario / otra empresa | se sube con sesión ajena | `403`, se conserva, no se marca error |
| Venta de más de 72 h / fecha futura | se acepta | `400`, registro en `cola_caja_rechazos` |
| Precio distinto | rechaza ("no cubre") | respeta lo cobrado, `precio_distinto` |
| Paridad de cálculo cliente-vs-servidor | — | N casos aleatorios idénticos |
| Cola: 5xx reintenta, 4xx no, 401 pausa (unit con `fetch` simulado) | — | ok |
| e2e con app real: login, catálogo, subida, panel de revisión, permisos | — | ok |
Además `test-aislamiento` con las tablas nuevas (`cola_caja_rechazos`).

## 11. Riesgos y lo que NO haré
- **Reloj del dispositivo** manda `vendidaAt`: acotado por 72 h y por la apertura del turno; un reloj mal puesto se
  marca, no se corrige.
- **IndexedDB puede perderse** (limpieza del navegador, modo privado, ITP de Safari): la cola es el único registro
  hasta subir. Mitigación: `persist()`, aviso visible con N ventas sin subir, y no cerrar sesión/turno con cola.
- **Dos pestañas/equipos** con la misma cola: el servidor es idempotente; el cliente toma un candado por pestaña
  (`navigator.locks`) para no subir en paralelo.
- **Precios cambiados** entre la venta y la subida se detectan solo al subir (no hay historial de precios).
- **No haré**: Background Sync/periodic sync (no hay en Safari; subo al abrir la caja y con evento `online`),
  caché de otras pantallas o APIs, clientes/crédito/apartados offline, historial de precios, cifrado de IndexedDB,
  sincronización entre dispositivos, ni modificar `registrarVentaCaja` ni la ruta `/api/caja/ventas`.

## Plan de commits (tras tu aprobación)
1. SW ampliado + `/api/caja/catalogo` + catálogo en IndexedDB + cálculo local compartido.
2. Cola + `POST /api/caja/ventas/sin-red` idempotente + turno/72 h/identidad + `cola_caja_rechazos`.
3. Inventario negativo marcado + panel "Ventas por revisar" + ticket sin red + pruebas e2e.
