// Endpoints de reseñas, lealtad (Aurum simulado), difusión (simulada) y personal en la API simulada.
import { almacen } from "../almacen";
import { ErrorApi, Respuesta, ruta } from "./ruteo";

const num = (v: unknown) => Number(v) || 0;

// ─── Reseñas ──────────────────────────────────────────────────────────────────────────────────
ruta("PATCH", "/api/resenas/ajustes", ({ cuerpo }) => {
  const enlace = String(cuerpo.enlaceGoogle ?? "").trim();
  if (enlace && !/^https:\/\//.test(enlace)) throw new ErrorApi(400, "El enlace debe empezar con https://");
  const dias = num(cuerpo.diasEntreSolicitudes);
  if (dias < 1 || dias > 365) throw new ErrorApi(400, "Los días entre solicitudes deben estar entre 1 y 365");
  almacen.mutar((d) => {
    const c = d.modulos.resenas.config as Record<string, unknown>;
    c.enlaceGoogle = enlace || undefined;
    c.diasEntreSolicitudes = dias;
    c.plantillaResena = cuerpo.plantillaNombre ? { name: cuerpo.plantillaNombre, language: cuerpo.plantillaIdioma || "es_MX" } : undefined;
  });
  return { ok: true };
});

// ─── Lealtad (Aurum simulado: no hay conexión real) ───────────────────────────────────────────
const SELLOS_POR_PREMIO = 8;
const tarjetas = () => (almacen.datos.extra.lealtad ??= []);

ruta("GET", "/api/lealtad/contacto/:id", ({ params }) => {
  const d = almacen.datos;
  if (!d.modulos.lealtad?.activo) throw new ErrorApi(404, "módulo no activo");
  const t = tarjetas().find((x) => x.contactoId === params.id);
  const c = d.contactos.find((x) => x.id === params.id);
  return {
    conectado: true,
    tarjeta: t && c ? { nombre: c.nombre, sellos: t.sellos, premiosGanados: t.premiosGanados, premiosPendientes: t.premiosPendientes } : null,
    ligaAlta: "https://aurum.demo/alta/demo-aurum",
  };
});

ruta("POST", "/api/lealtad/contacto/:id", ({ params, cuerpo }) => {
  const t = tarjetas().find((x) => x.contactoId === params.id);
  if (!t) throw new ErrorApi(404, "El contacto aún no tiene tarjeta");
  if (cuerpo.accion === "canjear") {
    if (t.premiosPendientes < 1) throw new ErrorApi(409, "No hay premios por canjear");
    almacen.mutar(() => void (t.premiosPendientes -= 1));
    return { ok: true };
  }
  if (cuerpo.accion !== "sellar") throw new ErrorApi(400, "acción inválida");
  const premiosNuevos: string[] = [];
  almacen.mutar(() => {
    t.sellos += 1;
    if (t.sellos % SELLOS_POR_PREMIO === 0) {
      t.premiosGanados += 1;
      t.premiosPendientes += 1;
      premiosNuevos.push("Premio de lealtad");
    }
  });
  return { ok: true, premiosNuevos };
});

// ─── Difusión: se simula el envío; nunca sale un mensaje ──────────────────────────────────────
const LIMITE_DIARIO = 50;
const estadoDifusion = () => (almacen.datos.extra.difusion ??= [{ yaEnviados: 0, pendientes: 0 }])[0];

ruta("GET", "/api/difusion", ({ url }) => {
  if (url.searchParams.get("plantillas") === "oficiales") return { plantillas: [] };
  const e = estadoDifusion();
  // Cada consulta «envía» lo que estaba en cola (el CRM real lo hace en segundo plano).
  if (e.pendientes > 0) almacen.mutar(() => void ((e.yaEnviados += e.pendientes), (e.pendientes = 0)));
  return { yaEnviados: e.yaEnviados, restantes: Math.max(0, LIMITE_DIARIO - e.yaEnviados), limiteDiario: LIMITE_DIARIO };
});

ruta("POST", "/api/difusion", ({ cuerpo }) => {
  const d = almacen.datos;
  const e = estadoDifusion();
  const etiqueta = d.etiquetas.find((x) => x.id === String(cuerpo.etiquetaId));
  if (!etiqueta) throw new ErrorApi(400, "Elige una etiqueta");
  if (!String(cuerpo.texto ?? "").trim() && !cuerpo.metaTemplate) throw new ErrorApi(400, "Escribe el mensaje");
  const destinatarios = d.contactos.filter((c) => c.etiquetaIds.includes(etiqueta.id) && !c.optOutDifusion && !c.esPersonal && c.telefono);
  const restantes = Math.max(0, LIMITE_DIARIO - e.yaEnviados - e.pendientes);
  if (restantes === 0) return new Respuesta(429, { error: `Límite diario alcanzado (${LIMITE_DIARIO} mensajes). Vuelve mañana para proteger el número de baneo.` });
  const encolados = Math.min(destinatarios.length, restantes);
  almacen.mutar(() => void (e.pendientes += encolados));
  return { ok: true, encolados, omitidos: destinatarios.length - encolados, yaEnviadosHoy: e.yaEnviados };
});

// ─── Personal ─────────────────────────────────────────────────────────────────────────────────
ruta("GET", "/api/personal", () => {
  const d = almacen.datos;
  const ultimo = (id: string) => d.mensajes.filter((m) => m.conversacionId === id).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  return {
    personal: d.conversaciones
      .filter((c) => d.contactos.find((x) => x.id === c.contactoId)?.esPersonal)
      .sort((a, b) => (b.ultimoMensajeAt ?? "").localeCompare(a.ultimoMensajeAt ?? ""))
      .map((c) => {
        const contacto = d.contactos.find((x) => x.id === c.contactoId)!;
        const m = ultimo(c.id);
        return { id: c.id, contactoId: contacto.id, nombre: contacto.nombre, telefono: contacto.telefono, noLeidos: c.noLeidos, ultimoMensajeAt: c.ultimoMensajeAt, preview: m?.contenido ?? (m ? "[archivo]" : "") };
      }),
  };
});
