// Caja completa en la API simulada: devoluciones, apartados y crédito de clientes. Todo sobre el almacén:
// no se toca dinero real ni el servidor.
import { almacen, nuevoId } from "../almacen";
import { contactoDe } from "../vistas";
import { ErrorApi, Respuesta, ruta } from "./ruteo";

const num = (v: unknown) => Number(v) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
const ahora = () => new Date().toISOString();
const ventas = () => (almacen.datos.extra.ventas ??= []);
const apartados = () => (almacen.datos.extra.apartados ??= []);
const cuentas = () => (almacen.datos.extra.cuentasCredito ??= []);
const turnos = () => (almacen.datos.extra.turnos ??= []);
const producto = (id: string) => {
  const p = (almacen.datos.extra.productos ?? []).find((x) => x.id === id);
  if (!p) throw new ErrorApi(404, "producto inexistente");
  return p;
};
const turnoAbierto = (id: unknown) => {
  const t = turnos().find((x) => x.id === String(id));
  if (!t || t.estado !== "abierto") throw new ErrorApi(409, "El turno no está abierto");
  return t;
};
function mover(p: any, delta: number, motivo: string, tipo: string) {
  const antes = p.stock;
  p.stock = r2(p.stock + delta);
  p.movimientos.unshift({ id: nuevoId(), tipo, cantidad: delta, existenciaAntes: antes, existenciaDespues: p.stock, motivo, createdAt: ahora(), usuario: { nombre: almacen.datos.usuarios[0].nombre } });
}
const partidasDe = (cuerpo: any) => {
  if (!Array.isArray(cuerpo.partidas) || !cuerpo.partidas.length) throw new ErrorApi(400, "La venta no tiene productos");
  return cuerpo.partidas.map((l: any) => {
    const p = producto(String(l.productoId));
    const cantidad = num(l.cantidad);
    if (p.stock < cantidad) throw new ErrorApi(409, `Existencia insuficiente de ${p.nombre}`);
    return { id: nuevoId(), productoId: p.id, cantidad, precioUnitario: p.precio, total: r2(p.precio * cantidad - num(l.descuento)), devoluciones: [] as any[] };
  });
};
const folio = (pref: string) => `${pref}-${String(ventas().length + 1).padStart(4, "0")}`;
const nombreProducto = (id: string) => {
  const p = producto(id);
  return { id: p.id, nombre: p.nombre, unidad: p.unidad, sku: p.sku };
};

// ─── Devoluciones ─────────────────────────────────────────────────────────────────────────────
ruta("GET", "/api/caja/devoluciones", () => {
  const d = almacen.datos;
  return {
    ventas: ventas()
      .filter((v) => !["cancelada", "apartado", "borrador"].includes(v.estado))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30)
      .map((v) => ({
        id: v.id, folio: v.folio, total: v.total.toFixed(2), contacto: v.contactoId ? { id: v.contactoId, nombre: contactoDe(d, v.contactoId)?.nombre ?? "" } : null,
        partidas: v.partidas.map((l: any) => ({ id: l.id, cantidad: String(l.cantidad), producto: nombreProducto(l.productoId), devoluciones: (l.devoluciones ??= []).map((x: any) => ({ cantidad: String(x.cantidad) })) })),
      })),
    devoluciones: [],
  };
});

ruta("POST", "/api/caja/devoluciones", ({ cuerpo }) => {
  const v = ventas().find((x) => x.id === String(cuerpo.ventaId));
  if (!v) throw new ErrorApi(404, "Venta inexistente");
  if (!Array.isArray(cuerpo.partidas) || !cuerpo.partidas.length) throw new ErrorApi(400, "Indica qué se devuelve");
  almacen.mutar(() => {
    for (const item of cuerpo.partidas) {
      const l = v.partidas.find((x: any) => x.id === String(item.ventaPartidaId));
      if (!l) throw new ErrorApi(400, "Partida inexistente");
      const devuelto = (l.devoluciones ??= []).reduce((s: number, x: any) => s + x.cantidad, 0);
      const cantidad = num(item.cantidad);
      if (cantidad <= 0 || cantidad > l.cantidad - devuelto + 1e-9) throw new ErrorApi(409, "La cantidad supera lo vendido");
      l.devoluciones.push({ cantidad });
      mover(producto(l.productoId), cantidad, `Devolución ${v.folio}`, "devolucion");
    }
  });
  return new Respuesta(201, { devolucion: { id: nuevoId(), ventaId: v.id, tipoReembolso: cuerpo.tipoReembolso } });
});

// ─── Apartados ────────────────────────────────────────────────────────────────────────────────
ruta("GET", "/api/caja/apartados", () => {
  const d = almacen.datos;
  return {
    apartados: apartados().map((a) => ({
      id: a.id, estado: a.estado, saldo: a.saldo.toFixed(2), venceAt: a.venceAt,
      contacto: { nombre: contactoDe(d, a.contactoId)?.nombre ?? "" }, venta: { folio: ventas().find((v) => v.id === a.ventaId)?.folio ?? "" },
    })),
  };
});

ruta("POST", "/api/caja/apartados", ({ cuerpo }) => {
  const d = almacen.datos;
  const t = turnoAbierto(cuerpo.turnoId);
  if (!contactoDe(d, String(cuerpo.contactoId))) throw new ErrorApi(400, "Elige un cliente para apartar");
  const partidas = partidasDe(cuerpo);
  const total = r2(partidas.reduce((s: number, l: any) => s + l.total, 0));
  const anticipo = num(cuerpo.anticipo);
  if (anticipo <= 0 || anticipo > total) throw new ErrorApi(400, "El anticipo debe ser mayor a cero y no superar el total");
  const venta = {
    id: nuevoId(), folio: folio("APA"), contactoId: String(cuerpo.contactoId), creadoPorId: d.usuarios[0].id, estado: "apartado", canal: "mostrador", metodoPago: cuerpo.metodo ?? "efectivo",
    subtotal: total, descuento: 0, costoEnvio: 0, total, turnoId: t.id, cajaId: t.cajaId, createdAt: ahora(), tipoEntrega: null, notas: null, partidas, pagos: [{ metodo: cuerpo.metodo ?? "efectivo", monto: anticipo }],
  };
  almacen.mutar(() => {
    ventas().unshift(venta);
    for (const l of partidas) mover(producto(l.productoId), -l.cantidad, `Apartado ${venta.folio}`, "apartado");
    apartados().unshift({ id: nuevoId(), estado: "activo", saldo: r2(total - anticipo), venceAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), contactoId: venta.contactoId, ventaId: venta.id });
  });
  return new Respuesta(201, { ok: true });
});

function liberar(a: any, v: any, motivo: string) {
  for (const l of v.partidas) mover(producto(l.productoId), l.cantidad, motivo, "devolucion");
  a.estado = "cancelado";
  v.estado = "cancelada";
}

ruta("PATCH", "/api/caja/apartados/:id", ({ params, cuerpo }) => {
  const a = apartados().find((x) => x.id === params.id);
  if (!a || a.estado !== "activo") throw new ErrorApi(404, "Apartado inexistente o ya cerrado");
  const v = ventas().find((x) => x.id === a.ventaId)!;
  almacen.mutar(() => {
    if (cuerpo.accion === "abonar") {
      const t = turnoAbierto(cuerpo.turnoId);
      const monto = num(cuerpo.monto);
      if (monto <= 0 || monto > a.saldo + 0.001) throw new ErrorApi(400, "El abono debe ser mayor a cero y no superar el saldo");
      a.saldo = r2(a.saldo - monto);
      v.pagos.push({ metodo: cuerpo.metodo ?? "efectivo", monto });
      v.turnoId = t.id;
      if (a.saldo <= 0) {
        a.estado = "liquidado";
        v.estado = "pagada";
      }
    } else if (cuerpo.accion === "cancelar") {
      liberar(a, v, `Apartado cancelado ${v.folio}`);
    } else throw new ErrorApi(400, "acción inválida");
  });
  return { ok: true };
});

ruta("POST", "/api/caja/apartados/vencer", () => {
  let vencidos = 0;
  almacen.mutar(() => {
    for (const a of apartados()) {
      if (a.estado === "activo" && new Date(a.venceAt) < new Date()) {
        liberar(a, ventas().find((x) => x.id === a.ventaId)!, "Apartado vencido");
        vencidos++;
      }
    }
  });
  return { ok: true, vencidos };
});

// ─── Crédito de clientes ──────────────────────────────────────────────────────────────────────
const cuentaVista = (c: any) => ({
  limiteCredito: c.limiteCredito.toFixed(2), saldo: c.saldo.toFixed(2), antiguedadDias: Math.max(0, Math.floor((Date.now() - new Date(c.creadaAt).getTime()) / 86_400_000)),
  movimientos: c.movimientos.map((m: any) => ({ id: m.id, tipo: m.tipo, monto: m.monto, createdAt: m.createdAt })),
});

ruta("GET", "/api/caja/credito/:contactoId", ({ params }) => {
  const c = cuentas().find((x) => x.contactoId === params.contactoId);
  if (!c) throw new ErrorApi(404, "sin cuenta de crédito");
  return { cuenta: cuentaVista(c) };
});

ruta("PATCH", "/api/caja/credito/:contactoId", ({ params, cuerpo }) => {
  if (!contactoDe(almacen.datos, params.contactoId)) throw new ErrorApi(404, "cliente inexistente");
  const limite = num(cuerpo.limiteCredito);
  if (limite < 0) throw new ErrorApi(400, "Límite inválido");
  let c = cuentas().find((x) => x.contactoId === params.contactoId);
  almacen.mutar(() => {
    if (!c) {
      c = { contactoId: params.contactoId, limiteCredito: limite, saldo: 0, creadaAt: ahora(), movimientos: [] };
      cuentas().push(c);
    } else c.limiteCredito = limite;
  });
  return { cuenta: cuentaVista(c) };
});

ruta("POST", "/api/caja/credito/abonos", ({ cuerpo }) => {
  const t = turnoAbierto(cuerpo.turnoId);
  const c = cuentas().find((x) => x.contactoId === String(cuerpo.contactoId));
  if (!c) throw new ErrorApi(404, "El cliente no tiene cuenta de crédito");
  const monto = num(cuerpo.monto);
  if (monto <= 0 || monto > c.saldo + 0.001) throw new ErrorApi(400, "El abono debe ser mayor a cero y no superar el saldo");
  almacen.mutar(() => {
    c.saldo = r2(c.saldo - monto);
    c.movimientos.unshift({ id: nuevoId(), tipo: "abono", monto, createdAt: ahora() });
    if ((cuerpo.metodo ?? "efectivo") === "efectivo") t.movimientos.push({ id: nuevoId(), tipo: "entrada", monto, motivo: "Abono a crédito" });
  });
  return new Respuesta(201, { ok: true });
});

ruta("POST", "/api/caja/credito/ventas", ({ cuerpo }) => {
  const d = almacen.datos;
  const t = turnoAbierto(cuerpo.turnoId);
  const c = cuentas().find((x) => x.contactoId === String(cuerpo.contactoId));
  if (!c) throw new ErrorApi(409, "El cliente no tiene crédito autorizado");
  const previa = ventas().find((v) => v.uuidCliente && v.uuidCliente === cuerpo.uuidCliente);
  if (previa) return { repetida: true, venta: { id: previa.id, folio: previa.folio, contacto: null } };
  const partidas = partidasDe(cuerpo);
  const total = r2(partidas.reduce((s: number, l: any) => s + l.total, 0) - num(cuerpo.descuento));
  if (c.saldo + total > c.limiteCredito + 0.001) throw new ErrorApi(409, `La venta supera el límite de crédito (${c.limiteCredito.toLocaleString("es-MX", { style: "currency", currency: "MXN" })})`);
  const venta = {
    id: nuevoId(), folio: folio("V"), contactoId: c.contactoId, creadoPorId: d.usuarios[0].id, estado: "pendiente", canal: "mostrador", metodoPago: "credito", subtotal: total, descuento: num(cuerpo.descuento),
    costoEnvio: 0, total, turnoId: t.id, cajaId: t.cajaId, createdAt: ahora(), tipoEntrega: null, notas: null, partidas, pagos: [], esCredito: true, uuidCliente: cuerpo.uuidCliente,
  };
  almacen.mutar(() => {
    ventas().unshift(venta);
    for (const l of partidas) mover(producto(l.productoId), -l.cantidad, `Venta a crédito ${venta.folio}`, "venta");
    c.saldo = r2(c.saldo + total);
    c.movimientos.unshift({ id: nuevoId(), tipo: "cargo", monto: total, createdAt: ahora(), referencia: venta.folio });
  });
  const contacto = contactoDe(d, c.contactoId);
  return new Respuesta(201, { venta: { id: venta.id, folio: venta.folio, contacto: contacto ? { id: contacto.id, nombre: contacto.nombre, telefono: contacto.telefono } : null } });
});

// Recordatorio de saldo por WhatsApp: se simula, no se envía nada.
ruta("POST", "/api/caja/credito/:contactoId/recordatorio", () => ({ ok: true }));
