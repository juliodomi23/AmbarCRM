// Endpoints de ventas en la API simulada: contactos, etiquetas, oportunidades (embudo) y tareas.
import { almacen, nuevoId } from "../almacen";
import { sesionDemo } from "../vistas";
import type { ContactoD } from "../tipos";
import { ErrorApi, ruta } from "./ruteo";

const contacto = (id: string): ContactoD => {
  const c = almacen.datos.contactos.find((x) => x.id === id);
  if (!c) throw new ErrorApi(404, "contacto inexistente");
  return c;
};
const o = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

// ─── Contactos ────────────────────────────────────────────────────────────────────────────────
ruta("POST", "/api/contactos", ({ cuerpo }) => {
  const d = almacen.datos;
  if (!cuerpo.nombre) throw new ErrorApi(400, "falta nombre");
  if (cuerpo.responsableId && !d.usuarios.some((u) => u.id === String(cuerpo.responsableId))) throw new ErrorApi(400, "responsable inexistente");
  const nuevo: ContactoD = {
    id: nuevoId(),
    nombre: String(cuerpo.nombre),
    telefono: o(cuerpo.telefono),
    email: o(cuerpo.email),
    empresa: o(cuerpo.empresa),
    notas: o(cuerpo.notas),
    fuente: o(cuerpo.fuente) ?? "manual",
    responsableId: cuerpo.responsableId ? String(cuerpo.responsableId) : null,
    optOutDifusion: false,
    esPersonal: false,
    esCliente: false,
    etiquetaIds: [],
    campos: cuerpo.campos ?? {},
    createdAt: new Date().toISOString(),
  };
  almacen.mutar(() => void d.contactos.push(nuevo));
  return { ok: true, id: nuevo.id };
});

ruta("PATCH", "/api/contactos/:id", ({ params, cuerpo }) => {
  const c = contacto(params.id);
  const d = almacen.datos;
  almacen.mutar(() => {
    for (const k of ["nombre", "telefono", "email", "empresa", "fuente", "notas"] as const) {
      if (k in cuerpo) (c as any)[k] = cuerpo[k] || null;
    }
    if ("responsableId" in cuerpo) {
      if (cuerpo.responsableId && !d.usuarios.some((u) => u.id === String(cuerpo.responsableId))) throw new ErrorApi(400, "responsable inexistente");
      c.responsableId = cuerpo.responsableId ? String(cuerpo.responsableId) : null;
    }
    if (typeof cuerpo.esPersonal === "boolean") c.esPersonal = cuerpo.esPersonal;
    if (typeof cuerpo.optOutDifusion === "boolean") c.optOutDifusion = cuerpo.optOutDifusion;
    if ("campos" in cuerpo) c.campos = cuerpo.campos ?? {};
  });
  return { ok: true };
});

ruta("DELETE", "/api/contactos/:id", ({ params }) => {
  contacto(params.id);
  almacen.mutar((d) => {
    const convs = new Set(d.conversaciones.filter((c) => c.contactoId === params.id).map((c) => c.id));
    d.contactos = d.contactos.filter((c) => c.id !== params.id);
    d.conversaciones = d.conversaciones.filter((c) => c.contactoId !== params.id);
    d.mensajes = d.mensajes.filter((m) => !convs.has(m.conversacionId));
    d.oportunidades = d.oportunidades.filter((x) => x.contactoId !== params.id);
  });
  return { ok: true };
});

ruta("POST", "/api/contactos/:id/etiquetas", ({ params, cuerpo }) => {
  const c = contacto(params.id);
  if (!cuerpo.etiquetaId) throw new ErrorApi(400, "falta etiquetaId");
  almacen.mutar(() => {
    if (!c.etiquetaIds.includes(String(cuerpo.etiquetaId))) c.etiquetaIds.push(String(cuerpo.etiquetaId));
  });
  return { ok: true };
});
ruta("DELETE", "/api/contactos/:id/etiquetas", ({ params, cuerpo }) => {
  const c = contacto(params.id);
  if (!cuerpo.etiquetaId) throw new ErrorApi(400, "falta etiquetaId");
  almacen.mutar(() => void (c.etiquetaIds = c.etiquetaIds.filter((e) => e !== String(cuerpo.etiquetaId))));
  return { ok: true };
});

ruta("POST", "/api/contactos/importar", ({ cuerpo }) => {
  const d = almacen.datos;
  const filas: string[] = String(cuerpo.csv ?? "").split(/\r?\n/).slice(1).filter(Boolean);
  let creados = 0;
  almacen.mutar(() => {
    for (const fila of filas) {
      const [nombre, telefono, email, empresa] = fila.split(",").map((x) => x.trim());
      if (!nombre) continue;
      d.contactos.push({
        id: nuevoId(), nombre, telefono: telefono || null, email: email || null, empresa: empresa || null, notas: null, fuente: "importado",
        responsableId: null, optOutDifusion: false, esPersonal: false, esCliente: false, etiquetaIds: [], campos: {}, createdAt: new Date().toISOString(),
      });
      creados++;
    }
  });
  return { ok: true, creados, actualizados: 0, omitidos: filas.length - creados, errores: [] };
});

// ─── Etiquetas ────────────────────────────────────────────────────────────────────────────────
ruta("POST", "/api/etiquetas", ({ cuerpo }) => {
  const nombre = o(cuerpo.nombre);
  if (!nombre) throw new ErrorApi(400, "falta nombre");
  const d = almacen.datos;
  if (d.etiquetas.some((e) => e.nombre.toLowerCase() === nombre.toLowerCase())) throw new ErrorApi(409, "ya existe una etiqueta con ese nombre");
  const etiqueta = { id: nuevoId(), nombre, color: o(cuerpo.color) ?? "#6366F1" };
  almacen.mutar(() => void d.etiquetas.push(etiqueta));
  return { ok: true, id: etiqueta.id, etiqueta };
});

ruta("GET", "/api/campos-personalizados", ({ url }) => {
  const entidad = url.searchParams.get("entidad");
  return { campos: almacen.datos.camposPersonalizados.filter((c) => !entidad || c.entidad === entidad) };
});

// ─── Oportunidades (embudo) ───────────────────────────────────────────────────────────────────
function tipoDeEtapa(etapaId: string) {
  const etapa = almacen.datos.etapas.find((e) => e.id === etapaId);
  if (!etapa) throw new ErrorApi(404, "etapa inexistente");
  return etapa;
}
const estadoDe = (tipo: string) => (tipo === "ganado" ? "ganado" : tipo === "perdido" ? "perdido" : "abierto");

ruta("POST", "/api/oportunidades", ({ cuerpo }) => {
  const d = almacen.datos;
  const { titulo, valor = 0, embudoId, etapaId, contactoId, contacto: nuevoContacto } = cuerpo;
  if (!titulo || !embudoId || !etapaId) throw new ErrorApi(400, "faltan campos");
  const etapa = tipoDeEtapa(String(etapaId));
  if (!d.embudos.some((e) => e.id === String(embudoId))) throw new ErrorApi(400, "embudo inexistente");
  let cId: string;
  if (contactoId) cId = contacto(String(contactoId)).id;
  else if (nuevoContacto?.nombre || nuevoContacto?.telefono) {
    const existente = nuevoContacto.telefono && d.contactos.find((c) => c.telefono === nuevoContacto.telefono);
    if (existente) cId = existente.id;
    else {
      cId = nuevoId();
      almacen.mutar(() =>
        void d.contactos.push({
          id: cId, nombre: nuevoContacto.nombre ?? nuevoContacto.telefono, telefono: o(nuevoContacto.telefono), email: null, empresa: null, notas: null, fuente: "manual",
          responsableId: sesionDemo(d).id, optOutDifusion: false, esPersonal: false, esCliente: false, etiquetaIds: [], campos: {}, createdAt: new Date().toISOString(),
        }),
      );
    }
  } else throw new ErrorApi(400, "falta contacto");
  const ultimo = Math.max(0, ...d.oportunidades.filter((x) => x.etapaId === etapa.id).map((x) => x.orden));
  const op = {
    id: nuevoId(), titulo: String(titulo), valor: Number(valor) || 0, moneda: "MXN", embudoId: String(embudoId), etapaId: etapa.id, contactoId: cId,
    responsableId: sesionDemo(d).id, estado: estadoDe(etapa.tipo) as "abierto" | "ganado" | "perdido", motivoPerdida: null, orden: ultimo + 10,
    createdAt: new Date().toISOString(), closedAt: etapa.tipo === "normal" ? null : new Date().toISOString(),
  };
  almacen.mutar(() => void d.oportunidades.push(op));
  return { ok: true, id: op.id };
});

ruta("PATCH", "/api/oportunidades/:id", ({ params, cuerpo }) => {
  const d = almacen.datos;
  const op = d.oportunidades.find((x) => x.id === params.id);
  if (!op) throw new ErrorApi(404, "oportunidad inexistente");
  almacen.mutar(() => {
    if ("titulo" in cuerpo) op.titulo = cuerpo.titulo;
    if ("valor" in cuerpo) op.valor = Number(cuerpo.valor) || 0;
    if ("motivoPerdida" in cuerpo) op.motivoPerdida = cuerpo.motivoPerdida || null;
    if ("responsableId" in cuerpo) op.responsableId = cuerpo.responsableId ? String(cuerpo.responsableId) : null;
    if (cuerpo.etapaId) {
      const etapa = tipoDeEtapa(String(cuerpo.etapaId));
      op.etapaId = etapa.id;
      op.embudoId = etapa.embudoId;
      op.estado = estadoDe(etapa.tipo) as typeof op.estado;
      op.closedAt = etapa.tipo === "normal" ? null : new Date().toISOString();
    }
  });
  return { ok: true };
});

ruta("DELETE", "/api/oportunidades/:id", ({ params }) => {
  almacen.mutar((d) => {
    d.oportunidades = d.oportunidades.filter((x) => x.id !== params.id);
    for (const t of d.tareas) if (t.oportunidadId === params.id) t.oportunidadId = null;
  });
  return { ok: true };
});

ruta("POST", "/api/oportunidades/mover", ({ cuerpo }) => {
  const d = almacen.datos;
  const { oportunidadId, etapaIdDestino, ordenIds } = cuerpo;
  if (!oportunidadId || !etapaIdDestino) throw new ErrorApi(400, "faltan campos");
  const etapa = tipoDeEtapa(String(etapaIdDestino));
  const op = d.oportunidades.find((x) => x.id === String(oportunidadId));
  if (!op) throw new ErrorApi(404, "oportunidad inexistente");
  almacen.mutar(() => {
    op.etapaId = etapa.id;
    op.estado = estadoDe(etapa.tipo) as typeof op.estado;
    op.closedAt = etapa.tipo === "normal" ? null : new Date().toISOString();
    (Array.isArray(ordenIds) ? ordenIds : []).forEach((id: unknown, i: number) => {
      const x = d.oportunidades.find((y) => y.id === String(id));
      if (x) x.orden = (i + 1) * 10;
    });
  });
  return { ok: true };
});

// ─── Tareas ───────────────────────────────────────────────────────────────────────────────────
ruta("POST", "/api/tareas", ({ cuerpo }) => {
  const d = almacen.datos;
  if (!cuerpo.titulo) throw new ErrorApi(400, "falta titulo");
  if (cuerpo.responsableId && !d.usuarios.some((u) => u.id === String(cuerpo.responsableId))) throw new ErrorApi(400, "responsableId inexistente");
  if (cuerpo.oportunidadId && !d.oportunidades.some((x) => x.id === String(cuerpo.oportunidadId))) throw new ErrorApi(400, "oportunidadId inexistente");
  const tarea = {
    id: nuevoId(), titulo: String(cuerpo.titulo), descripcion: o(cuerpo.descripcion), venceAt: cuerpo.venceAt ? new Date(cuerpo.venceAt).toISOString() : null,
    completada: false, completadaAt: null, responsableId: cuerpo.responsableId ? String(cuerpo.responsableId) : sesionDemo(d).id,
    oportunidadId: cuerpo.oportunidadId ? String(cuerpo.oportunidadId) : null, createdAt: new Date().toISOString(),
  };
  almacen.mutar(() => void d.tareas.push(tarea));
  return { ok: true, id: tarea.id };
});

ruta("PATCH", "/api/tareas/:id", ({ params, cuerpo }) => {
  const t = almacen.datos.tareas.find((x) => x.id === params.id);
  if (!t) throw new ErrorApi(404, "tarea inexistente");
  almacen.mutar(() => {
    if ("completada" in cuerpo) {
      t.completada = !!cuerpo.completada;
      t.completadaAt = cuerpo.completada ? new Date().toISOString() : null;
    }
    if ("titulo" in cuerpo) t.titulo = cuerpo.titulo;
    if ("descripcion" in cuerpo) t.descripcion = cuerpo.descripcion || null;
    if ("venceAt" in cuerpo) t.venceAt = cuerpo.venceAt ? new Date(cuerpo.venceAt).toISOString() : null;
  });
  return { ok: true };
});

ruta("DELETE", "/api/tareas/:id", ({ params }) => {
  almacen.mutar((d) => void (d.tareas = d.tareas.filter((x) => x.id !== params.id)));
  return { ok: true };
});
