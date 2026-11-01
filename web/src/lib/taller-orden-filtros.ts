export type OrdenFiltrable = {
  id: string;
  numero: string;
  estado: string;
  updatedAt: string;
  fallaReportada: string;
  mecanicoId: string | null;
  vehiculo: { placa: string; marca: string; modelo: string; contacto: { nombre: string } };
};

export type FiltrosOrdenes = { busqueda: string; mecanicoId: string };

const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-MX");

export function filtrarOrdenes<T extends OrdenFiltrable>(ordenes: readonly T[], filtros: FiltrosOrdenes) {
  const consulta = normalizar(filtros.busqueda.trim()).replace(/^#/, "");
  return ordenes.filter((orden) => {
    const coincideMecanico = filtros.mecanicoId === "todos"
      || (filtros.mecanicoId === "sin-asignar" ? !orden.mecanicoId : orden.mecanicoId === filtros.mecanicoId);
    if (!coincideMecanico) return false;
    if (!consulta) return true;
    const campos = [orden.vehiculo.placa, orden.vehiculo.contacto.nombre, `${orden.vehiculo.marca} ${orden.vehiculo.modelo}`, orden.fallaReportada, orden.numero]
      .map(normalizar);
    return campos.some((campo) => campo.includes(consulta));
  });
}

export function separarOrdenesCerradas<T extends OrdenFiltrable>(ordenes: readonly T[], estado: "entregado" | "cancelado", ahora = new Date()) {
  const hace30Dias = ahora.getTime() - 30 * 24 * 60 * 60 * 1000;
  const delEstado = ordenes.filter((orden) => orden.estado === estado);
  return {
    recientes: delEstado.filter((orden) => new Date(orden.updatedAt).getTime() >= hace30Dias),
    antiguas: delEstado.filter((orden) => new Date(orden.updatedAt).getTime() < hace30Dias),
  };
}
