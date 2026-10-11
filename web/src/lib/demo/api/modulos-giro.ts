// Endpoints de los módulos por giro en la API simulada: citas, productos, caja, cotizaciones y pedidos en línea.
import { almacen, nuevoId } from "../almacen";
import { contactoDe, usuarioDe } from "../vistas";
import type { Datos } from "../tipos";
import { ErrorApi, Respuesta, ruta } from "./ruteo";

const num = (v: unknown) => Number(v) || 0;
const redondear = (n: number) => Math.round(n * 100) / 100;
const ahora = () => new Date().toISOString();

function exigirModulo(clave: string) {
  if (!almacen.datos.modulos[clave]?.activo) throw new ErrorApi(404, "módulo no activo");
}

// ─── Citas y fichas ───────────────────────────────────────────────────────────────────────────
function citaVista(d: Datos, c: any) {
  const contacto = contactoDe(d, c.contactoId)!;
  const responsable = usuarioDe(d, c.responsableId);
  const doctor = (d.extra.doctores ?? []).find((x) => x.id === c.doctorId) ?? null;
  return {
    id: c.id, titulo: c.titulo, notas: c.notas, inicio: c.inicio, fin: c.fin, estado: c.estado, conversacionId: null,
    contacto: { id: contacto.id, nombre: contacto.nombre, expediente: contacto.esCliente ? { id: contacto.id } : null },
    responsable: responsable ? { id: responsable.id, nombre: responsable.nombre } : null,
    doctor,
  };
}

ruta("GET", "/api/citas", ({ url }) => {
  exigirModulo("citas");
  const d = almacen.datos;
  const desde = new Date(url.searchParams.get("desde") ?? Date.now());
  const hasta = url.searchParams.get("hasta") ? new Date(url.searchParams.get("hasta")!) : new Date(+desde + 7 * 86400000);
  const contactoId = url.searchParams.get("contactoId");
  return {
    citas: (d.extra.citas ?? [])
      .filter((c) => new Date(c.inicio) >= desde && new Date(c.inicio) < hasta && (!contactoId || c.contactoId === contactoId))
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .map((c) => citaVista(d, c)),
  };
});

ruta("POST", "/api/citas", ({ cuerpo }) => {
  exigirModulo("citas");
  const d = almacen.datos;
  const inicio = new Date(cuerpo.inicio);
  const fin = new Date(cuerpo.fin);
  if (!cuerpo.contactoId || !String(cuerpo.titulo ?? "").trim() || Number.isNaN(+inicio) || Number.isNaN(+fin) || fin <= inicio) throw new ErrorApi(400, "datos de cita inválidos");
  if (!contactoDe(d, String(cuerpo.contactoId))) throw new ErrorApi(400, "contacto inexistente");
  const cita = {
    id: nuevoId(), contactoId: String(cuerpo.contactoId), responsableId: cuerpo.responsableId ? String(cuerpo.responsableId) : d.usuarios[0].id,
    doctorId: cuerpo.doctorId ? String(cuerpo.doctorId) : null, titulo: String(cuerpo.titulo).trim(), notas: String(cuerpo.notas ?? "").trim() || null,
    inicio: inicio.toISOString(), fin: fin.toISOString(), estado: "programada",
  };
  almacen.mutar(() => void (d.extra.citas ??= []).push(cita));
  return new Respuesta(201, { cita: citaVista(d, cita) });
});

ruta("PATCH", "/api/citas/:id", ({ params, cuerpo }) => {
  const c = (almacen.datos.extra.citas ?? []).find((x) => x.id === params.id);
  if (!c) throw new ErrorApi(404, "cita inexistente");
  almacen.mutar(() => {
    for (const k of ["estado", "titulo", "notas", "inicio", "fin", "doctorId", "responsableId"]) if (k in cuerpo) c[k] = cuerpo[k];
  });
  return { cita: citaVista(almacen.datos, c) };
});

ruta("GET", "/api/doctores", () => ({ doctores: almacen.datos.extra.doctores ?? [] }));
ruta("POST", "/api/doctores", ({ cuerpo }) => {
  const d = almacen.datos;
  const nombre = String(cuerpo.nombre ?? "").trim();
  if (!nombre) throw new ErrorApi(400, "El nombre es obligatorio");
  if ((d.extra.doctores ?? []).some((x) => x.nombre === nombre)) throw new ErrorApi(409, "Ya existe un doctor con ese nombre");
  const doctor = { id: nuevoId(), nombre, especialidad: String(cuerpo.especialidad ?? "").trim() || null, cedula: String(cuerpo.cedula ?? "").trim() || null, color: /^#[0-9a-f]{6}$/i.test(cuerpo.color) ? cuerpo.color : "#0EA5E9", activo: true };
  almacen.mutar(() => void (d.extra.doctores ??= []).push(doctor));
  return new Respuesta(201, { doctor });
});
ruta("PATCH", "/api/doctores/:id", ({ params, cuerpo }) => {
  const doc = (almacen.datos.extra.doctores ?? []).find((x) => x.id === params.id);
  if (!doc) throw new ErrorApi(404, "doctor inexistente");
  almacen.mutar(() => void Object.assign(doc, "activo" in cuerpo ? { activo: !!cuerpo.activo } : {}));
  return { doctor: doc };
});

// Fichas por contacto (el panel del chat pregunta si el contacto ya tiene ficha).
for (const [ruta_, modulo, clave] of [["/api/pacientes", "pacientes", "pacientes"], ["/api/clientes", "clientes", "clientes"]] as const) {
  ruta("GET", ruta_, ({ url }) => {
    exigirModulo(modulo);
    const id = url.searchParams.get("contactoId");
    return { [clave]: almacen.datos.contactos.filter((c) => c.esCliente && (!id || c.id === id)).map((c) => ({ id: c.id, contactoId: c.id })) };
  });
  ruta("POST", ruta_, ({ cuerpo }) => {
    exigirModulo(modulo);
    const c = contactoDe(almacen.datos, String(cuerpo.contactoId));
    if (!c) throw new ErrorApi(400, "contacto inexistente");
    almacen.mutar(() => void (c.esCliente = true));
    return new Respuesta(201, { ok: true, id: c.id });
  });
}

// ─── Productos e inventario ──────────────────────────────────────────────────────────────────
const productos = () => (almacen.datos.extra.productos ??= []);
const producto = (id: string) => {
  const p = productos().find((x) => x.id === id);
  if (!p) throw new ErrorApi(404, "producto inexistente");
  return p;
};

function aplicarFormulario(p: any, f: any) {
  p.nombre = String(f.nombre ?? p.nombre).trim();
  p.sku = String(f.sku ?? "").trim() || null;
  p.codigoBarras = String(f.codigoBarras ?? "").trim() || null;
  p.categoria = String(f.categoria ?? "").trim() || null;
  p.descripcion = String(f.descripcion ?? "").trim() || null;
  p.precio = num(f.precio);
  p.costo = num(f.costo);
  p.stockMinimo = num(f.stockMinimo);
  p.unidad = String(f.unidad ?? "pieza") || "pieza";
  p.vendePorPeso = !!f.vendePorPeso;
  p.fotoUrl = String(f.fotoUrl ?? "").trim() || null;
  p.activo = f.activo !== false;
}

ruta("POST", "/api/productos", ({ cuerpo }) => {
  exigirModulo("productos");
  if (!String(cuerpo.nombre ?? "").trim()) throw new ErrorApi(400, "El nombre es obligatorio");
  if (cuerpo.sku && productos().some((x) => x.sku === cuerpo.sku)) throw new ErrorApi(409, "Ya existe un producto con ese SKU");
  const p: any = { id: nuevoId(), grupoId: null, atributos: {}, moneda: "MXN", visibleEnLinea: false, agotadoManual: false, etiquetasEnLinea: [], stock: num(cuerpo.stock), movimientos: [] };
  aplicarFormulario(p, cuerpo);
  if (p.stock) p.movimientos.push({ id: nuevoId(), tipo: "entrada", cantidad: p.stock, existenciaAntes: 0, existenciaDespues: p.stock, motivo: "Existencia inicial", createdAt: ahora(), usuario: { nombre: almacen.datos.usuarios[0].nombre } });
  almacen.mutar(() => void productos().push(p));
  return new Respuesta(201, { producto: p });
});

ruta("PATCH", "/api/productos/:id", ({ params, cuerpo }) => {
  const p = producto(params.id);
  almacen.mutar(() => aplicarFormulario(p, cuerpo));
  return { producto: p };
});

ruta("POST", "/api/productos/:id/movimientos", ({ params, cuerpo }) => {
  const p = producto(params.id);
  const cantidad = num(cuerpo.cantidad);
  if (cantidad <= 0) throw new ErrorApi(400, "La cantidad debe ser mayor a cero");
  const delta = cuerpo.tipo === "salida" ? -cantidad : cantidad;
  if (p.stock + delta < 0) throw new ErrorApi(409, "La existencia no puede quedar negativa");
  almacen.mutar((d) => {
    const antes = p.stock;
    p.stock = redondear(p.stock + delta);
    p.movimientos.unshift({ id: nuevoId(), tipo: cuerpo.tipo, cantidad: delta, existenciaAntes: antes, existenciaDespues: p.stock, motivo: String(cuerpo.motivo ?? "").trim() || (delta > 0 ? "Entrada de mercancía" : "Salida o merma"), createdAt: ahora(), usuario: { nombre: d.usuarios[0].nombre } });
  });
  return { producto: p };
});

ruta("PATCH", "/api/productos/lote", ({ cuerpo }) => {
  let actualizados = 0;
  almacen.mutar(() => {
    for (const c of cuerpo.productos ?? []) {
      const p = productos().find((x) => x.id === c.id);
      if (!p) continue;
      if ("precio" in c) p.precio = num(c.precio);
      if ("activo" in c) p.activo = !!c.activo;
      if ("agotadoManual" in c) p.agotadoManual = !!c.agotadoManual;
      actualizados++;
    }
  });
  if (!actualizados) throw new ErrorApi(400, "No se reconoció ningún SKU");
  return { ok: true, actualizados };
});

ruta("PATCH", "/api/pedidos-en-linea/productos", ({ cuerpo }) => {
  almacen.mutar(() => {
    for (const c of cuerpo.productos ?? []) {
      const p = productos().find((x) => x.id === c.id);
      if (!p) continue;
      if ("precio" in c) p.precio = num(c.precio);
      if ("visibleEnLinea" in c) p.visibleEnLinea = !!c.visibleEnLinea;
      if ("agotadoManual" in c) p.agotadoManual = !!c.agotadoManual;
      if ("etiquetasEnLinea" in c) p.etiquetasEnLinea = Array.isArray(c.etiquetasEnLinea) ? c.etiquetasEnLinea : String(c.etiquetasEnLinea).split(",").map((t) => t.trim()).filter(Boolean);
    }
  });
  return { ok: true };
});

ruta("PATCH", "/api/pedidos-en-linea/ajustes", ({ cuerpo }) => {
  exigirModulo("pedidos_en_linea");
  almacen.mutar((d) => {
    const c = d.modulos.pedidos_en_linea.config as Record<string, unknown>;
    c.permiteEntrega = String(cuerpo.permiteEntrega) !== "false";
    c.permiteRecoger = String(cuerpo.permiteRecoger) !== "false";
    c.minimoCompra = num(cuerpo.minimoCompra).toFixed(2);
    c.costoEnvio = num(cuerpo.costoEnvio).toFixed(2);
    c.maxPorTelefono = num(cuerpo.maxPorTelefono);
    c.maxPorIp = num(cuerpo.maxPorIp);
    c.horasVencimiento = num(cuerpo.horasVencimiento);
    c.plantillaPedido = cuerpo.plantillaNombre ? { name: cuerpo.plantillaNombre, language: cuerpo.plantillaIdioma || "es_MX" } : undefined;
  });
  return { ok: true };
});

// ─── Caja ────────────────────────────────────────────────────────────────────────────────────
const turnos = () => (almacen.datos.extra.turnos ??= []);
const ventas = () => (almacen.datos.extra.ventas ??= []);

export function turnoVista(d: Datos, t: any) {
  const caja = (d.extra.cajas ?? []).find((c) => c.id === t.cajaId);
  const usuario = usuarioDe(d, t.usuarioId);
  const { movimientos: _m, cajaId: _c, usuarioId: _u, ...resto } = t;
  return { ...resto, caja: caja ? { id: caja.id, nombre: caja.nombre, sucursal: caja.sucursal } : { id: "", nombre: "—", sucursal: null }, usuario: { id: usuario?.id ?? "", nombre: usuario?.nombre ?? "—" } };
}

function corteDe(t: any) {
  const delTurno = ventas().filter((v) => v.turnoId === t.id && v.estado !== "cancelada");
  const efectivoCobrado = delTurno.flatMap((v) => v.pagos).filter((p: any) => p.metodo === "efectivo").reduce((s: number, p: any) => s + p.monto, 0);
  const entradas = t.movimientos.filter((m: any) => m.tipo === "entrada").reduce((s: number, m: any) => s + m.monto, 0);
  const salidas = t.movimientos.filter((m: any) => m.tipo === "salida").reduce((s: number, m: any) => s + m.monto, 0);
  return {
    ventas: delTurno.length, ventasTotal: redondear(delTurno.reduce((s, v) => s + v.total, 0)), efectivoCobrado: redondear(efectivoCobrado), entradas, salidas,
    efectivoEsperado: redondear(t.fondoInicial + efectivoCobrado + entradas - salidas),
  };
}

ruta("POST", "/api/caja/cajas", ({ cuerpo }) => {
  const nombre = String(cuerpo.nombre ?? "").trim();
  if (!nombre) throw new ErrorApi(400, "El nombre es obligatorio");
  almacen.mutar((d) => void (d.extra.cajas ??= []).push({ id: nuevoId(), nombre, sucursal: String(cuerpo.sucursal ?? "").trim() || null, activa: true }));
  return new Respuesta(201, { ok: true });
});

ruta("POST", "/api/caja/turnos", ({ cuerpo }) => {
  const d = almacen.datos;
  const yo = d.usuarios[0].id;
  if (turnos().some((t) => t.estado === "abierto" && t.usuarioId === yo)) throw new ErrorApi(409, "Ya tienes un turno abierto");
  const t = { id: nuevoId(), estado: "abierto", fondoInicial: num(cuerpo.fondoInicial), abiertoAt: ahora(), cerradoAt: null, efectivoContado: null, efectivoEsperado: null, diferencia: null, cajaId: String(cuerpo.cajaId), usuarioId: yo, movimientos: [] };
  almacen.mutar(() => void turnos().unshift(t));
  return new Respuesta(201, { turno: turnoVista(d, t) });
});

ruta("GET", "/api/caja/turnos/:id/corte", ({ params }) => {
  const t = turnos().find((x) => x.id === params.id);
  if (!t) throw new ErrorApi(404, "turno inexistente");
  return { corte: corteDe(t) };
});
ruta("POST", "/api/caja/turnos/:id/corte", ({ params, cuerpo }) => {
  const t = turnos().find((x) => x.id === params.id);
  if (!t) throw new ErrorApi(404, "turno inexistente");
  const corte = corteDe(t);
  const contado = num(cuerpo.efectivoContado);
  almacen.mutar(() => Object.assign(t, { estado: "cerrado", cerradoAt: ahora(), efectivoContado: contado, efectivoEsperado: corte.efectivoEsperado, diferencia: redondear(contado - corte.efectivoEsperado) }));
  return { corte: { ...corte, diferencia: redondear(contado - corte.efectivoEsperado) } };
});

ruta("POST", "/api/caja/movimientos", ({ cuerpo }) => {
  const t = turnos().find((x) => x.id === String(cuerpo.turnoId));
  if (!t || t.estado !== "abierto") throw new ErrorApi(404, "turno inexistente");
  const monto = num(cuerpo.monto);
  if (monto <= 0 || !String(cuerpo.motivo ?? "").trim()) throw new ErrorApi(400, "monto o motivo inválido");
  almacen.mutar(() => void t.movimientos.push({ id: nuevoId(), tipo: cuerpo.tipo, monto, motivo: cuerpo.motivo }));
  return new Respuesta(201, { ok: true });
});

ruta("POST", "/api/caja/ventas", ({ cuerpo }) => {
  const d = almacen.datos;
  const t = turnos().find((x) => x.id === String(cuerpo.turnoId));
  if (!t || t.estado !== "abierto") throw new ErrorApi(409, "El turno no está abierto");
  const previa = ventas().find((v) => v.uuidCliente && v.uuidCliente === cuerpo.uuidCliente);
  if (previa) return { repetida: true, venta: { id: previa.id, folio: previa.folio, contacto: null } };
  if (!Array.isArray(cuerpo.partidas) || !cuerpo.partidas.length) throw new ErrorApi(400, "La venta no tiene productos");
  const partidas = cuerpo.partidas.map((l: any) => {
    const p = producto(String(l.productoId));
    const cantidad = num(l.cantidad);
    if (p.stock < cantidad) throw new ErrorApi(409, `Existencia insuficiente de ${p.nombre}`);
    const total = redondear(p.precio * cantidad - num(l.descuento));
    return { id: nuevoId(), productoId: p.id, cantidad, precioUnitario: p.precio, total };
  });
  const subtotal = redondear(partidas.reduce((s: number, l: any) => s + l.total, 0));
  const total = redondear(subtotal - num(cuerpo.descuento));
  const pagos = (cuerpo.pagos ?? []).map((p: any) => ({ metodo: p.metodo, monto: num(p.monto) }));
  const pagado = pagos.reduce((s: number, p: any) => s + p.monto, 0);
  if (pagado + 0.001 < total) throw new ErrorApi(400, "El pago no cubre el total");
  // El cambio se devuelve del efectivo recibido.
  let cambio = redondear(pagado - total);
  for (const p of pagos) if (p.metodo === "efectivo" && cambio > 0) { const q = Math.min(p.monto, cambio); p.monto = redondear(p.monto - q); cambio = redondear(cambio - q); }
  const venta = {
    id: nuevoId(), folio: `V-${String(ventas().length + 1).padStart(4, "0")}`, contactoId: cuerpo.contactoId ? String(cuerpo.contactoId) : null, creadoPorId: d.usuarios[0].id, estado: "pagada",
    canal: "mostrador", metodoPago: pagos[0]?.metodo ?? "efectivo", subtotal, costoEnvio: 0, total, turnoId: t.id, cajaId: t.cajaId, createdAt: ahora(), tipoEntrega: null, partidas, pagos, uuidCliente: cuerpo.uuidCliente,
  };
  almacen.mutar(() => {
    ventas().unshift(venta);
    for (const l of partidas) {
      const p = producto(l.productoId);
      const antes = p.stock;
      p.stock = redondear(p.stock - l.cantidad);
      p.movimientos.unshift({ id: nuevoId(), tipo: "venta", cantidad: -l.cantidad, existenciaAntes: antes, existenciaDespues: p.stock, motivo: `Venta ${venta.folio}`, createdAt: ahora(), usuario: { nombre: d.usuarios[0].nombre } });
    }
  });
  const contacto = venta.contactoId ? contactoDe(d, venta.contactoId) : null;
  return new Respuesta(201, { venta: { id: venta.id, folio: venta.folio, contacto: contacto ? { id: contacto.id, nombre: contacto.nombre, telefono: contacto.telefono } : null } });
});

// Operaciones de la caja que la demo muestra vacías.
ruta("GET", "/api/caja/devoluciones", () => ({ ventas: [] }));
ruta("GET", "/api/caja/apartados", () => ({ apartados: [] }));
ruta("GET", "/api/caja/credito/:id", () => new Respuesta(404, { error: "sin cuenta de crédito" }));

// ─── Cotizaciones ────────────────────────────────────────────────────────────────────────────
const cotizaciones = () => (almacen.datos.extra.cotizaciones ??= []);

ruta("POST", "/api/cotizaciones", ({ cuerpo }) => {
  exigirModulo("cotizaciones");
  const d = almacen.datos;
  const contacto = contactoDe(d, String(cuerpo.contactoId ?? ""));
  if (!contacto) throw new ErrorApi(400, "contacto inexistente");
  if (!cuerpo.vigencia) throw new ErrorApi(400, "falta la vigencia");
  const config = d.modulos.cotizaciones.config as Record<string, unknown>;
  const iva = num(config.ivaPorcentaje ?? 16);
  const partidas = (cuerpo.partidas ?? []).filter((p: any) => String(p.concepto ?? "").trim()).map((p: any) => {
    const prod = p.productoId ? productos().find((x) => x.id === String(p.productoId)) : null;
    const precio = prod ? prod.precio : num(p.precio);
    return { id: nuevoId(), productoId: prod?.id ?? null, concepto: prod?.nombre ?? String(p.concepto), cantidad: num(p.cantidad), precio, descuento: num(p.descuento), total: redondear(precio * num(p.cantidad) - num(p.descuento)) };
  });
  if (!partidas.length) throw new ErrorApi(400, "agrega al menos un concepto");
  const subtotal = redondear(partidas.reduce((s: number, p: any) => s + p.total, 0) - num(cuerpo.descuento));
  const impuestos = config.preciosConIva ? 0 : redondear(subtotal * iva / 100);
  const n = cotizaciones().length + 1;
  const cot = {
    id: nuevoId(), folio: `COT-${String(n).padStart(4, "0")}`, contactoId: contacto.id, creadoPorId: d.usuarios[0].id, estado: "borrador", vigencia: new Date(`${cuerpo.vigencia}T12:00:00-06:00`).toISOString(),
    subtotal, impuestos, total: redondear(subtotal + impuestos), tokenPublico: nuevoId().padStart(32, "0"), ventaId: null, oportunidadId: null, createdAt: ahora(), partidas,
  };
  almacen.mutar(() => void cotizaciones().unshift(cot));
  return new Respuesta(201, { ok: true, id: cot.id });
});

ruta("POST", "/api/cotizaciones/:id/enviar", ({ params }) => {
  const c = cotizaciones().find((x) => x.id === params.id);
  if (!c) throw new ErrorApi(404, "cotización inexistente");
  almacen.mutar(() => void (c.estado = "enviada"));
  return { ok: true, forma: "enlace (demo: no se envía nada)" };
});

ruta("PATCH", "/api/cotizaciones/config", ({ cuerpo }) => {
  const iva = num(cuerpo.ivaPorcentaje);
  if (iva < 0 || iva > 100) throw new ErrorApi(400, "IVA inválido");
  almacen.mutar((d) => {
    const c = d.modulos.cotizaciones.config as Record<string, unknown>;
    c.ivaPorcentaje = String(iva);
    c.preciosConIva = cuerpo.preciosConIva === "true" || cuerpo.preciosConIva === true;
  });
  return { ok: true };
});
