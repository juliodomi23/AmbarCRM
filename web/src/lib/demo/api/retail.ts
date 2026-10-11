// Endpoints de retail en la API simulada: ventas, compras, proveedores, precios y reportes.
import { almacen, fechaMexico, nuevoId } from "../almacen";
import { contactoDe } from "../vistas";
import { reporteRetail } from "../reporte-retail";
import { ErrorApi, Respuesta, ruta } from "./ruteo";

const num = (v: unknown) => Number(v) || 0;
const redondear = (n: number) => Math.round(n * 100) / 100;
const ahora = () => new Date().toISOString();
const productos = () => (almacen.datos.extra.productos ??= []);
const ventas = () => (almacen.datos.extra.ventas ??= []);
const compras = () => (almacen.datos.extra.compras ??= []);
const producto = (id: string) => {
  const p = productos().find((x) => x.id === id);
  if (!p) throw new ErrorApi(404, "producto inexistente");
  return p;
};
/** Estados que descuentan existencia (igual que el seed: ni borrador ni cancelada). */
const aplicaStock = (estado: string) => estado !== "borrador" && estado !== "cancelada";

function mover(p: any, delta: number, motivo: string, tipo: string) {
  const antes = p.stock;
  p.stock = redondear(p.stock + delta);
  p.movimientos.unshift({ id: nuevoId(), tipo, cantidad: delta, existenciaAntes: antes, existenciaDespues: p.stock, motivo, createdAt: ahora(), usuario: { nombre: almacen.datos.usuarios[0].nombre } });
}

ruta("POST", "/api/ventas", ({ cuerpo }) => {
  const d = almacen.datos;
  if (!Array.isArray(cuerpo.partidas) || !cuerpo.partidas.length) throw new ErrorApi(400, "agrega al menos un producto");
  if (cuerpo.contactoId && !contactoDe(d, String(cuerpo.contactoId))) throw new ErrorApi(400, "contacto inexistente");
  const partidas = cuerpo.partidas.map((l: any) => {
    const p = producto(String(l.productoId));
    const cantidad = num(l.cantidad);
    if (cantidad <= 0) throw new ErrorApi(400, "cantidad inválida");
    if (aplicaStock(cuerpo.estado) && p.stock < cantidad) throw new ErrorApi(409, `Existencia insuficiente de ${p.nombre}`);
    return { id: nuevoId(), productoId: p.id, cantidad, precioUnitario: p.precio, total: redondear(p.precio * cantidad) };
  });
  const subtotal = redondear(partidas.reduce((s: number, l: any) => s + l.total, 0));
  const descuento = num(cuerpo.descuento);
  const venta = {
    id: nuevoId(), folio: `V-${String(ventas().length + 1).padStart(4, "0")}`, contactoId: cuerpo.contactoId ? String(cuerpo.contactoId) : null, creadoPorId: d.usuarios[0].id,
    estado: cuerpo.estado ?? "pagada", canal: cuerpo.canal ?? "mostrador", metodoPago: cuerpo.metodoPago ?? "efectivo", subtotal, descuento, costoEnvio: 0, total: redondear(subtotal - descuento),
    notas: String(cuerpo.notas ?? "").trim() || null, turnoId: null, cajaId: null, createdAt: ahora(), tipoEntrega: null, partidas, pagos: [],
  };
  almacen.mutar(() => {
    ventas().unshift(venta);
    if (aplicaStock(venta.estado)) for (const l of partidas) mover(producto(l.productoId), -l.cantidad, `Venta ${venta.folio}`, "venta");
  });
  return new Respuesta(201, { venta: { id: venta.id, folio: venta.folio } });
});

ruta("PATCH", "/api/ventas/:id", ({ params, cuerpo }) => {
  const v = ventas().find((x) => x.id === params.id);
  if (!v) throw new ErrorApi(404, "venta inexistente");
  const antes = aplicaStock(v.estado);
  almacen.mutar(() => {
    v.estado = cuerpo.estado ?? v.estado;
    const despues = aplicaStock(v.estado);
    if (antes && !despues) for (const l of v.partidas) mover(producto(l.productoId), l.cantidad, `Cancelación ${v.folio}`, "devolucion");
    if (!antes && despues) for (const l of v.partidas) mover(producto(l.productoId), -l.cantidad, `Venta ${v.folio}`, "venta");
  });
  return { ok: true };
});

ruta("POST", "/api/compras/proveedores", ({ cuerpo }) => {
  const nombre = String(cuerpo.nombre ?? "").trim();
  if (!nombre) throw new ErrorApi(400, "El nombre es obligatorio");
  const d = almacen.datos;
  if ((d.extra.proveedores ?? []).some((p) => p.nombre === nombre)) throw new ErrorApi(409, "Ya existe un proveedor con ese nombre");
  const o = (v: unknown) => String(v ?? "").trim() || null;
  almacen.mutar(() => void (d.extra.proveedores ??= []).push({ id: nuevoId(), nombre, contactoNombre: o(cuerpo.contactoNombre), telefono: o(cuerpo.telefono), email: o(cuerpo.email), rfc: o(cuerpo.rfc), notas: o(cuerpo.notas), activo: true }));
  return new Respuesta(201, { ok: true });
});

ruta("POST", "/api/compras", ({ cuerpo }) => {
  const d = almacen.datos;
  const proveedor = (d.extra.proveedores ?? []).find((p) => p.id === String(cuerpo.proveedorId));
  if (!proveedor) throw new ErrorApi(400, "proveedor inexistente");
  if (!Array.isArray(cuerpo.partidas) || !cuerpo.partidas.length) throw new ErrorApi(400, "agrega al menos un producto");
  const partidas = cuerpo.partidas.map((l: any) => {
    const p = producto(String(l.productoId));
    return { id: nuevoId(), productoId: p.id, cantidad: num(l.cantidad), costoUnitario: num(l.costoUnitario), total: redondear(num(l.cantidad) * num(l.costoUnitario)) };
  });
  const compra = { id: nuevoId(), folio: `C-${String(compras().length + 1).padStart(4, "0")}`, proveedorId: proveedor.id, creadoPorId: d.usuarios[0].id, estado: cuerpo.estado ?? "ordenada", total: redondear(partidas.reduce((s: number, l: any) => s + l.total, 0)), notas: String(cuerpo.notas ?? "").trim() || null, createdAt: ahora(), partidas };
  almacen.mutar(() => {
    compras().unshift(compra);
    if (compra.estado === "recibida") for (const l of partidas) { const p = producto(l.productoId); mover(p, l.cantidad, `Compra ${compra.folio}`, "compra"); p.costo = l.costoUnitario; }
  });
  return new Respuesta(201, { ok: true });
});

ruta("PATCH", "/api/compras/:id", ({ params, cuerpo }) => {
  const c = compras().find((x) => x.id === params.id);
  if (!c) throw new ErrorApi(404, "compra inexistente");
  almacen.mutar(() => {
    if (cuerpo.estado === "recibida" && c.estado !== "recibida") for (const l of c.partidas) { const p = producto(l.productoId); mover(p, l.cantidad, `Compra ${c.folio}`, "compra"); p.costo = l.costoUnitario; }
    c.estado = cuerpo.estado ?? c.estado;
  });
  return { ok: true };
});

ruta("POST", "/api/precios", ({ cuerpo }) => {
  const d = almacen.datos;
  const fecha = (v: unknown) => new Date(`${v}T00:00:00-06:00`).toISOString();
  almacen.mutar(() => {
    switch (cuerpo.accion) {
      case "lista":
        if (!String(cuerpo.nombre ?? "").trim()) throw new ErrorApi(400, "falta el nombre");
        (d.extra.listasPrecio ??= []).push({ id: nuevoId(), nombre: String(cuerpo.nombre).trim(), tipo: cuerpo.tipo ?? "cliente" });
        break;
      case "volumen":
        producto(String(cuerpo.productoId));
        (d.extra.escalas ??= []).push({ id: nuevoId(), productoId: String(cuerpo.productoId), desde: num(cuerpo.desde), precio: num(cuerpo.precio) });
        break;
      case "promocion":
        if (!cuerpo.inicia || !cuerpo.termina) throw new ErrorApi(400, "faltan las fechas");
        (d.extra.promociones ??= []).push({ id: nuevoId(), nombre: String(cuerpo.nombre ?? "Promoción"), tipo: cuerpo.tipo ?? "porcentaje", productoId: cuerpo.productoId ? String(cuerpo.productoId) : null, categoria: cuerpo.categoria || null, valor: num(cuerpo.valor), inicia: fecha(cuerpo.inicia), termina: fecha(cuerpo.termina) });
        break;
      case "asignar_lista": {
        const c = contactoDe(d, String(cuerpo.contactoId));
        if (!c) throw new ErrorApi(404, "cliente inexistente");
        c.campos = { ...c.campos, listaPrecioId: cuerpo.listaId || null };
        break;
      }
      case "precio_lista":
        break; // la demo no recalcula precios por lista: se acepta y se muestra el aviso estándar
      default:
        throw new ErrorApi(400, "acción inválida");
    }
  });
  return { ok: true };
});

ruta("GET", "/api/reportes/retail", ({ url }) => {
  const hoy = fechaMexico(0, 0).slice(0, 10);
  const desde = url.searchParams.get("desde") ?? hoy;
  const hasta = url.searchParams.get("hasta") ?? hoy;
  return { reporte: reporteRetail(almacen.datos, desde, hasta) };
});
