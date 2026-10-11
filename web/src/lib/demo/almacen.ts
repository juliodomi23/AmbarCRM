// Almacén en memoria de la demo: sustituye a la base de datos. Nada sale del navegador.
import { BRAND_PRESETS } from "@/lib/brand";
import { MODULOS } from "@/lib/modulos-catalogo";
import { GIRO_INICIAL, giroPorId } from "./giros";
import { PERFILES, type PerfilGiro } from "./perfiles";
import { sembrarExtra } from "./semilla-extra";
import type { Datos, GiroId } from "./tipos";

export { fechaMexico, hace } from "./fechas";
import { fechaMexico, hace } from "./fechas";

let secuencia = 1000;
/** Id nuevo (string numérico, como los BigInt serializados del CRM). */
export const nuevoId = () => String(++secuencia);

function vencimientoTarea(tipo: string, indice: number): string | null {
  if (tipo === "vencida") return fechaMexico(-(1 + (indice % 3)), 10);
  if (tipo === "hoy") return fechaMexico(0, 23);
  if (tipo === "proxima") return fechaMexico(1 + (indice % 5), 11);
  if (tipo === "completada") return fechaMexico(-1, 12);
  return null;
}

/** Construye todos los datos ficticios de un giro (mismo contenido que los seeds demo del CRM real). */
export function construirDatos(giroId: GiroId): Datos {
  const giro = giroPorId(giroId);
  const perfil: PerfilGiro = PERFILES[giro.id];
  secuencia = 1000;
  let n = 0;
  const id = () => String(++n);

  const usuarios = giro.usuarios.map((u, i) => ({
    id: String(i + 1),
    nombre: u.nombre,
    email: `${u.nombre.toLowerCase().normalize("NFD").replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@demo.test`,
    rol: u.rol ?? ("agente" as const),
    puesto: u.puesto,
    activo: true,
  }));
  const atendibles = usuarios.filter((u) => u.puesto !== "Cajero");
  const atiende = (i?: number) => atendibles[i ?? 0] ?? atendibles[0];

  const etiquetas = Object.entries(perfil.etiquetas).map(([nombre, color]) => ({ id: id(), nombre, color }));

  const contactos = perfil.contactos.map((c) => ({
    id: id(),
    nombre: c.nombre,
    telefono: c.telefono,
    email: null,
    empresa: null,
    notas: null,
    fuente: c.fuente ?? "whatsapp",
    responsableId: atiende(c.responsable).id,
    optOutDifusion: false,
    esPersonal: false,
    esCliente: false,
    etiquetaIds: (c.etiquetas ?? []).map((nombre) => etiquetas.find((e) => e.nombre === nombre)!.id),
    campos: {},
    createdAt: hace(60 * 24 * 20),
  }));

  // Embudo: las etapas del perfil + «Ganado»/«Perdido» si faltan (igual que el seed real).
  const embudo = { id: id(), nombre: perfil.embudo.nombre, orden: 1 };
  const etapas = perfil.embudo.etapas.map(([nombre, tipo, color], i) => ({
    id: id(),
    embudoId: embudo.id,
    nombre,
    color,
    tipo,
    orden: i + 1,
  }));
  for (const [tipo, nombre, color] of [
    ["ganado", "Ganado", "#16A34A"],
    ["perdido", "Perdido", "#DC2626"],
  ] as const) {
    if (!etapas.some((e) => e.tipo === tipo)) {
      etapas.push({ id: id(), embudoId: embudo.id, nombre, color, tipo, orden: etapas.length + 1 });
    }
  }
  const normales = etapas.filter((e) => e.tipo === "normal");
  const etapaPara = (ref: number | "ganado" | "perdido") =>
    ref === "ganado" || ref === "perdido" ? etapas.find((e) => e.tipo === ref)! : normales[ref % normales.length];

  const oportunidades = perfil.oportunidades.map(([ci, titulo, valor, ref, dias], i) => {
    const etapa = etapaPara(ref);
    const cerrada = etapa.tipo !== "normal";
    return {
      id: id(),
      titulo,
      valor,
      moneda: "MXN",
      embudoId: embudo.id,
      etapaId: etapa.id,
      contactoId: contactos[ci].id,
      responsableId: atiende(i).id,
      estado: etapa.tipo === "ganado" ? ("ganado" as const) : etapa.tipo === "perdido" ? ("perdido" as const) : ("abierto" as const),
      motivoPerdida: etapa.tipo === "perdido" ? "Eligió otra opción" : null,
      orden: i,
      createdAt: hace(60 * 24 * dias),
      closedAt: cerrada ? hace(60 * 24 * Math.max(1, dias - 1)) : null,
    };
  });

  const conversaciones: Datos["conversaciones"] = [];
  const mensajes: Datos["mensajes"] = [];
  perfil.conversaciones.forEach((c, i) => {
    const ultimo = Math.min(...c.mensajes.map(([, , min]) => min));
    const responsable = c.atiende === null ? null : atiende(c.atiende ?? i).id;
    const convId = id();
    conversaciones.push({
      id: convId,
      contactoId: contactos[c.contacto].id,
      canalId: null,
      responsableId: responsable,
      estado: c.estado ?? "abierta",
      botActivo: c.bot ?? true,
      fijadoAt: null,
      noLeidos: c.noLeidos ?? 0,
      ultimoMensajeAt: hace(ultimo),
      csatScore: c.csat ?? null,
    });
    for (const [tipo, contenido, minutos] of c.mensajes) {
      mensajes.push({
        id: id(),
        conversacionId: convId,
        direccion: tipo === "entrante" ? "entrante" : "saliente",
        tipo: "texto",
        contenido,
        mediaUrl: null,
        interna: tipo === "nota",
        status: tipo === "entrante" ? "entregado" : minutos === ultimo ? "entregado" : "leido",
        timestamp: hace(minutos),
      });
    }
  });

  const tareas = perfil.tareas.map(([titulo, tipo, oportunidadIndice, responsable], i) => ({
    id: id(),
    titulo,
    descripcion: null,
    venceAt: vencimientoTarea(tipo, i),
    completada: tipo === "completada",
    completadaAt: tipo === "completada" ? fechaMexico(-1, 15) : null,
    responsableId: atiende(responsable ?? i).id,
    oportunidadId: oportunidadIndice == null ? null : oportunidades[oportunidadIndice].id,
    createdAt: hace(60 * 24 * 3),
  }));

  const modulos: Datos["modulos"] = {};
  for (const m of MODULOS) modulos[m.clave] = { activo: false, config: {} };
  for (const [clave, config] of Object.entries(giro.modulos)) modulos[clave] = { activo: true, config: { ...config } };
  if (perfil.resenas) modulos.resenas = { activo: true, config: { enlaceGoogle: perfil.resenas.enlaceGoogle, diasEntreSolicitudes: 90 } };

  const preset = BRAND_PRESETS[giro.preset];
  const datos: Datos = {
    giro: giro.id,
    marca: { nombre: giro.marca, preset: giro.preset, logo: null, colorPrimario: preset.primario, colorAcento: preset.acento },
    usuarios,
    etiquetas,
    contactos,
    conversaciones,
    mensajes,
    programados: [],
    embudos: [embudo],
    etapas,
    oportunidades,
    tareas,
    plantillas: [
      { id: id(), nombre: "Saludo", contenido: "¡Hola! Gracias por escribirnos. ¿En qué te puedo ayudar?" },
      { id: id(), nombre: "Horario", contenido: "Atendemos de lunes a viernes de 9:00 a 18:00 y sábados de 9:00 a 14:00." },
      { id: id(), nombre: "Seguimiento", contenido: "Hola, ¿pudiste revisar la información que te compartimos? Quedo al pendiente." },
    ],
    camposPersonalizados: [],
    ajustes: {
      nombreNegocio: giro.marca, autoAsignar: false, bienvenidaActiva: false, bienvenidaTexto: "", crearLeadAuto: true, csatActivo: false, csatTexto: "",
      horarioActivo: false, horarioInicio: "09:00", horarioFin: "18:00", horarioDias: [1, 2, 3, 4, 5], fueraHorarioTexto: "", autoResolverActivo: false, autoResolverHoras: 48,
      iaPromptSistema: "",
    },
    modulos,
    resenas: (perfil.resenas?.filas ?? []).map(([calificacion, origen, dias], i) => ({
      calificacion,
      origen,
      createdAt: fechaMexico(-dias, 9 + (i % 9)),
    })),
    extra: {},
  };
  sembrarExtra(datos, giro.id, { id, atiende });
  secuencia = Math.max(secuencia, n + 1000);
  return datos;
}

// ─── Estado y suscripción ──────────────────────────────────────────────────────────────────────

let datos: Datos = construirDatos(GIRO_INICIAL);
let version = 0;
/** Qué partes de la marca cambió la persona a mano: esas sobreviven al cambio de giro. */
const personalizado = { nombre: false, color: false };
const oyentes = new Set<() => void>();
const eventos = new Set<(e: { conversacion_id: number; direccion: string }) => void>();

export const almacen = {
  get datos() {
    return datos;
  },
  get version() {
    return version;
  },
  suscribir(fn: () => void) {
    oyentes.add(fn);
    return () => void oyentes.delete(fn);
  },
  /** Avisa a las pantallas que el almacén cambió (equivale a router.refresh() contra el servidor). */
  notificar() {
    version++;
    oyentes.forEach((fn) => fn());
  },
  /** Cambia datos en el almacén y notifica. */
  mutar<T>(fn: (d: Datos) => T): T {
    const r = fn(datos);
    this.notificar();
    return r;
  },
  get personalizado() {
    return { ...personalizado };
  },
  /** Anota que la persona cambió a mano el nombre y/o el color de la marca. */
  marcarPersonalizado(cambios: Partial<typeof personalizado>) {
    Object.assign(personalizado, cambios);
  },
  /**
   * Cambia de giro (o vuelve a sembrar el mismo): los datos son los del giro, pero el nombre y el color
   * que la persona personalizó a mano se conservan; los que no, toman los del giro.
   */
  reiniciar(giro: GiroId) {
    const previa = datos.marca;
    datos = construirDatos(giro);
    if (personalizado.nombre) datos.marca.nombre = previa.nombre;
    if (personalizado.color) {
      Object.assign(datos.marca, { preset: previa.preset, colorPrimario: previa.colorPrimario, colorAcento: previa.colorAcento });
    }
    datos.marca.logo = previa.logo;
    this.notificar();
  },
  /** «Restablecer demo»: todo vuelve al giro inicial, sin personalización. */
  restablecer(giro: GiroId) {
    personalizado.nombre = false;
    personalizado.color = false;
    datos = construirDatos(giro);
    this.notificar();
  },
  /** Bus del «tiempo real» simulado: lo escucha EventSourceDemo. */
  emitir(e: { conversacion_id: number; direccion: string }) {
    eventos.forEach((fn) => fn(e));
  },
  escucharEventos(fn: (e: { conversacion_id: number; direccion: string }) => void) {
    eventos.add(fn);
    return () => void eventos.delete(fn);
  },
};
