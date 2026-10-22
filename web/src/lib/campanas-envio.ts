import { db } from "@/lib/db";
import { telefonoMx } from "@/lib/reservas/telefono";

export type MapeoColumnas = { telefono: number; nombre?: number; empresa?: number; giro?: number };
export type FilaCampana = { numeroFila: number; telefono: string; nombre: string; empresa: string; giro: string; variables: Record<string, string>; contactoId?: bigint };
export type FilaRechazada = { numeroFila: number; fila: string[]; motivo: string };

export function reanudarCampana(id: bigint) {
  return db.campanaEnvio.update({ where: { id }, data: { estado: "programada", motivoPausa: null, fallosConsultaMeta: 0 } });
}

export function datosParaCompletarContacto(contacto: { nombre: string; empresa: string | null; telefono: string | null }, fila: { nombre: string; empresa: string }) {
  return {
    ...(fila.nombre && (!contacto.nombre.trim() || contacto.nombre === contacto.telefono) ? { nombre: fila.nombre } : {}),
    ...(fila.empresa && !contacto.empresa?.trim() ? { empresa: fila.empresa } : {}),
  };
}

export function esBajaCampana(tipo: string, contenido?: string) {
  if (tipo !== "texto") return false;
  const texto = (contenido ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return texto.length <= 30 && ["BAJA", "STOP", "NO GRACIAS", "NO ME ESCRIBAN", "CANCELAR"].includes(texto);
}

export function validarCalendario(entrada: Record<string, unknown>) {
  const diasSemana = entrada.diasSemana ?? [1, 2, 3, 4, 5];
  const horaInicio = String(entrada.horaInicio ?? "09:30");
  const horaFin = String(entrada.horaFin ?? "17:30");
  const zonaHoraria = String(entrada.zonaHoraria ?? "America/Mexico_City");
  const tandaTamano = Number(entrada.tandaTamano ?? 5);
  const pausaTandaMin = Number(entrada.pausaTandaMin ?? 10);
  const topeDiario = Number(entrada.topeDiario ?? 50);
  const fechaInicio = entrada.fechaInicio ? new Date(String(entrada.fechaInicio)) : new Date();
  if (!Array.isArray(diasSemana) || !diasSemana.length || diasSemana.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error("Selecciona días válidos (0 a 6)");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(horaInicio) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(horaFin) || horaInicio >= horaFin) throw new Error("La ventana horaria no es válida");
  try { new Intl.DateTimeFormat("es-MX", { timeZone: zonaHoraria }).format(new Date()); } catch { throw new Error("La zona horaria no es válida"); }
  if (!Number.isInteger(tandaTamano) || tandaTamano < 1 || tandaTamano > 20) throw new Error("La tanda debe tener de 1 a 20 mensajes");
  if (!Number.isInteger(pausaTandaMin) || pausaTandaMin < 5) throw new Error("La pausa debe ser de al menos 5 minutos");
  if (!Number.isInteger(topeDiario) || topeDiario < 1 || topeDiario > 150) throw new Error("El tope diario debe ser de 1 a 150");
  if (Number.isNaN(fechaInicio.getTime())) throw new Error("La fecha de inicio no es válida");
  return { diasSemana: [...new Set(diasSemana as number[])], horaInicio, horaFin, zonaHoraria, tandaTamano, pausaTandaMin, topeDiario, fechaInicio };
}

export function horarioPermitido(campana: { diasSemana: number[]; horaInicio: string; horaFin: string; zonaHoraria: string; fechaInicio: Date; ultimaTandaAt: Date | null; pausaTandaMin: number }, ahora = new Date()) {
  if (ahora < campana.fechaInicio) return false;
  if (campana.ultimaTandaAt && ahora.getTime() - campana.ultimaTandaAt.getTime() < campana.pausaTandaMin * 60_000) return false;
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: campana.zonaHoraria, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ahora);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(valor("weekday"));
  const hora = `${valor("hour")}:${valor("minute")}`;
  return campana.diasSemana.includes(dia) && hora >= campana.horaInicio && hora <= campana.horaFin;
}

export function horasDeTanda(campana: { horaInicio: string; horaFin: string; pausaTandaMin: number; tandaTamano: number; topeDiario: number }) {
  const a = Number(campana.horaInicio.slice(0, 2)) * 60 + Number(campana.horaInicio.slice(3));
  const b = Number(campana.horaFin.slice(0, 2)) * 60 + Number(campana.horaFin.slice(3));
  return Math.max(1, Math.min(campana.topeDiario, (Math.floor((b - a) / campana.pausaTandaMin) + 1) * campana.tandaTamano));
}

export async function validarFilasCampana(filas: unknown, mapeo: MapeoColumnas, mapeoVariables: string[] = []) {
  if (!Array.isArray(filas) || filas.length < 2 || filas.length > 10_001 || filas.some((f) => !Array.isArray(f))) throw new Error("El archivo debe contener entre 1 y 10,000 filas de datos");
  if (Buffer.byteLength(JSON.stringify(filas), "utf8") > 5 * 1024 * 1024) throw new Error("El archivo supera 5 MB");
  const headers = (filas[0] as unknown[]).map((x) => String(x ?? "").trim());
  if (!headers.length || !Number.isInteger(mapeo?.telefono) || mapeo.telefono < 0 || mapeo.telefono >= headers.length) throw new Error("Mapea la columna de teléfono");
  for (const idx of [mapeo.nombre, mapeo.empresa, mapeo.giro]) if (idx !== undefined && (!Number.isInteger(idx) || idx < 0 || idx >= headers.length)) throw new Error("Mapeo de columnas inválido");
  const columnasVariables = mapeoVariables.filter((v) => !["{{nombre}}", "{{nombre_completo}}", "{{telefono}}"].includes(v));
  if (columnasVariables.some((v) => !headers.includes(v))) throw new Error("Una variable no corresponde a una columna del archivo");
  const valores = (filas as unknown[][]).slice(1).map((fila) => fila.map((x) => String(x ?? "").trim()));
  const telefonos = valores.map((fila) => telefonoMx(fila[mapeo.telefono]) ? `52${telefonoMx(fila[mapeo.telefono])}` : null);
  const candidatos = [...new Set(telefonos.filter((t): t is string => Boolean(t)))];
  const variantes = candidatos.flatMap((t) => [t, `521${t.slice(2)}`]);
  const contactos = await db.contacto.findMany({ where: { telefono: { in: variantes } }, select: { id: true, telefono: true, optOutDifusion: true } });
  const porTelefono = new Map(contactos.map((c) => [c.telefono?.slice(-10), c]));
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const recientes = await db.campanaDestinatario.findMany({ where: { telefono: { in: candidatos }, enviadoAt: { gte: desde }, estado: { in: ["enviado", "entregado", "leido", "respondio"] } }, select: { telefono: true } });
  const contactados = new Set(recientes.map((r) => r.telefono));
  const aceptadas: FilaCampana[] = [];
  const rechazadas: FilaRechazada[] = [];
  const vistas = new Set<string>();
  const conteos = { validos: 0, duplicados: 0, invalidos: 0, existentes: 0, optOut: 0, recientes: 0 };
  valores.forEach((fila, i) => {
    const telefono = telefonos[i];
    const existente = telefono ? porTelefono.get(telefono.slice(-10)) : undefined;
    let motivo = "";
    if (!telefono) { motivo = "Teléfono MX inválido"; conteos.invalidos++; }
    else if (vistas.has(telefono)) { motivo = "Duplicado en el archivo"; conteos.duplicados++; }
    else if (existente?.optOutDifusion) { motivo = "Baja de difusión"; conteos.optOut++; }
    else if (contactados.has(telefono)) { motivo = "Contactado por otra campaña en los últimos 30 días"; conteos.recientes++; }
    else {
      const vacia = columnasVariables.find((columna) => !fila[headers.indexOf(columna)]?.trim());
      if (vacia) motivo = `Variable vacía: ${vacia}`;
    }
    if (telefono) vistas.add(telefono);
    if (existente) conteos.existentes++;
    if (motivo) { rechazadas.push({ numeroFila: i + 2, fila, motivo }); return; }
    conteos.validos++;
    aceptadas.push({ numeroFila: i + 2, telefono: telefono!, nombre: mapeo.nombre === undefined ? "" : fila[mapeo.nombre] ?? "", empresa: mapeo.empresa === undefined ? "" : fila[mapeo.empresa] ?? "", giro: mapeo.giro === undefined ? "" : fila[mapeo.giro] ?? "", variables: Object.fromEntries(headers.map((h, j) => [h, fila[j] ?? ""])), contactoId: existente?.id });
  });
  return { headers, conteos, aceptadas, rechazadas, muestra: valores.slice(0, 20).map((fila, i) => ({ numeroFila: i + 2, fila, motivo: rechazadas.find((r) => r.numeroFila === i + 2)?.motivo ?? null })) };
}
