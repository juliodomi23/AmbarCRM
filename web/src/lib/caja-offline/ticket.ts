import type { VentaEnCola } from "@/lib/caja-offline/cola";

const escapar = (valor: unknown) =>
  String(valor).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type DatosTicketLocal = {
  negocio: string;
  caja: string;
  cajero: string;
  zona: string;
  ancho?: 58 | 80;
};

/**
 * Ticket de una venta que aún no está en el servidor: se arma en el navegador con los datos de la cola
 * (mismo folio SR-… que conservará el servidor). Mismas medidas que `/caja/ticket/[ventaId]`.
 */
export function htmlTicketLocal(venta: VentaEnCola, datos: DatosTicketLocal) {
  const ancho = datos.ancho === 58 ? 58 : 80;
  const dinero = (valor: string | number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(valor));
  const fecha = new Date(venta.vendidaAt).toLocaleString("es-MX", { timeZone: datos.zona });
  const subtotal = venta.partidas.reduce((suma, partida) => suma + Number(partida.total) + Number(partida.descuento), 0);
  const partidas = venta.partidas.map((partida) => `
      <div class="partida"><p>${escapar(partida.nombre)}</p>
      <p class="fila"><span>${escapar(Number(partida.cantidad))} × ${dinero(partida.precioUnitario)}</span><span>${dinero(Number(partida.total))}</span></p>
      ${Number(partida.descuento) > 0 ? `<p class="der">Desc. ${dinero(partida.descuento)}</p>` : ""}</div>`).join("");
  const pagos = venta.pagos.map((pago) => `<p class="fila cap"><span>${escapar(pago.metodo)}</span><span>${dinero(pago.monto)}</span></p>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket ${escapar(venta.folio)}</title>
<style>
  @page { size: ${ancho}mm auto; margin: 2mm; }
  body { margin: 0; font: 11px/1.4 ui-monospace, Menlo, Consolas, monospace; color: #000; background: #fff; }
  article { width: ${ancho}mm; max-width: 100%; padding: 3mm; box-sizing: border-box; }
  h1 { font: bold 15px sans-serif; text-align: center; margin: 0 0 4px; }
  p { margin: 0; } .fila { display: flex; justify-content: space-between; gap: 8px; } .der { text-align: right; }
  .centro { text-align: center; } .cap { text-transform: capitalize; } .caja { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; margin: 6px 0; }
  .partida { margin-bottom: 4px; } .total { font-weight: bold; font-size: 13px; }
</style></head><body><article>
  <h1>${escapar(datos.negocio)}</h1><p class="centro">${escapar(datos.caja)}</p>
  <div class="caja"><p>Folio: ${escapar(venta.folio)}</p><p>Fecha: ${escapar(fecha)}</p><p>Cajero: ${escapar(datos.cajero)}</p></div>
  ${partidas}
  <div class="caja">
    <p class="fila"><span>Subtotal</span><span>${dinero(subtotal)}</span></p>
    <p class="fila total"><span>Total</span><span>${dinero(venta.totalCobrado)}</span></p>
  </div>
  ${pagos}
  <p class="fila"><b>Cambio</b><b>${dinero(venta.cambio)}</b></p>
  <p class="centro" style="margin-top:8px">Venta registrada sin conexión</p>
  <p class="centro">Gracias por su compra</p>
</article></body></html>`;
}

/** Abre una ventana con el ticket y lanza la impresión; funciona sin internet. */
export function imprimirTicketLocal(venta: VentaEnCola, datos: DatosTicketLocal) {
  const ventana = window.open("", "_blank", "width=420,height=640");
  if (!ventana) return false;
  ventana.document.open();
  ventana.document.write(htmlTicketLocal(venta, datos));
  ventana.document.close();
  ventana.focus();
  ventana.setTimeout(() => ventana.print(), 150);
  return true;
}
