import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { almacenMemoria } from "../src/lib/caja-offline/almacen";
import { encolarVenta, esperaReintento, folioSinRed, listarCola, reintentarVenta, subirCola, type VentaEnCola } from "../src/lib/caja-offline/cola";
import { validarVentaSinRed, ventanaVentaSinRed } from "../src/lib/caja-sinred";
import { ventasSinRedActivas } from "../src/lib/caja";

const yo = { orgId: "1", userId: "10" };
const otro = { orgId: "1", userId: "11" };
const otraEmpresa = { orgId: "2", userId: "10" };

function venta(identidad: typeof yo, indice: number, extra: Partial<VentaEnCola> = {}): VentaEnCola {
  const uuid = `00000000-0000-4000-8000-${String(indice).padStart(12, "0")}`;
  return {
    uuidCliente: uuid, folio: folioSinRed(uuid), identidad, turnoId: "7",
    vendidaAt: new Date(Date.UTC(2026, 9, 10, 12, indice)).toISOString(),
    partidas: [{ productoId: "5", nombre: "Pieza", cantidad: "1", descuento: "0", precioUnitario: "50.00", total: "50.00" }],
    pagos: [{ metodo: "efectivo", monto: "50.00" }], descuento: "0", totalCobrado: "50.00", cambio: "0.00",
    catalogoVersion: "v1", estado: "pendiente", intentos: 0, proximoIntentoAt: null, ultimoError: null, codigo: null, ...extra,
  };
}

type Llamada = { uuid: string; userId: string };
function servidor(respuestas: Record<string, { status: number; cuerpo?: unknown } | "red">, llamadas: Llamada[] = []) {
  return (async (_url: string, init: RequestInit) => {
    const cuerpo = JSON.parse(String(init.body));
    llamadas.push({ uuid: cuerpo.uuidCliente, userId: cuerpo.userId });
    const respuesta = respuestas[cuerpo.uuidCliente] ?? { status: 201, cuerpo: { ok: true } };
    if (respuesta === "red") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(respuesta.cuerpo ?? {}), { status: respuesta.status });
  }) as unknown as typeof fetch;
}
const ahora = () => new Date("2026-10-10T13:00:00Z");
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// 1) Subida feliz, en orden, y reenviar no sube nada (la cola ya está vacía): sin duplicados.
{
  const almacen = almacenMemoria();
  for (const n of [3, 1, 2]) await encolarVenta(almacen, venta(yo, n));
  const llamadas: Llamada[] = [];
  const r1 = await subirCola(almacen, yo, { buscar: servidor({}, llamadas), ahora });
  assert.equal(r1.subidas, 3);
  assert.deepEqual(llamadas.map((l) => l.uuid), [u(1), u(2), u(3)], "orden de venta (FIFO)");
  const r2 = await subirCola(almacen, yo, { buscar: servidor({}, llamadas), ahora });
  assert.equal(r2.estado, "vacia");
  assert.equal(llamadas.length, 3, "reenviar la cola no vuelve a llamar al servidor");
}

// 2) Sin red / 5xx: espera con retroceso, conserva el orden y no pierde nada.
{
  const almacen = almacenMemoria();
  for (const n of [1, 2]) await encolarVenta(almacen, venta(yo, n));
  const llamadas: Llamada[] = [];
  const caida = await subirCola(almacen, yo, { buscar: servidor({ [u(1)]: "red" }, llamadas), ahora, azar: () => 0.5 });
  assert.equal(caida.estado, "reintento");
  assert.equal(llamadas.length, 1, "se detiene para conservar el orden");
  const [primera] = await listarCola(almacen, yo);
  assert.equal(primera.intentos, 1);
  assert.equal(primera.proximoIntentoAt, new Date(ahora().getTime() + 5_000).toISOString());
  const aunEspera = await subirCola(almacen, yo, { buscar: servidor({}, llamadas), ahora });
  assert.equal(aunEspera.estado, "reintento");
  assert.equal(llamadas.length, 1, "no reintenta antes de tiempo");
  const luego = () => new Date(ahora().getTime() + 10_000);
  const quinientos = await subirCola(almacen, yo, { buscar: servidor({ [u(1)]: { status: 503 } }, llamadas), ahora: luego, azar: () => 0.5 });
  assert.equal(quinientos.estado, "reintento");
  assert.equal((await listarCola(almacen, yo))[0].intentos, 2);
  assert.equal((await listarCola(almacen, yo))[0].estado, "pendiente", "un 5xx nunca la marca como error");
  const despues = () => new Date(ahora().getTime() + 3_600_000);
  const ok = await subirCola(almacen, yo, { buscar: servidor({}, llamadas), ahora: despues });
  assert.equal(ok.subidas, 2);
}
assert.deepEqual([1, 2, 3, 4, 5, 9].map((n) => esperaReintento(n, () => 0.5)), [5_000, 15_000, 45_000, 135_000, 300_000, 300_000]);

// 3) 4xx: queda con error visible, no se reintenta solo y la cola sigue.
{
  const almacen = almacenMemoria();
  for (const n of [1, 2, 3]) await encolarVenta(almacen, venta(yo, n));
  const llamadas: Llamada[] = [];
  const r = await subirCola(almacen, yo, { buscar: servidor({ [u(2)]: { status: 400, cuerpo: { error: "La venta tiene más de 72 horas", codigo: "VENTA_MUY_ANTIGUA" } } }, llamadas), ahora });
  assert.equal(r.subidas, 2);
  assert.equal(r.errores, 1);
  const cola = await listarCola(almacen, yo);
  assert.equal(cola.length, 1);
  assert.equal(cola[0].estado, "error");
  assert.equal(cola[0].ultimoError, "La venta tiene más de 72 horas");
  assert.equal(cola[0].codigo, "VENTA_MUY_ANTIGUA");
  const otra = await subirCola(almacen, yo, { buscar: servidor({}, llamadas), ahora });
  assert.equal(otra.estado, "vacia", "un error no se reintenta sin que alguien lo pida");
  await reintentarVenta(almacen, cola[0]);
  assert.equal((await listarCola(almacen, yo))[0].estado, "pendiente");
}

// 4) 401: se conserva todo y se pide iniciar sesión.
{
  const almacen = almacenMemoria();
  for (const n of [1, 2]) await encolarVenta(almacen, venta(yo, n));
  const llamadas: Llamada[] = [];
  const r = await subirCola(almacen, yo, { buscar: servidor({ [u(1)]: { status: 401 } }, llamadas), ahora });
  assert.equal(r.estado, "sesion");
  assert.equal(llamadas.length, 1);
  const cola = await listarCola(almacen, yo);
  assert.equal(cola.length, 2);
  assert.ok(cola.every((v) => v.estado === "pendiente" && v.intentos === 0));
}

// 5) Turno requerido: espera sin frenar a las demás.
{
  const almacen = almacenMemoria();
  for (const n of [1, 2]) await encolarVenta(almacen, venta(yo, n));
  const r = await subirCola(almacen, yo, { buscar: servidor({ [u(1)]: { status: 409, cuerpo: { codigo: "TURNO_REQUERIDO", error: "Abre un turno" } } }), ahora });
  assert.equal(r.subidas, 1);
  assert.equal(r.esperando, 1);
  const [esperando] = await listarCola(almacen, yo);
  assert.equal(esperando.estado, "esperando_turno");
  assert.equal(esperando.intentos, 0);
}

// 6) Nunca con la sesión de otra persona u otra empresa.
{
  const almacen = almacenMemoria();
  await encolarVenta(almacen, venta(yo, 1));
  await encolarVenta(almacen, venta(otro, 2));
  await encolarVenta(almacen, venta(otraEmpresa, 3));
  const llamadas: Llamada[] = [];
  await subirCola(almacen, otro, { buscar: servidor({}, llamadas), ahora });
  assert.deepEqual(llamadas, [{ uuid: u(2), userId: "11" }]);
  assert.equal((await listarCola(almacen, yo)).length, 1, "la cola de otra persona queda intacta");
  assert.equal((await listarCola(almacen, otraEmpresa)).length, 1);
  // El servidor además responde IDENTIDAD_DISTINTA: tampoco se marca error.
  const r = await subirCola(almacen, yo, { buscar: servidor({ [u(1)]: { status: 403, cuerpo: { codigo: "IDENTIDAD_DISTINTA" } } }), ahora });
  assert.equal(r.errores, 0);
  assert.equal((await listarCola(almacen, yo))[0].estado, "pendiente");
  // Modo apagado en la empresa: se conserva y se avisa.
  const apagado = await subirCola(almacen, yo, { buscar: servidor({ [u(1)]: { status: 403, cuerpo: { codigo: "SIN_RED_APAGADO" } } }), ahora });
  assert.equal(apagado.estado, "apagado");
  assert.equal((await listarCola(almacen, yo)).length, 1);
}

// 7) Validación del servidor (pura): sin cliente, sin nota de crédito, formato de folio, fechas.
const cuerpoBueno = {
  orgId: "1", userId: "10", turnoId: "7", uuidCliente: u(1), folio: folioSinRed(u(1)), vendidaAt: "2026-10-10T12:00:00Z",
  totalCobrado: "50.00", descuento: "0", partidas: [{ productoId: "5", cantidad: "1", descuento: "0" }], pagos: [{ metodo: "efectivo", monto: "50.00" }],
};
assert.ok("data" in validarVentaSinRed(cuerpoBueno));
assert.ok("error" in validarVentaSinRed({ ...cuerpoBueno, contactoId: "9" }));
assert.ok("error" in validarVentaSinRed({ ...cuerpoBueno, pagos: [{ metodo: "nota_credito", monto: "50" }] }));
assert.ok("error" in validarVentaSinRed({ ...cuerpoBueno, folio: "V-123" }));
assert.ok("error" in validarVentaSinRed({ ...cuerpoBueno, vendidaAt: "ayer" }));
assert.ok("error" in validarVentaSinRed({ ...cuerpoBueno, totalCobrado: "-5" }));
assert.ok("error" in validarVentaSinRed({ ...cuerpoBueno, partidas: [] }));
const valida = validarVentaSinRed(cuerpoBueno);
assert.ok("data" in valida && valida.data.totalCobrado.eq(new Prisma.Decimal("50")));

const base = new Date("2026-10-10T12:00:00Z");
assert.equal(ventanaVentaSinRed(new Date(base.getTime() - 71 * 3_600_000), base), null);
assert.equal(ventanaVentaSinRed(new Date(base.getTime() - 73 * 3_600_000), base), "VENTA_MUY_ANTIGUA");
assert.equal(ventanaVentaSinRed(new Date(base.getTime() + 4 * 60_000), base), null, "tolera 5 min de reloj");
assert.equal(ventanaVentaSinRed(new Date(base.getTime() + 6 * 60_000), base), "FECHA_FUTURA");

// 8) Apagado por defecto y solo `true` lo enciende.
assert.equal(ventasSinRedActivas(null), false);
assert.equal(ventasSinRedActivas({}), false);
assert.equal(ventasSinRedActivas({ ventasSinRed: "true" }), false);
assert.equal(ventasSinRedActivas({ ventasSinRed: 1 }), false);
assert.equal(ventasSinRedActivas({ ventasSinRed: true }), true);
const ruta = await readFile("src/app/api/caja/ventas/sin-red/route.ts", "utf8");
assert.match(ruta, /ventasSinRedActivas\(/);
assert.match(ruta, /SIN_RED_APAGADO/);
assert.match(ruta, /IDENTIDAD_DISTINTA/);
assert.match(await readFile("src/app/api/caja/catalogo/route.ts", "utf8"), /SIN_RED_APAGADO/);

console.log("caja sin red: cola FIFO, retroceso, 4xx visible, 401 conserva, otra identidad intacta, turno requerido, validación y apagado OK");
