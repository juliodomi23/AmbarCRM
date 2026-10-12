// Reporte de retail calculado del almacén (misma forma que /api/reportes/retail).
import type { Datos } from "./tipos";

const r2 = (n: number) => Math.round(n * 100) / 100;

type Acum = { clave: string; nombre: string; cantidad: number; ingresos: number; costos: number; ingresosSinCosto: number; partidasSinCosto: number };
const fila = (a: Acum) => ({ clave: a.clave, nombre: a.nombre, cantidad: a.cantidad, ingresos: r2(a.ingresos), costos: r2(a.costos), utilidad: r2(a.ingresos - a.ingresosSinCosto - a.costos), ingresosSinCosto: r2(a.ingresosSinCosto), partidasSinCosto: a.partidasSinCosto });

export function reporteRetail(d: Datos, desde: string, hasta: string) {
  const zona = "America/Mexico_City";
  const clave = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date(iso));
  const hora = (iso: string) => String(Number(new Intl.DateTimeFormat("en-US", { timeZone: zona, hour: "numeric", hourCycle: "h23" }).format(new Date(iso)))).padStart(2, "0");
  const productos = d.extra.productos ?? [];
  const vendidas = (d.extra.ventas ?? []).filter((v) => ["pagada", "preparando", "lista", "entregada"].includes(v.estado) && clave(v.createdAt) >= desde && clave(v.createdAt) <= hasta);

  const grupos = (clavePor: (v: any, l: any) => [string, string]) => {
    const m = new Map<string, Acum>();
    for (const v of vendidas) for (const l of v.partidas) {
      const [k, nombre] = clavePor(v, l);
      const p = productos.find((x) => x.id === l.productoId);
      const a = m.get(k) ?? { clave: k, nombre, cantidad: 0, ingresos: 0, costos: 0, ingresosSinCosto: 0, partidasSinCosto: 0 };
      a.cantidad += l.cantidad;
      a.ingresos += l.total;
      a.costos += (p?.costo ?? 0) * l.cantidad;
      m.set(k, a);
    }
    return [...m.values()].sort((x, y) => y.ingresos - x.ingresos).map(fila);
  };
  const porProducto = grupos((_v, l) => [l.productoId, productos.find((x) => x.id === l.productoId)?.nombre ?? "—"]);
  const total = porProducto.reduce((t, f) => ({ ingresos: t.ingresos + f.ingresos, costos: t.costos + f.costos, utilidad: t.utilidad + f.utilidad }), { ingresos: 0, costos: 0, utilidad: 0 });

  const turnos = d.extra.turnos ?? [];
  const cortes = turnos.filter((t) => t.estado === "cerrado").map((t) => {
    const u = d.usuarios.find((x) => x.id === t.usuarioId);
    return { clave: t.id, nombre: u?.nombre ?? "—", diferencia: t.diferencia ?? 0, explicadoPorTardias: 0, diferenciaAjustada: t.diferencia ?? 0, turnos: 1 };
  });
  return {
    zona,
    envios: r2(vendidas.reduce((s, v) => s + (v.costoEnvio ?? 0), 0)),
    resumen: { ingresos: r2(total.ingresos), costos: r2(total.costos), utilidad: r2(total.utilidad), ingresosSinCosto: 0, partidasSinCosto: 0 },
    productos: { variantes: porProducto, agrupados: porProducto },
    categorias: grupos((_v, l) => { const c = productos.find((x) => x.id === l.productoId)?.categoria ?? "Sin categoría"; return [c, c]; }),
    ventas: {
      porDia: grupos((v) => [clave(v.createdAt), clave(v.createdAt)]).sort((a, b) => a.clave.localeCompare(b.clave)),
      porHora: grupos((v) => [hora(v.createdAt), `${hora(v.createdAt)}:00`]).sort((a, b) => a.clave.localeCompare(b.clave)),
      porCajero: grupos((v) => [v.creadoPorId, d.usuarios.find((u) => u.id === v.creadoPorId)?.nombre ?? "—"]),
      porCaja: grupos((v) => { const c = (d.extra.cajas ?? []).find((x) => x.id === v.cajaId); return [v.cajaId ?? "sin", c?.nombre ?? "Sin caja"]; }),
    },
    inventario: {
      filas: productos.map((p) => ({ id: p.id, nombre: p.nombre, sku: p.sku, stock: p.stock, stockMinimo: p.stockMinimo, valorCosto: r2(p.costo * p.stock), valorPrecio: r2(p.precio * p.stock), sinMovimiento: false, alertaMinimo: p.stock <= p.stockMinimo, negativo: p.stock < 0 })),
      pagina: 1, tamano: productos.length, total: productos.length,
    },
    cortes,
  };
}
