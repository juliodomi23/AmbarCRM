export type ReporteServidor = { fecha: Date; ramPct: number | null; discoPct: number | null; cpuPct?: number };
export type EstadoServidor = "verde" | "amarillo" | "rojo" | "sin-datos";

export function estadoServidor(reporte: ReporteServidor | null, ahora = new Date()): { estado: EstadoServidor; motivo: string } {
  if (!reporte) return { estado: "sin-datos", motivo: "Sin datos · esperando el primer reporte" };
  const horas = (ahora.getTime() - reporte.fecha.getTime()) / 3600000;
  if (horas > 3) return { estado: "rojo", motivo: `Sin reportar hace ${Math.floor(horas)} h` };
  if (reporte.ramPct === null || reporte.discoPct === null) return { estado: "sin-datos", motivo: "Sin métricas disponibles" };
  const peor = Math.max(reporte.ramPct, reporte.discoPct);
  const motivo = reporte.ramPct >= reporte.discoPct ? `RAM ${reporte.ramPct.toFixed(0)} %` : `Disco ${reporte.discoPct.toFixed(0)} %`;
  return { estado: peor >= 90 ? "rojo" : peor >= 80 ? "amarillo" : "verde", motivo };
}

export function diasParaVencer(fecha: Date | null, hoy: string): number | null {
  return fecha ? Math.round((Date.parse(fecha.toISOString().slice(0, 10)) - Date.parse(hoy)) / 86400000) : null;
}

export function validarHeartbeat(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RangeError("Reporte inválido");
  const datos = body as Record<string, unknown>;
  function numero(clave: string, maximo = Number.MAX_SAFE_INTEGER, opcional = false) {
    const valor = datos[clave] === undefined && opcional ? 0 : datos[clave];
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > maximo) throw new RangeError(`Métrica inválida: ${clave}`);
    return valor;
  }
  const ramTotalMb = numero("ram_total_mb", 2147483647, true);
  if (!Number.isInteger(ramTotalMb)) throw new RangeError("RAM total inválida");
  return { ramPct: numero("ram_pct", 100), cpuPct: numero("cpu_pct", 100), discoPct: numero("disco_pct", 100), ramTotalMb, uptimeHoras: numero("uptime_horas", Number.MAX_SAFE_INTEGER, true) };
}

export type AlertaAR = { nivel: "rojo" | "amarillo"; tipo: "servidor" | "vencimiento" | "cobro"; texto: string; donde: string };

export function alertasDeServidor(servidor: { nombre: string; activo: boolean; loPagamos: boolean; vence: Date | null }, reporte: ReporteServidor | null, hoy: string, ahora = new Date()): AlertaAR[] {
  if (!servidor.activo) return [];
  const lista: AlertaAR[] = [];
  const salud = estadoServidor(reporte, ahora);
  if (salud.estado === "rojo" || salud.estado === "amarillo") lista.push({ nivel: salud.estado, tipo: "servidor", texto: `${servidor.nombre}: ${salud.motivo}`, donde: "/servidores" });
  const dias = diasParaVencer(servidor.vence, hoy);
  if (servidor.loPagamos && dias !== null && dias <= 30) lista.push({ nivel: dias <= 7 ? "rojo" : "amarillo", tipo: "vencimiento", texto: `${servidor.nombre}: ${dias < 0 ? `venció hace ${-dias} días` : `vence en ${dias} días`}`, donde: "/servidores" });
  return lista;
}

export function resumenAlertas(lista: AlertaAR[], hoy: string, ahora = new Date()) {
  const ordenadas = [...lista].sort((a, b) => Number(b.nivel === "rojo") - Number(a.nivel === "rojo") || a.tipo.localeCompare(b.tipo));
  const cabecera = `Ámbar Rojo · ${hoy.slice(8, 10)}/${hoy.slice(5, 7)}`;
  const texto = ordenadas.length ? cabecera + ["rojo", "amarillo"].map(nivel => {
    const grupo = ordenadas.filter(a => a.nivel === nivel);
    return grupo.length ? "\n\n" + grupo.map(a => `${nivel === "rojo" ? "🔴" : "🟡"} ${a.texto}`).join("\n") : "";
  }).join("") : `${cabecera}\nNada en rojo hoy. 🟢`;
  return { generado: ahora, rojas: ordenadas.filter(a => a.nivel === "rojo").length, amarillas: ordenadas.filter(a => a.nivel === "amarillo").length, lista: ordenadas, texto };
}
