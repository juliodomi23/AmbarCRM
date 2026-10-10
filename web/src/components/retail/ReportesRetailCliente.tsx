"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "@/components/Toaster";
import { Boton, formatoMoneda } from "@/components/ui";

type DecimalSerializado = string | number;
const dinero = (valor: DecimalSerializado) => formatoMoneda(Number(valor));
type Fila = { clave: string; nombre: string; cantidad: DecimalSerializado; ingresos: DecimalSerializado; costos: DecimalSerializado; utilidad: DecimalSerializado; ingresosSinCosto: DecimalSerializado; partidasSinCosto: number };
type Reporte = {
  zona: string;
  resumen: { ingresos: DecimalSerializado; costos: DecimalSerializado; utilidad: DecimalSerializado; ingresosSinCosto: DecimalSerializado; partidasSinCosto: number };
  productos: { variantes: Fila[]; agrupados: Fila[] };
  categorias: Fila[];
  ventas: { porDia: Fila[]; porHora: Fila[]; porCajero: Fila[]; porCaja: Fila[] };
  inventario: { filas: Array<{ id: string; nombre: string; sku: string | null; stock: DecimalSerializado; stockMinimo: DecimalSerializado; valorCosto: DecimalSerializado; valorPrecio: DecimalSerializado; sinMovimiento: boolean; alertaMinimo: boolean }>; pagina: number; tamano: number; total: number };
  cortes: Array<{ clave: string; nombre: string; diferencia: DecimalSerializado; turnos: number }>;
};

const hoy = new Date();
const fecha = (valor: Date) => valor.toISOString().slice(0, 10);
const inicioMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));

export function ReportesRetailCliente() {
  const [desde, setDesde] = useState(fecha(inicioMes));
  const [hasta, setHasta] = useState(fecha(hoy));
  const [agruparPadre, setAgruparPadre] = useState(false);
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [cargando, setCargando] = useState(false);
  const parametros = useMemo(() => new URLSearchParams({ desde, hasta }).toString(), [desde, hasta]);

  async function cargar() {
    setCargando(true);
    try {
      const respuesta = await fetch(`/api/reportes/retail?${parametros}`);
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo generar el reporte");
      setReporte(datos.reporte);
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setCargando(false); }
  }

  const productos = reporte ? (agruparPadre ? reporte.productos.agrupados : reporte.productos.variantes) : [];
  return <main className="space-y-5 p-4 md:p-6">
    <header><h1 className="text-2xl font-bold">Reportes retail</h1><p className="text-sm text-muted-foreground">Utilidad, rotación, inventario, cajas y diferencias de corte en la zona local.</p></header>
    <section className="surface flex flex-wrap items-end gap-3 p-4">
      <label className="text-sm">Desde<input className="mt-1 block rounded-lg border bg-card px-3 py-2" type="date" value={desde} onChange={(e) => setDesde(e.target.value)}/></label>
      <label className="text-sm">Hasta<input className="mt-1 block rounded-lg border bg-card px-3 py-2" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}/></label>
      <Boton disabled={cargando} onClick={() => void cargar()}>{cargando ? "Calculando…" : "Generar"}</Boton>
      <Link className="rounded-lg bg-muted px-4 py-2 text-sm font-medium" href={`/api/reportes/retail?${parametros}&formato=csv`}>Exportar CSV</Link>
    </section>
    {reporte && <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica titulo="Ingreso neto" valor={dinero(reporte.resumen.ingresos)}/><Metrica titulo="Costo conocido" valor={dinero(reporte.resumen.costos)}/><Metrica titulo="Utilidad conocida" valor={dinero(reporte.resumen.utilidad)}/><Metrica titulo="Ingreso sin costo" valor={dinero(reporte.resumen.ingresosSinCosto)} detalle={`${reporte.resumen.partidasSinCosto} partidas`}/>
      </section>
      <section className="surface p-4"><div className="mb-3 flex flex-wrap justify-between gap-2"><h2 className="font-bold">Por producto</h2><label className="text-sm"><input className="mr-2" type="checkbox" checked={agruparPadre} onChange={(e) => setAgruparPadre(e.target.checked)}/>Agrupar variantes por producto padre</label></div><TablaFinanciera filas={productos}/></section>
      <section className="grid gap-4 xl:grid-cols-2"><Panel titulo="Por categoría"><TablaFinanciera filas={reporte.categorias}/></Panel><Panel titulo="Ventas por día local"><TablaFinanciera filas={reporte.ventas.porDia}/></Panel><Panel titulo="Ventas por hora local"><TablaFinanciera filas={reporte.ventas.porHora}/></Panel><Panel titulo="Por cajero"><TablaFinanciera filas={reporte.ventas.porCajero}/></Panel><Panel titulo="Por caja"><TablaFinanciera filas={reporte.ventas.porCaja}/></Panel><Panel titulo="Faltantes y sobrantes"><table className="w-full text-sm"><thead><tr><th className="py-2 text-left">Persona / caja</th><th>Turnos</th><th className="text-right">Diferencia</th></tr></thead><tbody>{reporte.cortes.map((fila) => <tr className="border-t" key={fila.clave}><td className="py-2">{fila.nombre}</td><td className="text-center">{fila.turnos}</td><td className="text-right">{dinero(fila.diferencia)}</td></tr>)}</tbody></table></Panel></section>
      <Panel titulo={`Inventario · página ${reporte.inventario.pagina}`}><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr><th className="py-2 text-left">Producto</th><th>Existencia</th><th className="text-right">A costo</th><th className="text-right">A precio</th><th>Estado</th></tr></thead><tbody>{reporte.inventario.filas.map((fila) => <tr className="border-t" key={fila.id}><td className="py-2">{fila.nombre}<small className="block text-muted-foreground">{fila.sku}</small></td><td className="text-center">{fila.stock}</td><td className="text-right">{dinero(fila.valorCosto)}</td><td className="text-right">{dinero(fila.valorPrecio)}</td><td className="text-center">{fila.alertaMinimo ? "Bajo mínimo" : fila.sinMovimiento ? "Sin movimiento" : "Con movimiento"}</td></tr>)}</tbody></table></div></Panel>
      <p className="text-xs text-muted-foreground">Zona: {reporte.zona}. La utilidad excluye partidas antiguas sin costo.</p>
    </>}
  </main>;
}

function Metrica({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) { return <div className="surface p-4"><p className="text-xs uppercase text-muted-foreground">{titulo}</p><strong className="text-xl">{valor}</strong>{detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}</div>; }
function Panel({ titulo, children }: { titulo: string; children: React.ReactNode }) { return <section className="surface p-4"><h2 className="mb-3 font-bold">{titulo}</h2>{children}</section>; }
function TablaFinanciera({ filas }: { filas: Fila[] }) { return <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr><th className="py-2 text-left">Nombre</th><th>Cantidad</th><th className="text-right">Ingreso</th><th className="text-right">Costo</th><th className="text-right">Utilidad</th><th className="text-right">Sin costo</th></tr></thead><tbody>{filas.map((fila) => <tr className="border-t" key={fila.clave}><td className="py-2">{fila.nombre}</td><td className="text-center">{fila.cantidad}</td><td className="text-right">{dinero(fila.ingresos)}</td><td className="text-right">{dinero(fila.costos)}</td><td className="text-right">{dinero(fila.utilidad)}</td><td className="text-right">{fila.partidasSinCosto ? dinero(fila.ingresosSinCosto) : "—"}</td></tr>)}</tbody></table></div>; }
