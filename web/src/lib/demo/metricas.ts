// Métricas de Inicio calculadas del almacén (misma salida que getMetricasDashboard / getPrimerosPasos).
import type { Datos } from "./tipos";

export function primerosPasos(d: Datos) {
  return {
    whatsapp: false, // la demo no conecta ningún canal de WhatsApp
    embudo: d.embudos.length > 0,
    equipo: d.usuarios.filter((u) => u.activo).length > 1,
    contacto: d.contactos.length > 0,
  };
}

export function metricasDashboard(d: Datos) {
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
  const finHoy = new Date();
  finHoy.setHours(23, 59, 59, 999);
  const haceCatorceDias = new Date();
  haceCatorceDias.setDate(haceCatorceDias.getDate() - 13);
  haceCatorceDias.setHours(0, 0, 0, 0);

  const abiertas = d.oportunidades.filter((o) => o.estado === "abierto");
  const ganadas = d.oportunidades.filter((o) => o.estado === "ganado" && o.closedAt && o.closedAt >= inicioMes);
  const perdidas = d.oportunidades.filter((o) => o.estado === "perdido" && o.closedAt && o.closedAt >= inicioMes);
  const suma = (l: { valor: number }[]) => l.reduce((s, o) => s + o.valor, 0);

  const embudo = d.embudos.slice().sort((a, b) => a.orden - b.orden)[0];
  const porEtapa = embudo
    ? d.etapas
        .filter((e) => e.embudoId === embudo.id)
        .sort((a, b) => a.orden - b.orden)
        .map((e) => {
          const ops = abiertas.filter((o) => o.etapaId === e.id);
          return { nombre: e.nombre, color: e.color, valor: suma(ops), count: ops.length };
        })
    : [];

  const ranking = Object.values(
    ganadas.reduce<Record<string, { nombre: string; count: number; valor: number }>>((acc, o) => {
      const clave = o.responsableId ?? "sin";
      const nombre = o.responsableId ? (d.usuarios.find((u) => u.id === o.responsableId)?.nombre ?? "—") : "Sin asignar";
      (acc[clave] ??= { nombre, count: 0, valor: 0 }).count++;
      acc[clave].valor += o.valor;
      return acc;
    }, {}),
  ).sort((a, b) => b.valor - a.valor);

  const calificadas = d.conversaciones.filter((c) => c.csatScore != null);
  const csatPromedio = calificadas.length
    ? Math.round((calificadas.reduce((s, c) => s + (c.csatScore ?? 0), 0) / calificadas.length) * 10) / 10
    : null;

  // Primera respuesta humana: del primer entrante al primer saliente no interno (mediana, minutos).
  const tiempos: number[] = [];
  for (const c of d.conversaciones) {
    const ms = d.mensajes.filter((m) => m.conversacionId === c.id).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const entrante = ms.find((m) => m.direccion === "entrante");
    const respuesta = entrante && ms.find((m) => m.direccion === "saliente" && !m.interna && m.timestamp >= entrante.timestamp);
    if (entrante && respuesta) tiempos.push((new Date(respuesta.timestamp).getTime() - new Date(entrante.timestamp).getTime()) / 60000);
  }
  tiempos.sort((a, b) => a - b);

  // Serie de conversaciones por día (se reparte según el primer mensaje de cada una).
  const serieConversaciones = Array.from({ length: 14 }, (_, i) => {
    const dia = new Date(haceCatorceDias);
    dia.setDate(dia.getDate() + i);
    const clave = dia.toISOString().slice(0, 10);
    return d.conversaciones.filter((c) => {
      const primero = d.mensajes.filter((m) => m.conversacionId === c.id).sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0];
      return primero?.timestamp.slice(0, 10) === clave;
    }).length;
  });
  const anterior = serieConversaciones.slice(0, 7).reduce((a, b) => a + b, 0);
  const actual = serieConversaciones.slice(7).reduce((a, b) => a + b, 0);

  return {
    pipelineValor: suma(abiertas),
    pipelineCount: abiertas.length,
    ganadasCount: ganadas.length,
    ganadasValor: suma(ganadas),
    perdidasCount: perdidas.length,
    conversion: ganadas.length + perdidas.length > 0 ? Math.round((ganadas.length / (ganadas.length + perdidas.length)) * 100) : 0,
    leadsMes: d.contactos.filter((c) => c.createdAt >= inicioMes).length,
    convAbiertas: d.conversaciones.filter((c) => c.estado === "abierta").length,
    sinResponder: d.conversaciones.filter((c) => c.estado !== "cerrada" && c.noLeidos > 0).length,
    serieConversaciones,
    tendenciaConversaciones: anterior ? Math.round(((actual - anterior) / anterior) * 100) : null,
    embudoNombre: embudo?.nombre ?? null,
    porEtapa,
    ranking,
    csatPromedio,
    csatRespuestas: calificadas.length,
    primeraRespuestaMin: tiempos.length ? Math.round(tiempos[Math.floor(tiempos.length / 2)]) : null,
    primeraRespuestaMuestras: tiempos.length,
  };
}
