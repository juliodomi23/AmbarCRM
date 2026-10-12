// Endpoints de las páginas públicas (tienda, reservas, opinión, cotización) en la API simulada.
// Las páginas públicas se muestran dentro de /demo; aquí no hay servidor: todo cae al almacén.
import { calcularHorarios, fechaLocal, minutosDeHora, sumarDias, type Ocupado } from "@/lib/reservas/horarios";
import { telefonoMx } from "@/lib/reservas/telefono";
import { almacen, nuevoId } from "../almacen";
import { ErrorApi, Respuesta, ruta } from "./ruteo";

const num = (v: unknown) => Number(v) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
const ahora = () => new Date().toISOString();
const token32 = () => Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10).padEnd(8, "0")).join("");

// ─── Tienda en línea ──────────────────────────────────────────────────────────────────────────
const configPedidos = () => {
  const c = (almacen.datos.modulos.pedidos_en_linea?.config ?? {}) as Record<string, any>;
  return { permiteEntrega: c.permiteEntrega !== false, permiteRecoger: c.permiteRecoger !== false, minimoCompra: num(c.minimoCompra), costoEnvio: num(c.costoEnvio) };
};
const productosEnLinea = () => (almacen.datos.extra.productos ?? []).filter((p) => p.activo && p.visibleEnLinea);

ruta("GET", "/api/public/tienda/:slug", () => {
  const d = almacen.datos;
  const c = configPedidos();
  if (!d.modulos.pedidos_en_linea?.activo) throw new ErrorApi(404, "Este negocio no tiene tienda en línea");
  return {
    negocio: { nombre: d.marca.nombre, logo: d.marca.logo },
    config: { permiteEntrega: c.permiteEntrega, permiteRecoger: c.permiteRecoger, minimoCompra: c.minimoCompra.toFixed(2), costoEnvio: c.costoEnvio.toFixed(2) },
    productos: productosEnLinea().map((p) => ({
      id: p.id, nombre: p.nombre, descripcion: p.descripcion, categoria: p.categoria, precio: p.precio.toFixed(2), unidad: p.unidad, vendePorPeso: p.vendePorPeso, fotoUrl: p.fotoUrl,
      etiquetas: p.etiquetasEnLinea, agotado: p.agotadoManual || p.stock <= 0, disponible: String(p.stock),
    })),
  };
});

function partidasTienda(cuerpo: any) {
  const items = (cuerpo.partidas ?? []).filter((l: any) => num(l.cantidad) > 0);
  if (!items.length) throw new ErrorApi(400, "Agrega al menos un producto");
  return items.map((l: any) => {
    const p = productosEnLinea().find((x) => x.id === String(l.productoId));
    if (!p || p.agotadoManual) throw new ErrorApi(409, "Un producto ya no está disponible");
    const cantidad = num(l.cantidad);
    if (cantidad > p.stock) throw new ErrorApi(409, `Solo quedan ${p.stock} de ${p.nombre}`);
    return { p, cantidad, total: r2(p.precio * cantidad) };
  });
}

ruta("PUT", "/api/public/tienda/:slug", ({ cuerpo }) => {
  const partidas = partidasTienda(cuerpo);
  return { subtotal: partidas.reduce((s: number, l: any) => s + l.total, 0).toFixed(2) };
});

ruta("POST", "/api/public/tienda/:slug", ({ cuerpo }) => {
  const d = almacen.datos;
  const cfg = configPedidos();
  const nombre = String(cuerpo.nombre ?? "").trim();
  const telefono = telefonoMx(cuerpo.telefono);
  if (!nombre) throw new ErrorApi(400, "Escribe tu nombre");
  if (!telefono) throw new ErrorApi(400, "Escribe un teléfono de 10 dígitos");
  const entrega = cuerpo.tipoEntrega === "domicilio" || cuerpo.tipoEntrega === "envio" ? "envio" : "recoger";
  if (entrega === "envio" && (!cfg.permiteEntrega || !String(cuerpo.direccion ?? "").trim())) throw new ErrorApi(400, "Escribe la dirección de entrega");
  if (entrega === "recoger" && !cfg.permiteRecoger) throw new ErrorApi(400, "Esta tienda no permite recoger");
  const partidas = partidasTienda(cuerpo);
  const subtotal = r2(partidas.reduce((s: number, l: any) => s + l.total, 0));
  if (subtotal < cfg.minimoCompra) throw new ErrorApi(400, `La compra mínima es $${cfg.minimoCompra.toFixed(2)}`);
  const costoEnvio = entrega === "envio" ? cfg.costoEnvio : 0;
  const ventas = (d.extra.ventas ??= []);
  let contacto = d.contactos.find((c) => (c.telefono ?? "").endsWith(telefono));
  const tokenSeguimiento = token32();
  almacen.mutar(() => {
    if (!contacto) {
      contacto = { id: nuevoId(), nombre, telefono, email: null, empresa: null, notas: null, fuente: "tienda_en_linea", responsableId: null, optOutDifusion: false, esPersonal: false, esCliente: false, etiquetaIds: [], campos: {}, createdAt: ahora() };
      d.contactos.push(contacto);
    }
    ventas.unshift({
      id: nuevoId(), folio: `PED-${String(ventas.length + 1).padStart(4, "0")}`, contactoId: contacto.id, creadoPorId: null, estado: "pendiente", canal: "tienda_en_linea", metodoPago: "enlace",
      subtotal, descuento: 0, costoEnvio, total: r2(subtotal + costoEnvio), turnoId: null, cajaId: null, createdAt: ahora(), tipoEntrega: entrega, notas: String(cuerpo.notas ?? "").trim() || null,
      partidas: partidas.map((l: any) => ({ id: nuevoId(), productoId: l.p.id, cantidad: l.cantidad, precioUnitario: l.p.precio, total: l.total, devoluciones: [] })), pagos: [], tokenSeguimiento,
    });
    for (const l of partidas) l.p.stock = r2(l.p.stock - l.cantidad); // la existencia queda apartada para el pedido
  });
  return new Respuesta(201, { token: tokenSeguimiento });
});

// ─── Opinión (reseñas de Google) ──────────────────────────────────────────────────────────────
ruta("POST", "/api/public/opinion/:slug", ({ cuerpo }) => {
  const calificacion = Number(cuerpo.calificacion);
  if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) throw new ErrorApi(400, "Calificación inválida");
  const origen = String(cuerpo.origen ?? "directo").trim().toLowerCase().slice(0, 40) || "directo";
  almacen.mutar((d) => void d.resenas.unshift({ calificacion, origen, createdAt: ahora() }));
  return new Respuesta(201, { ok: true });
});

// ─── Cotización pública ───────────────────────────────────────────────────────────────────────
ruta("POST", "/api/public/cotizaciones/:token/responder", ({ params, cuerpo }) => {
  const c = (almacen.datos.extra.cotizaciones ?? []).find((x) => x.tokenPublico === params.token);
  if (!c) throw new ErrorApi(404, "Cotización inexistente");
  if (["aceptada", "rechazada"].includes(c.estado)) return { repetida: true, cotizacion: { estado: c.estado } };
  if (c.estado === "vencida") throw new ErrorApi(409, "La cotización ya venció");
  const nombre = String(cuerpo.nombre ?? "").trim();
  if (!nombre) throw new ErrorApi(400, "Escribe el nombre de quien responde");
  if (cuerpo.accion !== "aceptar" && cuerpo.accion !== "rechazar") throw new ErrorApi(400, "acción inválida");
  almacen.mutar(() => {
    c.estado = cuerpo.accion === "aceptar" ? "aceptada" : "rechazada";
    c.respondidoPor = nombre;
    c.respondidoAt = ahora();
  });
  return { cotizacion: { estado: c.estado } };
});

// ─── Reservas en línea ────────────────────────────────────────────────────────────────────────
const cfgReservas = () => {
  const c = (almacen.datos.modulos.reservas_en_linea?.config ?? {}) as Record<string, any>;
  return { zona: "America/Mexico_City", anticipacionMin: num(c.anticipacionMin) || 120, ventanaDias: num(c.ventanaDias) || 30, granularidadMin: num(c.granularidadMin) || 30, maxPorTelefono: num(c.maxPorTelefono) || 3 };
};
const exigirReservas = () => {
  if (!almacen.datos.modulos.reservas_en_linea?.activo) throw new ErrorApi(404, "Este negocio no tiene reservas en línea");
};
const serviciosActivos = () => (almacen.datos.extra.serviciosReserva ?? []).filter((s) => s.activo);

ruta("GET", "/api/public/reservas/:slug", () => {
  exigirReservas();
  const d = almacen.datos;
  return {
    negocio: { nombre: d.marca.nombre, logo: d.marca.logo },
    zona: cfgReservas().zona,
    servicios: serviciosActivos().map((s) => ({
      id: s.id, nombre: s.nombre, descripcion: s.descripcion, duracionMin: s.duracionMin, precio: s.precio,
      doctores: (d.extra.doctores ?? []).filter((x) => x.activo && s.doctorIds.includes(x.id)).map((x) => ({ id: x.id, nombre: x.nombre })),
    })),
  };
});

/** Horarios libres (instantes ISO) de un doctor ese día. */
function horariosDeDoctor(cfg: ReturnType<typeof cfgReservas>, servicio: any, doctorId: string, fecha: string) {
  const d = almacen.datos;
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  const reglas = (d.extra.horariosDoctor ?? []).filter((h) => h.doctorId === doctorId && h.diaSemana === dia).map((h) => ({ inicioMin: h.inicioMin, finMin: h.finMin }));
  const excepciones = (d.extra.excepcionesHorario ?? []).filter((e) => e.doctorId === doctorId && e.fecha.slice(0, 10) === fecha).map((e) => ({ inicioMin: e.inicioMin, finMin: e.finMin }));
  const ventanas = excepciones.length ? excepciones.filter((e): e is { inicioMin: number; finMin: number } => e.inicioMin !== null && e.finMin !== null) : reglas;
  const ocupados: Ocupado[] = (d.extra.citas ?? []).filter((c) => c.doctorId === doctorId && ["programada", "confirmada", "en_sala", "completada"].includes(c.estado)).map((c) => ({ inicio: c.inicio, fin: c.fin }));
  return calcularHorarios({ fecha, zona: cfg.zona, ventanas, ocupados, duracionMin: servicio.duracionMin, bufferMin: servicio.bufferMin, granularidadMin: cfg.granularidadMin, anticipacionMin: cfg.anticipacionMin });
}

ruta("GET", "/api/public/reservas/:slug/horarios", ({ url }) => {
  exigirReservas();
  const cfg = cfgReservas();
  const q = url.searchParams;
  const servicio = serviciosActivos().find((s) => s.id === q.get("servicio"));
  if (!servicio) throw new ErrorApi(404, "Servicio no disponible");
  const doctor = q.get("doctor") ?? "cualquiera";
  if (doctor !== "cualquiera" && !servicio.doctorIds.includes(doctor)) throw new ErrorApi(400, "Especialista no disponible");
  const elegibles: string[] = doctor === "cualquiera" ? servicio.doctorIds : [doctor];
  const delDia = (fecha: string) => [...new Set(elegibles.flatMap((id) => horariosDeDoctor(cfg, servicio, id, fecha)))].sort();
  const hoy = fechaLocal(new Date(), cfg.zona);
  const ultimo = sumarDias(hoy, cfg.ventanaDias - 1);
  const fecha = q.get("fecha");
  if (fecha) {
    if (fecha < hoy || fecha > ultimo) throw new ErrorApi(400, "Fecha fuera de la agenda");
    return { horarios: delDia(fecha) };
  }
  const desde = q.get("desde") && q.get("desde")! > hoy ? q.get("desde")! : hoy;
  const dias: string[] = [];
  for (let i = 0; i < 14; i++) {
    const dia = sumarDias(desde, i);
    if (dia > ultimo) break;
    if (delDia(dia).length) dias.push(dia);
  }
  const siguiente = sumarDias(desde, 14);
  return { dias, siguiente: siguiente <= ultimo ? siguiente : null };
});

ruta("POST", "/api/public/reservas/:slug", ({ cuerpo }) => {
  exigirReservas();
  const d = almacen.datos;
  const cfg = cfgReservas();
  const servicio = serviciosActivos().find((s) => s.id === String(cuerpo.servicioId));
  if (!servicio) throw new ErrorApi(404, "Servicio no disponible");
  const nombre = String(cuerpo.nombre ?? "").trim();
  const telefono = telefonoMx(cuerpo.telefono);
  if (!nombre) throw new ErrorApi(400, "Escribe tu nombre");
  if (!telefono) throw new ErrorApi(400, "Escribe un WhatsApp de 10 dígitos");
  const elegibles: string[] = cuerpo.doctorId === "cualquiera" ? servicio.doctorIds : [String(cuerpo.doctorId)];
  const inicio = new Date(String(cuerpo.horario));
  const doctorId = elegibles.find((id) => horariosDeDoctor(cfg, servicio, id, String(cuerpo.fecha)).includes(inicio.toISOString()));
  if (Number.isNaN(+inicio) || !doctorId) throw new ErrorApi(409, "Ese horario ya no está disponible");
  const hoy = new Date();
  const delTelefono = (d.extra.citas ?? []).filter((c) => (d.contactos.find((x) => x.id === c.contactoId)?.telefono ?? "").endsWith(telefono) && c.origen === "publica" && new Date(c.createdAt ?? 0) > new Date(+hoy - 86_400_000)).length;
  if (delTelefono >= cfg.maxPorTelefono) throw new ErrorApi(429, "Ya agendaste el máximo de citas por día con este teléfono");
  let contacto = d.contactos.find((c) => (c.telefono ?? "").endsWith(telefono));
  const doctor = (d.extra.doctores ?? []).find((x) => x.id === doctorId) ?? null;
  const tokenGestion = token32();
  almacen.mutar(() => {
    if (!contacto) {
      contacto = { id: nuevoId(), nombre, telefono, email: null, empresa: null, notas: null, fuente: "reserva_en_linea", responsableId: null, optOutDifusion: false, esPersonal: false, esCliente: false, etiquetaIds: [], campos: {}, createdAt: ahora() };
      d.contactos.push(contacto);
    }
    (d.extra.citas ??= []).push({
      id: nuevoId(), contactoId: contacto.id, responsableId: null, doctorId, titulo: servicio.nombre, notas: String(cuerpo.notas ?? "").trim() || null,
      inicio: inicio.toISOString(), fin: new Date(+inicio + servicio.duracionMin * 60_000).toISOString(), estado: "programada", tokenGestion, origen: "publica", createdAt: ahora(),
    });
  });
  return new Respuesta(201, { token: tokenGestion, inicio: inicio.toISOString(), especialista: doctor?.nombre ?? null, servicio: servicio.nombre });
});

const citaPorToken = (token: string) => {
  const c = (almacen.datos.extra.citas ?? []).find((x) => x.tokenGestion === token);
  if (!c) throw new ErrorApi(404, "Cita no encontrada");
  return c;
};
ruta("GET", "/api/public/reservas/cita/:token", ({ params }) => {
  const c = citaPorToken(params.token);
  const doctor = (almacen.datos.extra.doctores ?? []).find((x) => x.id === c.doctorId);
  return { servicio: c.titulo, inicio: c.inicio, estado: c.estado, especialista: doctor?.nombre ?? null, zona: cfgReservas().zona };
});
ruta("POST", "/api/public/reservas/cita/:token", ({ params, cuerpo }) => {
  const c = citaPorToken(params.token);
  if (cuerpo.accion !== "cancelar") throw new ErrorApi(400, "acción inválida");
  if (!["programada", "confirmada"].includes(c.estado)) throw new ErrorApi(409, "Esta cita ya no se puede cancelar");
  almacen.mutar(() => void (c.estado = "cancelada"));
  return { ok: true };
});


// ─── Administración de reservas en línea (pantalla /reservas-en-linea) ───────────────────────────
const lista = (col: string) => (almacen.datos.extra[col] ??= []);
const doctorIdsDe = (v: unknown) => String(v ?? "").split(",").filter(Boolean);

ruta("PATCH", "/api/reservas/ajustes", ({ cuerpo }) => {
  exigirReservas();
  almacen.mutar((d) => {
    const c = d.modulos.reservas_en_linea.config as Record<string, unknown>;
    for (const k of ["anticipacionMin", "ventanaDias", "granularidadMin", "maxPorTelefono"]) if (k in cuerpo) c[k] = num(cuerpo[k]);
  });
  return { ok: true };
});

const servicioDesde = (cuerpo: any, base: any = {}) => {
  const nombre = String(cuerpo.nombre ?? base.nombre ?? "").trim();
  if (!nombre) throw new ErrorApi(400, "El nombre es obligatorio");
  const doctorIds = "doctorIds" in cuerpo ? doctorIdsDe(cuerpo.doctorIds) : base.doctorIds ?? [];
  if (!doctorIds.length) throw new ErrorApi(400, "Elige quién da el servicio");
  return {
    ...base, nombre, descripcion: String(cuerpo.descripcion ?? "").trim() || null, duracionMin: num(cuerpo.duracionMin) || 30, bufferMin: num(cuerpo.bufferMin),
    precio: num(cuerpo.precio), doctorIds, activo: "activo" in cuerpo ? String(cuerpo.activo) !== "false" : base.activo ?? true,
  };
};
ruta("POST", "/api/reservas/servicios", ({ cuerpo }) => {
  const s = { id: nuevoId(), ...servicioDesde(cuerpo) };
  almacen.mutar(() => void lista("serviciosReserva").push(s));
  return new Respuesta(201, { ok: true, id: s.id });
});
ruta("PATCH", "/api/reservas/servicios/:id", ({ params, cuerpo }) => {
  const s = lista("serviciosReserva").find((x) => x.id === params.id);
  if (!s) throw new ErrorApi(404, "servicio inexistente");
  const nuevo = servicioDesde(cuerpo, s);
  almacen.mutar(() => void Object.assign(s, nuevo));
  return { ok: true };
});
ruta("DELETE", "/api/reservas/servicios/:id", ({ params }) => {
  almacen.mutar((d) => void (d.extra.serviciosReserva = lista("serviciosReserva").filter((x) => x.id !== params.id)));
  return { ok: true };
});

ruta("POST", "/api/reservas/horarios", ({ cuerpo }) => {
  const inicioMin = minutosDeHora(cuerpo.inicio);
  const finMin = minutosDeHora(cuerpo.fin);
  if (!cuerpo.doctorId || inicioMin === null || finMin === null || finMin <= inicioMin) throw new ErrorApi(400, "Revisa el especialista y las horas");
  almacen.mutar(() => void lista("horariosDoctor").push({ id: nuevoId(), doctorId: String(cuerpo.doctorId), diaSemana: num(cuerpo.diaSemana), inicioMin, finMin }));
  return new Respuesta(201, { ok: true });
});
ruta("DELETE", "/api/reservas/horarios/:id", ({ params }) => {
  almacen.mutar((d) => void (d.extra.horariosDoctor = lista("horariosDoctor").filter((x) => x.id !== params.id)));
  return { ok: true };
});

ruta("POST", "/api/reservas/excepciones", ({ cuerpo }) => {
  if (!cuerpo.doctorId || !cuerpo.fecha) throw new ErrorApi(400, "Elige especialista y fecha");
  const inicioMin = cuerpo.inicio ? minutosDeHora(cuerpo.inicio) : null;
  const finMin = cuerpo.fin ? minutosDeHora(cuerpo.fin) : null;
  almacen.mutar(() => void lista("excepcionesHorario").push({ id: nuevoId(), doctorId: String(cuerpo.doctorId), fecha: new Date(`${cuerpo.fecha}T12:00:00-06:00`).toISOString(), inicioMin, finMin, motivo: String(cuerpo.motivo ?? "").trim() || null }));
  return new Respuesta(201, { ok: true });
});
ruta("DELETE", "/api/reservas/excepciones/:id", ({ params }) => {
  almacen.mutar((d) => void (d.extra.excepcionesHorario = lista("excepcionesHorario").filter((x) => x.id !== params.id)));
  return { ok: true };
});
