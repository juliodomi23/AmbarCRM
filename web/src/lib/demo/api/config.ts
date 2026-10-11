// Endpoints de Configuración en la API simulada: marca, módulos, embudos, usuarios, plantillas y ajustes.
import { BRAND_PRESETS } from "@/lib/brand";
import { moduloPorClave } from "@/lib/modulos-catalogo";
import { almacen, nuevoId } from "../almacen";
import { ErrorApi, ruta } from "./ruteo";

ruta("PATCH", "/api/ajustes", ({ cuerpo }) => {
  almacen.mutar((d) => {
    const m = d.marca;
    if ("marcaNombre" in cuerpo) m.nombre = String(cuerpo.marcaNombre ?? "").trim().slice(0, 80) || m.nombre;
    if ("marcaLogo" in cuerpo) m.logo = cuerpo.marcaLogo || null;
    if (/^#[0-9a-f]{6}$/i.test(cuerpo.marcaColorPrimario ?? "")) m.colorPrimario = cuerpo.marcaColorPrimario;
    if (/^#[0-9a-f]{6}$/i.test(cuerpo.marcaColorAcento ?? "")) m.colorAcento = cuerpo.marcaColorAcento;
    if (cuerpo.marcaPreset && cuerpo.marcaPreset in BRAND_PRESETS) m.preset = cuerpo.marcaPreset;
    for (const [k, v] of Object.entries(cuerpo)) if (!k.startsWith("marca")) d.ajustes[k] = v;
  });
  return { ok: true };
});

ruta("PATCH", "/api/modulos", ({ cuerpo }) => {
  const d = almacen.datos;
  const catalogo = moduloPorClave(String(cuerpo.clave));
  if (!catalogo || !cuerpo.config || typeof cuerpo.config !== "object" || Array.isArray(cuerpo.config)) throw new ErrorApi(400, "configuración inválida");
  const modulo = d.modulos[catalogo.clave];
  if (!modulo?.activo) throw new ErrorApi(404, "módulo no activo");
  almacen.mutar(() => void (modulo.config = { ...modulo.config, ...cuerpo.config }));
  return { ok: true };
});

ruta("POST", "/api/embudos", ({ cuerpo }) => {
  const nombre = String(cuerpo.nombre ?? "").trim();
  if (!nombre) throw new ErrorApi(400, "falta nombre");
  almacen.mutar((d) => void d.embudos.push({ id: nuevoId(), nombre, orden: d.embudos.length + 1 }));
  return { ok: true };
});
ruta("DELETE", "/api/embudos/:id", ({ params }) => {
  const d = almacen.datos;
  if (d.embudos.length <= 1) throw new ErrorApi(409, "Debe quedar al menos un embudo");
  almacen.mutar(() => {
    d.embudos = d.embudos.filter((e) => e.id !== params.id);
    d.etapas = d.etapas.filter((e) => e.embudoId !== params.id);
    d.oportunidades = d.oportunidades.filter((o) => o.embudoId !== params.id);
  });
  return { ok: true };
});
ruta("POST", "/api/etapas", ({ cuerpo }) => {
  const d = almacen.datos;
  const nombre = String(cuerpo.nombre ?? "").trim();
  if (!nombre || !d.embudos.some((e) => e.id === String(cuerpo.embudoId))) throw new ErrorApi(400, "faltan campos");
  const tipo = ["normal", "ganado", "perdido"].includes(cuerpo.tipo) ? cuerpo.tipo : "normal";
  const orden = Math.max(0, ...d.etapas.filter((e) => e.embudoId === String(cuerpo.embudoId)).map((e) => e.orden)) + 1;
  almacen.mutar(() => void d.etapas.push({ id: nuevoId(), embudoId: String(cuerpo.embudoId), nombre, color: cuerpo.color ?? "#94A3B8", tipo, orden }));
  return { ok: true };
});
ruta("DELETE", "/api/etapas/:id", ({ params }) => {
  const d = almacen.datos;
  if (d.oportunidades.some((o) => o.etapaId === params.id)) throw new ErrorApi(409, "La etapa tiene oportunidades: muévelas antes de quitarla");
  almacen.mutar(() => void (d.etapas = d.etapas.filter((e) => e.id !== params.id)));
  return { ok: true };
});

ruta("POST", "/api/usuarios", ({ cuerpo }) => {
  const d = almacen.datos;
  if (!cuerpo.nombre || !cuerpo.email) throw new ErrorApi(400, "faltan campos");
  if (d.usuarios.some((u) => u.email === cuerpo.email)) throw new ErrorApi(409, "Ya existe un usuario con ese correo");
  almacen.mutar(() => void d.usuarios.push({ id: nuevoId(), nombre: cuerpo.nombre, email: cuerpo.email, rol: cuerpo.rol === "admin" ? "admin" : "agente", puesto: cuerpo.puesto || "Agente", activo: true }));
  return { ok: true };
});
ruta("PATCH", "/api/usuarios/:id", ({ params, cuerpo }) => {
  const u = almacen.datos.usuarios.find((x) => x.id === params.id);
  if (!u) throw new ErrorApi(404, "usuario inexistente");
  if (params.id === almacen.datos.usuarios[0].id && cuerpo.activo === false) throw new ErrorApi(409, "No puedes desactivarte a ti mismo");
  almacen.mutar(() => {
    if (typeof cuerpo.activo === "boolean") u.activo = cuerpo.activo;
    if (cuerpo.puesto) u.puesto = String(cuerpo.puesto);
    if (cuerpo.rol === "admin" || cuerpo.rol === "agente") u.rol = cuerpo.rol;
  });
  return { ok: true };
});

ruta("POST", "/api/plantillas", ({ cuerpo }) => {
  if (!cuerpo.nombre || !cuerpo.contenido) throw new ErrorApi(400, "faltan campos");
  almacen.mutar((d) => void d.plantillas.push({ id: nuevoId(), nombre: String(cuerpo.nombre), contenido: String(cuerpo.contenido) }));
  return { ok: true };
});
ruta("DELETE", "/api/plantillas/:id", ({ params }) => {
  almacen.mutar((d) => void (d.plantillas = d.plantillas.filter((p) => p.id !== params.id)));
  return { ok: true };
});

ruta("GET", "/api/campos-personalizados", ({ url }) => {
  const entidad = url.searchParams.get("entidad");
  return { campos: almacen.datos.camposPersonalizados.filter((c) => !entidad || c.entidad === entidad) };
});
