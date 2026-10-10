"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { formatoMoneda } from "@/components/ui";

type Datos = {
  ventas: Array<{
    id: string; folio: string; total: string; vendidaAt: string | null; subidaAt: string | null; motivos: string[];
    diferenciaPrecio: string | null; cajero: { id: string; nombre: string } | null; caja: { nombre: string } | null;
    turnoId: string | null; turnoOriginalId: string | null;
  }>;
  diferenciasPorCajero: Array<{ cajero: { id: string; nombre: string } | null; ventas: number; diferencia: string }>;
  rechazos: Array<{ id: string; folio: string | null; total: string | null; motivo: string; codigo: string | null; vendidaAt: string | null; createdAt: string; cajero: string | null }>;
  inventarioNegativo: Array<{ id: string; nombre: string; sku: string | null; stock: string; unidad: string }>;
};

const ETIQUETA: Record<string, string> = {
  precio_distinto: "Precio distinto al del servidor",
  tardia: "Llegó tarde (turno ya cerrado)",
  inventario_negativo: "Existencia negativa",
};
const fecha = (valor: string | null) => (valor ? new Date(valor).toLocaleString("es-MX") : "—");

export function RevisionSinRed({ datos }: { datos: Datos }) {
  const router = useRouter();
  async function resolver(id: string, tipo: "venta" | "rechazo") {
    const respuesta = await fetch(`/api/caja/revision/${id}?tipo=${tipo}`, { method: "PATCH" });
    if (!respuesta.ok) return toast((await respuesta.json().catch(() => ({}))).error ?? "No se pudo marcar", "error");
    toast("Marcado como revisado");
    router.refresh();
  }
  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Ventas por revisar</h1><p className="text-sm text-muted-foreground">Ventas hechas sin internet con diferencias, tardías o existencia negativa, y las que el servidor rechazó.</p></div>
        <Link className="rounded-lg bg-muted px-4 py-2 text-sm font-medium" href="/caja">Volver a caja</Link>
      </header>

      <section className="surface p-4">
        <h2 className="mb-2 font-bold">Diferencias de precio por cajero</h2>
        {datos.diferenciasPorCajero.length === 0 ? <p className="text-sm text-muted-foreground">Sin diferencias pendientes.</p> : (
          <table className="w-full text-sm"><thead><tr className="text-left"><th>Cajero</th><th className="text-right">Ventas</th><th className="text-right">Servidor − cobrado</th></tr></thead>
            <tbody>{datos.diferenciasPorCajero.map((fila) => <tr key={fila.cajero?.id ?? "sin"} className="border-t"><td className="py-1">{fila.cajero?.nombre ?? "Sin cajero"}</td><td className="text-right">{fila.ventas}</td><td className="text-right">{formatoMoneda(Number(fila.diferencia))}</td></tr>)}</tbody></table>
        )}
      </section>

      <section className="surface overflow-x-auto p-4">
        <h2 className="mb-2 font-bold">Ventas con marca ({datos.ventas.length})</h2>
        {datos.ventas.length === 0 ? <p className="text-sm text-muted-foreground">Nada por revisar.</p> : (
          <table className="w-full min-w-[760px] text-sm"><thead><tr className="text-left"><th>Folio</th><th>Cajero</th><th>Vendida</th><th className="text-right">Cobrado</th><th className="text-right">Diferencia</th><th>Motivo</th><th /></tr></thead>
            <tbody>{datos.ventas.map((venta) => <tr key={venta.id} className="border-t align-top">
              <td className="py-2">{venta.folio}</td><td>{venta.cajero?.nombre ?? "—"}<small className="block text-muted-foreground">{venta.caja?.nombre}</small></td>
              <td>{fecha(venta.vendidaAt)}<small className="block text-muted-foreground">subida {fecha(venta.subidaAt)}</small></td>
              <td className="text-right">{formatoMoneda(Number(venta.total))}</td>
              <td className="text-right">{venta.diferenciaPrecio === null ? "—" : formatoMoneda(Number(venta.diferenciaPrecio))}</td>
              <td>{venta.motivos.map((motivo) => ETIQUETA[motivo] ?? motivo).join(" · ")}</td>
              <td className="text-right"><button className="underline" onClick={() => void resolver(venta.id, "venta")}>Marcar revisada</button></td>
            </tr>)}</tbody></table>
        )}
      </section>

      <section className="surface overflow-x-auto p-4">
        <h2 className="mb-2 font-bold">Rechazadas por el servidor ({datos.rechazos.length})</h2>
        <p className="mb-2 text-xs text-muted-foreground">El efectivo ya se cobró: registra la venta a mano si corresponde y marca el rechazo como resuelto.</p>
        {datos.rechazos.length === 0 ? <p className="text-sm text-muted-foreground">Sin rechazos.</p> : (
          <table className="w-full min-w-[640px] text-sm"><thead><tr className="text-left"><th>Folio</th><th>Cajero</th><th>Vendida</th><th className="text-right">Cobrado</th><th>Motivo</th><th /></tr></thead>
            <tbody>{datos.rechazos.map((rechazo) => <tr key={rechazo.id} className="border-t align-top">
              <td className="py-2">{rechazo.folio ?? "—"}</td><td>{rechazo.cajero ?? "—"}</td><td>{fecha(rechazo.vendidaAt)}</td>
              <td className="text-right">{rechazo.total === null ? "—" : formatoMoneda(Number(rechazo.total))}</td><td>{rechazo.motivo}</td>
              <td className="text-right"><button className="underline" onClick={() => void resolver(rechazo.id, "rechazo")}>Resuelta</button></td>
            </tr>)}</tbody></table>
        )}
      </section>

      <section className="surface p-4">
        <h2 className="mb-2 font-bold">Existencia negativa ({datos.inventarioNegativo.length})</h2>
        <p className="mb-2 text-xs text-muted-foreground">Se corrige con una entrada de inventario (Productos → movimientos). La alerta desaparece sola al volver a 0 o más.</p>
        {datos.inventarioNegativo.length === 0 ? <p className="text-sm text-muted-foreground">Ningún producto en negativo.</p> : (
          <ul className="text-sm">{datos.inventarioNegativo.map((producto) => <li key={producto.id} className="flex justify-between border-t py-1"><span>{producto.nombre}{producto.sku ? ` · ${producto.sku}` : ""}</span><b className="text-red-700">{producto.stock} {producto.unidad}</b></li>)}</ul>
        )}
      </section>
    </div>
  );
}
