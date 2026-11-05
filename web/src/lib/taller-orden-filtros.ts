export type OrdenFiltrable = {
  id: string;
  numero: string;
  estado: string;
  createdAt?: string;
  updatedAt: string;
  fechaPromesa?: string | null;
  fallaReportada: string;
  mecanicoId: string | null;
  vehiculo: { placa: string; marca: string; modelo: string; contacto: { nombre: string } };
};

export type PeriodoOrdenes = "todo" | "semana" | "mes" | "mes-anterior" | "anio" | "personalizado";
export type CampoFechaOrden = "ingreso" | "promesa";
export type FiltrosOrdenes = {
  busqueda: string;
  mecanicoId: string;
  periodo?: PeriodoOrdenes;
  mes?: string;
  campoFecha?: CampoFechaOrden;
  ahora?: Date;
};

const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-MX");

// México no aplica horario de verano desde 2022: la zona del taller es UTC-6 todo el año.
const OFFSET_MEXICO_MS = 6 * 60 * 60 * 1000;
const DIA_MS = 86_400_000;
const inicioUtc = (anio: number, mes: number, dia: number) => Date.UTC(anio, mes, dia) + OFFSET_MEXICO_MS;

export function rangoPeriodo(periodo: PeriodoOrdenes, ahora: Date = new Date(), mes?: string): { desde: number; hasta: number } | null {
  if (periodo === "todo") return null;
  const local = new Date(ahora.getTime() - OFFSET_MEXICO_MS);
  const anio = local.getUTCFullYear(), mesActual = local.getUTCMonth(), dia = local.getUTCDate();
  if (periodo === "semana") {
    const lunes = inicioUtc(anio, mesActual, dia - ((local.getUTCDay() + 6) % 7));
    return { desde: lunes, hasta: lunes + 7 * DIA_MS };
  }
  if (periodo === "mes") return { desde: inicioUtc(anio, mesActual, 1), hasta: inicioUtc(anio, mesActual + 1, 1) };
  if (periodo === "mes-anterior") return { desde: inicioUtc(anio, mesActual - 1, 1), hasta: inicioUtc(anio, mesActual, 1) };
  if (periodo === "anio") return { desde: inicioUtc(anio, 0, 1), hasta: inicioUtc(anio + 1, 0, 1) };
  const elegido = /^(\d{4})-(\d{2})$/.exec(mes ?? "");
  if (!elegido) return null;
  const numeroMes = Number(elegido[2]);
  if (numeroMes < 1 || numeroMes > 12) return null;
  return { desde: inicioUtc(Number(elegido[1]), numeroMes - 1, 1), hasta: inicioUtc(Number(elegido[1]), numeroMes, 1) };
}

export function filtrarOrdenes<T extends OrdenFiltrable>(ordenes: readonly T[], filtros: FiltrosOrdenes) {
  const consulta = normalizar(filtros.busqueda.trim()).replace(/^#/, "");
  const rango = filtros.periodo ? rangoPeriodo(filtros.periodo, filtros.ahora, filtros.mes) : null;
  return ordenes.filter((orden) => {
    const coincideMecanico = filtros.mecanicoId === "todos"
      || (filtros.mecanicoId === "sin-asignar" ? !orden.mecanicoId : orden.mecanicoId === filtros.mecanicoId);
    if (!coincideMecanico) return false;
    if (rango) {
      const fecha = filtros.campoFecha === "promesa" ? orden.fechaPromesa : orden.createdAt;
      const momento = fecha ? new Date(fecha).getTime() : NaN;
      if (!(momento >= rango.desde && momento < rango.hasta)) return false;
    }
    if (!consulta) return true;
    const campos = [orden.vehiculo.placa, orden.vehiculo.contacto.nombre, `${orden.vehiculo.marca} ${orden.vehiculo.modelo}`, orden.fallaReportada, orden.numero]
      .map(normalizar);
    return campos.some((campo) => campo.includes(consulta));
  });
}

export function separarOrdenesCerradas<T extends OrdenFiltrable>(ordenes: readonly T[], estado: "entregado" | "cancelado", ahora = new Date()) {
  const hace30Dias = ahora.getTime() - 30 * DIA_MS;
  const delEstado = ordenes.filter((orden) => orden.estado === estado);
  return {
    recientes: delEstado.filter((orden) => new Date(orden.updatedAt).getTime() >= hace30Dias),
    antiguas: delEstado.filter((orden) => new Date(orden.updatedAt).getTime() < hace30Dias),
  };
}
