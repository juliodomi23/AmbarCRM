"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SelectorContacto } from "@/components/modulos/SelectorContacto";
import { toast } from "@/components/Toaster";
import { Boton, Modal } from "@/components/ui";

type Producto = { id: string; nombre: string; sku: string | null; precio: string; unidad: string; stock: string };
type Cotizacion = {
  id: string; folio: string; estado: string; vigencia: string; total: string; tokenPublico: string;
  contacto: { nombre: string }; oportunidad: { titulo: string } | null; venta: { id: string; folio: string } | null;
};
type Partida = { productoId: string; concepto: string; cantidad: string; precio: string; descuento: string };
type Config = { ivaPorcentaje: string; preciosConIva: boolean; plantillaCotizacion?: { name: string; language: string } };

const input = "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm";
const nuevaPartida = (): Partida => ({ productoId: "", concepto: "", cantidad: "1", precio: "0", descuento: "0" });

function moneda(valor: string | number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(valor));
}

export function CotizacionesCliente({
  cotizaciones, productos, config, esAdmin, abrirNueva, contactoInicial, oportunidadInicial, baseUrl,
}: {
  cotizaciones: Cotizacion[]; productos: Producto[]; config: Config; esAdmin: boolean; abrirNueva: boolean;
  contactoInicial: { id: string; nombre: string } | null; oportunidadInicial: string; baseUrl: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(abrirNueva);
  const [configAbierta, setConfigAbierta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [contactoId, setContactoId] = useState(contactoInicial?.id ?? "");
  const [partidas, setPartidas] = useState<Partida[]>([nuevaPartida()]);

  function cambiarPartida(indice: number, cambio: Partial<Partida>) {
    setPartidas((actuales) => actuales.map((partida, i) => i === indice ? { ...partida, ...cambio } : partida));
  }

  function elegirProducto(indice: number, productoId: string) {
    const producto = productos.find((item) => item.id === productoId);
    cambiarPartida(indice, producto ? { productoId, concepto: producto.nombre, precio: producto.precio } : { productoId: "", concepto: "", precio: "0" });
  }

  async function crear(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    setEnviando(true);
    const respuesta = await fetch("/api/cotizaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactoId,
        oportunidadId: oportunidadInicial || null,
        vigencia: datos.get("vigencia"),
        descuento: datos.get("descuento"),
        convertirVenta: datos.get("convertirVenta") === "on",
        notas: datos.get("notas"),
        condiciones: datos.get("condiciones"),
        partidas,
        total: "0.01",
      }),
    });
    const resultado = await respuesta.json().catch(() => ({}));
    setEnviando(false);
    if (!respuesta.ok) return toast(resultado.error ?? "No se pudo crear la cotización", "error");
    toast("Cotización creada");
    setAbierto(false);
    setPartidas([nuevaPartida()]);
    router.refresh();
  }

  async function enviarWhatsapp(id: string) {
    const respuesta = await fetch(`/api/cotizaciones/${id}/enviar`, { method: "POST" });
    const resultado = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) return toast(resultado.error ?? "No se pudo enviar", "error");
    toast(`Cotización enviada por ${resultado.forma}`);
    router.refresh();
  }

  async function guardarConfig(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = Object.fromEntries(new FormData(evento.currentTarget));
    const respuesta = await fetch("/api/cotizaciones/config", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos),
    });
    const resultado = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) return toast(resultado.error ?? "No se pudo guardar", "error");
    toast("Configuración guardada");
    setConfigAbierta(false);
    router.refresh();
  }

  return (
    <main className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Cotizaciones</h1>
          <p className="text-sm text-muted-foreground">Propuestas con aceptación pública y totales calculados en el servidor.</p>
        </div>
        <div className="flex gap-2">
          {esAdmin && <Boton variante="ghost" onClick={() => setConfigAbierta(true)}>Configurar IVA</Boton>}
          <Boton onClick={() => setAbierto(true)}>+ Nueva cotización</Boton>
        </div>
      </header>

      <section className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-muted-foreground"><tr><th className="p-3">Folio</th><th className="p-3">Cliente</th><th className="p-3">Vigencia</th><th className="p-3">Estado</th><th className="p-3 text-right">Total</th><th className="p-3">Acciones</th></tr></thead>
          <tbody>
            {cotizaciones.map((cotizacion) => (
              <tr key={cotizacion.id} className="border-b last:border-0">
                <td className="p-3 font-medium">{cotizacion.folio}</td>
                <td className="p-3">{cotizacion.contacto.nombre}{cotizacion.oportunidad && <span className="block text-xs text-muted-foreground">{cotizacion.oportunidad.titulo}</span>}</td>
                <td className="p-3">{new Date(cotizacion.vigencia).toLocaleDateString("es-MX", { timeZone: "UTC" })}</td>
                <td className="p-3 capitalize">{cotizacion.estado}</td>
                <td className="p-3 text-right font-medium">{moneda(cotizacion.total)}</td>
                <td className="p-3"><div className="flex flex-wrap gap-2">
                  <Link href={`/cotizacion/${cotizacion.tokenPublico}`} target="_blank" className="text-primary hover:underline">Ver</Link>
                  {!['aceptada','rechazada','vencida'].includes(cotizacion.estado) && <button onClick={() => enviarWhatsapp(cotizacion.id)} className="text-green-700 hover:underline">WhatsApp</button>}
                  {cotizacion.venta && <Link href={`/ventas?venta=${cotizacion.venta.id}`} className="text-primary hover:underline">{cotizacion.venta.folio}</Link>}
                  {baseUrl && <button onClick={() => navigator.clipboard.writeText(`${baseUrl}/cotizacion/${cotizacion.tokenPublico}`).then(() => toast("Enlace copiado"))} className="text-muted-foreground hover:underline">Copiar enlace</button>}
                </div></td>
              </tr>
            ))}
            {!cotizaciones.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Todavía no hay cotizaciones.</td></tr>}
          </tbody>
        </table>
      </section>

      <Modal abierto={abierto} onClose={() => setAbierto(false)} titulo="Nueva cotización">
        <form onSubmit={crear} className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
          <label className="block space-y-1"><span className="text-sm font-medium">Cliente</span>
            {contactoInicial && contactoId === contactoInicial.id ? (
              <div className="flex justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm"><span>{contactoInicial.nombre}</span><button type="button" className="text-primary" onClick={() => setContactoId("")}>Cambiar</button></div>
            ) : <SelectorContacto valor={contactoId} onChange={setContactoId} />}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm"><span className="font-medium">Vigencia</span><input name="vigencia" type="date" required className={input} /></label>
            <label className="space-y-1 text-sm"><span className="font-medium">Descuento general</span><input name="descuento" type="number" min="0" step="0.01" defaultValue="0" className={input} /></label>
          </div>
          <div className="space-y-3">
            {partidas.map((partida, indice) => (
              <div key={indice} className="space-y-2 rounded-lg border p-3">
                <div className="flex gap-2"><select value={partida.productoId} onChange={(e) => elegirProducto(indice, e.target.value)} className={input}><option value="">Concepto libre</option>{productos.map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre} · {moneda(producto.precio)}/{producto.unidad}</option>)}</select>{partidas.length > 1 && <button type="button" onClick={() => setPartidas((items) => items.filter((_, i) => i !== indice))} className="text-red-600">Quitar</button>}</div>
                <input aria-label="Concepto" value={partida.concepto} readOnly={!!partida.productoId} onChange={(e) => cambiarPartida(indice, { concepto: e.target.value })} placeholder="Concepto" className={input} />
                <div className="grid grid-cols-3 gap-2"><input aria-label="Cantidad" value={partida.cantidad} onChange={(e) => cambiarPartida(indice, { cantidad: e.target.value })} type="number" min="0.001" step="0.001" className={input} /><input aria-label="Precio" value={partida.precio} readOnly={!!partida.productoId} onChange={(e) => cambiarPartida(indice, { precio: e.target.value })} type="number" min="0" step="0.01" className={input} /><input aria-label="Descuento" value={partida.descuento} onChange={(e) => cambiarPartida(indice, { descuento: e.target.value })} type="number" min="0" step="0.01" className={input} /></div>
              </div>
            ))}
            <button type="button" onClick={() => setPartidas((items) => [...items, nuevaPartida()])} className="text-sm font-medium text-primary">+ Agregar concepto</button>
          </div>
          <textarea name="notas" placeholder="Notas" rows={2} className={input} />
          <textarea name="condiciones" placeholder="Condiciones" rows={2} className={input} />
          <label className="flex items-start gap-2 text-sm"><input name="convertirVenta" type="checkbox" className="mt-1" /><span>Al aceptar, convertir en venta y reservar existencias. Requiere que todas las partidas sean productos.</span></label>
          <p className="text-xs text-muted-foreground">IVA: {config.ivaPorcentaje}% · precios {config.preciosConIva ? "con IVA incluido" : "más IVA"}. El servidor recalcula todos los importes.</p>
          <Boton type="submit" disabled={enviando || !contactoId} className="w-full">{enviando ? "Creando…" : "Crear cotización"}</Boton>
        </form>
      </Modal>

      <Modal abierto={configAbierta} onClose={() => setConfigAbierta(false)} titulo="Configuración de cotizaciones">
        <form onSubmit={guardarConfig} className="space-y-3">
          <label className="block space-y-1 text-sm"><span>IVA (%)</span><input name="ivaPorcentaje" type="number" min="0" max="100" step="0.01" defaultValue={config.ivaPorcentaje} className={input} /></label>
          <label className="flex gap-2 text-sm"><input name="preciosConIva" type="checkbox" value="true" defaultChecked={config.preciosConIva} /> Los precios ya incluyen IVA</label>
          <label className="block space-y-1 text-sm"><span>Plantilla aprobada de WhatsApp</span><input name="plantillaName" defaultValue={config.plantillaCotizacion?.name ?? ""} className={input} /></label>
          <label className="block space-y-1 text-sm"><span>Idioma de plantilla</span><input name="plantillaLanguage" defaultValue={config.plantillaCotizacion?.language ?? "es_MX"} className={input} /></label>
          <Boton type="submit" className="w-full">Guardar</Boton>
        </form>
      </Modal>
    </main>
  );
}
