"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AbrirTicket } from "@/components/caja/BotonImprimir";
import { OperacionesCajaA2 } from "@/components/caja/OperacionesCajaA2";
import { TarjetaLealtad } from "@/components/lealtad/TarjetaLealtad";
import type { ContactoVenta, ProductoRetail } from "@/components/retail/tipos";
import { toast } from "@/components/Toaster";
import { Boton, formatoMoneda } from "@/components/ui";

type Caja = { id: string; nombre: string; sucursal: string | null };
type Turno = {
  id: string;
  estado: string;
  fondoInicial: number;
  abiertoAt: string;
  cerradoAt: string | null;
  efectivoContado: number | null;
  efectivoEsperado: number | null;
  diferencia: number | null;
  caja: Caja;
  usuario: { id: string; nombre: string };
};
type Linea = { producto: ProductoRetail; cantidad: string; descuento: string };
type Corte = {
  ventas: number;
  ventasTotal: number;
  efectivoCobrado: number;
  entradas: number;
  salidas: number;
  efectivoEsperado: number;
  diferencia?: number;
};
type VentaResultado = { id: string; folio: string; contacto: ContactoVenta | null };
type ContactoBusqueda = { id: string; nombre: string; detalle: string };

const dinero = (valor: string) => Number(valor || 0);
const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

async function api(url: string, method = "GET", body?: unknown) {
  const respuesta = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(payload.error ?? "No se pudo completar la operación");
  return payload;
}

export function CajaCliente({
  cajas,
  productos,
  turnoInicial,
  turnosRecientes,
  descuentoMaximo,
  usuario,
}: {
  cajas: Caja[];
  productos: ProductoRetail[];
  turnoInicial: Turno | null;
  turnosRecientes: Turno[];
  descuentoMaximo: number;
  usuario: { rol: string; puesto: string };
}) {
  const router = useRouter();
  const busquedaRef = useRef<HTMLInputElement>(null);
  const [turno, setTurno] = useState(turnoInicial);
  const [busqueda, setBusqueda] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [descuento, setDescuento] = useState("0");
  const [contactoId, setContactoId] = useState("");
  const [busquedaContacto, setBusquedaContacto] = useState("");
  const [contactosEncontrados, setContactosEncontrados] = useState<ContactoBusqueda[]>([]);
  const [pagos, setPagos] = useState({ efectivo: "", tarjeta: "", transferencia: "" });
  const [uuid, setUuid] = useState(() => crypto.randomUUID());
  const [ocupado, setOcupado] = useState(false);
  const [corte, setCorte] = useState<Corte | null>(null);
  const [venta, setVenta] = useState<VentaResultado | null>(null);

  const filtrados = useMemo(() => {
    const termino = normalizar(busqueda.trim());
    if (!termino) return productos.slice(0, 18);
    return productos.filter((producto) =>
      [producto.nombre, producto.sku, producto.codigoBarras]
        .filter(Boolean)
        .some((valor) => normalizar(String(valor)).includes(termino)),
    ).slice(0, 18);
  }, [busqueda, productos]);
  const subtotal = lineas.reduce((suma, linea) => suma + Number(linea.producto.precio) * Number(linea.cantidad || 0), 0);
  const descuentoLineas = lineas.reduce((suma, linea) => suma + dinero(linea.descuento), 0);
  const total = Math.max(0, subtotal - descuentoLineas - dinero(descuento));
  const pagado = Object.values(pagos).reduce((suma, monto) => suma + dinero(monto), 0);
  const cambio = Math.max(0, pagado - total);

  useEffect(() => busquedaRef.current?.focus(), [turno]);
  useEffect(() => {
    if (contactoId || busquedaContacto.trim().length < 2) {
      setContactosEncontrados([]);
      return;
    }
    const abortar = new AbortController();
    const espera = window.setTimeout(() => {
      fetch(`/api/buscar?q=${encodeURIComponent(busquedaContacto)}`, { signal: abortar.signal })
        .then((respuesta) => respuesta.ok ? respuesta.json() : { resultados: [] })
        .then((datos) => setContactosEncontrados(
          (datos.resultados ?? [])
            .filter((resultado: { tipo?: string }) => resultado.tipo === "Contacto")
            .map((resultado: { id: string; titulo: string; detalle: string }) => ({
              id: resultado.id.replace(/^contacto-/, ""),
              nombre: resultado.titulo,
              detalle: resultado.detalle,
            })),
        ))
        .catch(() => undefined);
    }, 180);
    return () => {
      window.clearTimeout(espera);
      abortar.abort();
    };
  }, [busquedaContacto, contactoId]);
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "F2") { evento.preventDefault(); void cobrar(); }
      if (evento.key === "F4") { evento.preventDefault(); busquedaRef.current?.focus(); }
      if (evento.key === "Escape" && lineas.length) setLineas((actual) => actual.slice(0, -1));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  function agregar(producto: ProductoRetail) {
    let cantidad = "1";
    if (producto.vendePorPeso) {
      cantidad = window.prompt(`Cantidad de ${producto.nombre} en ${producto.unidad}`, "0.250") ?? "";
      if (!/^\d+(\.\d{1,3})?$/.test(cantidad) || Number(cantidad) <= 0) return;
    }
    setLineas((actual) => {
      const encontrada = actual.find((linea) => linea.producto.id === producto.id);
      if (!encontrada) return [...actual, { producto, cantidad, descuento: "0" }];
      return actual.map((linea) => linea.producto.id === producto.id
        ? { ...linea, cantidad: (Number(linea.cantidad) + Number(cantidad)).toFixed(producto.vendePorPeso ? 3 : 0) }
        : linea);
    });
    setBusqueda("");
    queueMicrotask(() => busquedaRef.current?.focus());
  }

  function escanear(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key !== "Enter") return;
    evento.preventDefault();
    const exacto = productos.find((producto) => producto.codigoBarras === busqueda.trim() || producto.sku?.toLowerCase() === busqueda.trim().toLowerCase());
    if (exacto) agregar(exacto);
    else if (filtrados.length === 1) agregar(filtrados[0]);
    else toast("Código no encontrado; elige un resultado", "error");
  }

  async function abrirTurno() {
    const cajaId = (document.querySelector("#caja-apertura") as HTMLSelectElement | null)?.value;
    const fondoInicial = window.prompt("Fondo inicial", "500");
    if (!cajaId || fondoInicial === null) return;
    setOcupado(true);
    try {
      const data = await api("/api/caja/turnos", "POST", { cajaId, fondoInicial });
      setTurno(data.turno); toast("Turno abierto");
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setOcupado(false); }
  }

  async function crearCaja() {
    const nombre = window.prompt("Nombre de la caja", "Caja 1");
    const sucursal = nombre === null ? null : window.prompt("Sucursal (opcional)", "Matriz");
    if (nombre === null || sucursal === null) return;
    try { await api("/api/caja/cajas", "POST", { nombre, sucursal }); toast("Caja creada"); router.refresh(); }
    catch (error) { toast((error as Error).message, "error"); }
  }

  async function cobrar() {
    if (!turno || lineas.length === 0 || ocupado) return;
    setOcupado(true);
    try {
      const data = await api("/api/caja/ventas", "POST", {
        turnoId: turno.id,
        contactoId: contactoId || null,
        uuidCliente: uuid,
        descuento,
        partidas: lineas.map((linea) => ({ productoId: linea.producto.id, cantidad: linea.cantidad, descuento: linea.descuento })),
        pagos: Object.entries(pagos).filter(([, monto]) => dinero(monto) > 0).map(([metodo, monto]) => ({ metodo, monto })),
      });
      setVenta(data.venta); limpiarVenta();
      toast(data.repetida ? "La venta ya estaba registrada" : `Venta ${data.venta.folio} cobrada`);
      router.refresh();
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setOcupado(false); }
  }

  function limpiarVenta() {
    setLineas([]); setDescuento("0"); setPagos({ efectivo: "", tarjeta: "", transferencia: "" }); setUuid(crypto.randomUUID());
  }

  async function apartar() {
    if (!turno || !contactoId || !lineas.length || ocupado) return;
    const anticipo = window.prompt("Anticipo del apartado", "100");
    const metodo = anticipo === null ? null : window.prompt("Método: efectivo, tarjeta o transferencia", "efectivo");
    if (anticipo === null || !metodo) return;
    setOcupado(true);
    try {
      const data = await api("/api/caja/apartados", "POST", { turnoId: turno.id, contactoId, anticipo, metodo, uuidCliente: uuid, partidas: lineas.map((linea) => ({ productoId: linea.producto.id, cantidad: linea.cantidad, descuento: linea.descuento })) });
      limpiarVenta(); toast(data.repetido ? "El apartado ya estaba registrado" : "Apartado registrado y existencia separada"); router.refresh();
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setOcupado(false); }
  }

  async function venderCredito() {
    if (!turno || !contactoId || !lineas.length || ocupado) return;
    setOcupado(true);
    try {
      const data = await api("/api/caja/credito/ventas", "POST", { turnoId: turno.id, contactoId, descuento, uuidCliente: uuid, partidas: lineas.map((linea) => ({ productoId: linea.producto.id, cantidad: linea.cantidad, descuento: linea.descuento })) });
      setVenta(data.venta); limpiarVenta(); toast(data.repetida ? "La venta ya estaba registrada" : "Venta a crédito registrada"); router.refresh();
    } catch (error) { toast((error as Error).message, "error"); }
    finally { setOcupado(false); }
  }

  async function verCorte() {
    if (!turno) return;
    try { setCorte((await api(`/api/caja/turnos/${turno.id}/corte`)).corte); }
    catch (error) { toast((error as Error).message, "error"); }
  }

  async function cerrarTurno() {
    if (!turno) return;
    const efectivoContado = window.prompt("Efectivo contado para el corte Z", String(corte?.efectivoEsperado ?? ""));
    if (efectivoContado === null) return;
    try {
      const data = await api(`/api/caja/turnos/${turno.id}/corte`, "POST", { efectivoContado });
      setCorte(data.corte); setTurno(null); toast(`Corte Z guardado · diferencia ${formatoMoneda(data.corte.diferencia)}`); router.refresh();
    } catch (error) { toast((error as Error).message, "error"); }
  }

  async function mover(tipo: "entrada" | "salida") {
    if (!turno) return;
    const monto = window.prompt(`Monto de ${tipo}`);
    const motivo = monto === null ? null : window.prompt("Motivo");
    if (monto === null || motivo === null) return;
    try { await api("/api/caja/movimientos", "POST", { turnoId: turno.id, tipo, monto, motivo }); toast("Movimiento registrado"); void verCorte(); }
    catch (error) { toast((error as Error).message, "error"); }
  }

  if (!turno) return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <header><h1 className="text-2xl font-bold">Caja de mostrador</h1><p className="text-sm text-muted-foreground">Abre un turno para comenzar a cobrar.</p></header>
      <section className="surface space-y-4 p-5">
        {cajas.length ? <><label className="block text-sm font-medium">Caja<select id="caja-apertura" className="mt-1 w-full rounded-lg border bg-card p-2">{cajas.map((caja) => <option key={caja.id} value={caja.id}>{caja.nombre}{caja.sucursal ? ` · ${caja.sucursal}` : ""}</option>)}</select></label><Boton disabled={ocupado} onClick={abrirTurno}>Abrir turno</Boton></> : usuario.rol === "admin" ? <div className="space-y-2"><p className="text-sm">Crea la primera caja para comenzar.</p><Boton onClick={crearCaja}>+ Crear caja</Boton></div> : <p className="text-sm">No hay cajas activas. Pide a un Admin que cree la primera.</p>}
      </section>
      <Historial turnos={turnosRecientes} />
    </div>
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Caja · {turno.caja.nombre}</h1><p className="text-sm text-muted-foreground">Turno de {turno.usuario.nombre} · F2 cobrar · F4 buscar · Esc quitar última línea</p></div><div className="flex gap-2"><Boton variante="ghost" onClick={() => mover("entrada")}>+ Entrada</Boton><Boton variante="ghost" onClick={() => mover("salida")}>− Salida</Boton><Boton variante="ghost" onClick={verCorte}>Corte X</Boton><Boton variante="danger" onClick={cerrarTurno}>Corte Z</Boton></div></header>
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <section className="space-y-3">
          <input ref={busquedaRef} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} onKeyDown={escanear} placeholder="Escanea código + Enter o busca nombre / SKU (F4)" className="w-full rounded-xl border bg-card px-4 py-3 text-base shadow-soft" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{filtrados.map((producto) => <button key={producto.id} onClick={() => agregar(producto)} className="surface p-3 text-left hover:border-primary"><strong className="block text-sm">{producto.nombre}</strong><span className="text-xs text-muted-foreground">{producto.sku ?? "Sin SKU"} · {producto.stock} {producto.unidad}</span><span className="mt-2 block font-bold text-primary">{formatoMoneda(Number(producto.precio))}</span></button>)}</div>
        </section>
        <aside className="surface h-fit space-y-4 p-4">
          <h2 className="font-bold">Venta actual</h2>
          <div className="max-h-72 space-y-2 overflow-y-auto">{lineas.map((linea, indice) => <div key={linea.producto.id} className="rounded-lg border p-2 text-sm"><div className="flex justify-between gap-2"><strong>{linea.producto.nombre}</strong><button aria-label="Quitar línea" onClick={() => setLineas((actual) => actual.filter((_, i) => i !== indice))}>✕</button></div><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs">Cantidad<input type="number" min="0.001" step={linea.producto.vendePorPeso ? "0.001" : "1"} value={linea.cantidad} onChange={(e) => setLineas((actual) => actual.map((item, i) => i === indice ? { ...item, cantidad: e.target.value } : item))} className="mt-1 w-full rounded border p-1.5" /></label><label className="text-xs">Descuento $<input type="number" min="0" step="0.01" value={linea.descuento} onChange={(e) => setLineas((actual) => actual.map((item, i) => i === indice ? { ...item, descuento: e.target.value } : item))} className="mt-1 w-full rounded border p-1.5" /></label></div></div>)}</div>
          {!lineas.length && <p className="text-sm text-muted-foreground">Escanea o selecciona productos.</p>}
          <div className="text-xs"><label htmlFor="buscar-cliente">Cliente (opcional, busca sin acentos)</label><input id="buscar-cliente" value={busquedaContacto} onChange={(e) => { setBusquedaContacto(e.target.value); setContactoId(""); }} placeholder="Nombre o teléfono" className="mt-1 w-full rounded border p-2" />{contactoId && <button onClick={() => { setContactoId(""); setBusquedaContacto(""); }} className="mt-1 text-primary">Quitar cliente</button>}{contactosEncontrados.length > 0 && !contactoId && <div className="mt-1 max-h-32 overflow-y-auto rounded border bg-card p-1">{contactosEncontrados.map((contacto) => <button key={contacto.id} onClick={() => { setContactoId(contacto.id); setBusquedaContacto(contacto.nombre); }} className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted">{contacto.nombre}{contacto.detalle ? ` · ${contacto.detalle}` : ""}</button>)}</div>}</div>
          <label className="block text-xs">Descuento general $ <span className="text-muted-foreground">(Cajero hasta {descuentoMaximo}%)</span><input type="number" min="0" step="0.01" value={descuento} onChange={(e) => setDescuento(e.target.value)} className="mt-1 w-full rounded border p-2" /></label>
          <div className="space-y-2"><p className="text-xs font-semibold uppercase text-muted-foreground">Cobro mixto</p>{(["efectivo", "tarjeta", "transferencia"] as const).map((metodo) => <label key={metodo} className="grid grid-cols-[1fr_130px] items-center text-sm capitalize"><span>{metodo}</span><input type="number" min="0" step="0.01" value={pagos[metodo]} onChange={(e) => setPagos({ ...pagos, [metodo]: e.target.value })} className="rounded border p-2 text-right" /></label>)}<div className="flex flex-wrap gap-1">{[50,100,200,500,1000].map((billete) => <button key={billete} onClick={() => setPagos({ ...pagos, efectivo: String(billete) })} className="rounded bg-muted px-2 py-1 text-xs">${billete}</button>)}</div></div>
          <div className="border-t pt-3 text-sm"><p className="flex justify-between"><span>Subtotal</span><span>{formatoMoneda(subtotal)}</span></p><p className="flex justify-between"><span>Pagado</span><span>{formatoMoneda(pagado)}</span></p><p className="flex justify-between text-base font-bold"><span>Total</span><span>{formatoMoneda(total)}</span></p><p className="flex justify-between text-success"><span>Cambio</span><span>{formatoMoneda(cambio)}</span></p></div>
          <div className="grid grid-cols-3 gap-2"><Boton className="py-3" disabled={!lineas.length || pagado < total || ocupado} onClick={cobrar}>Cobrar (F2)</Boton><Boton variante="ghost" disabled={!lineas.length || !contactoId || ocupado} onClick={apartar}>Apartar</Boton><Boton variante="ghost" disabled={!lineas.length || !contactoId || ocupado} onClick={venderCredito}>A crédito</Boton></div>
        </aside>
      </div>
      {corte && <section className="surface grid gap-2 p-4 text-sm sm:grid-cols-3"><strong className="sm:col-span-3">Corte {turno ? "X" : "Z"}</strong><span>{corte.ventas} ventas · {formatoMoneda(corte.ventasTotal)}</span><span>Efectivo cobrado {formatoMoneda(corte.efectivoCobrado)}</span><span>Esperado {formatoMoneda(corte.efectivoEsperado)}</span><span>Entradas {formatoMoneda(corte.entradas)}</span><span>Salidas {formatoMoneda(corte.salidas)}</span>{corte.diferencia !== undefined && <b>Diferencia {formatoMoneda(corte.diferencia)}</b>}</section>}
      {venta && <section className="surface space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{venta.folio}</strong><p className="text-sm text-success">Venta registrada</p></div><AbrirTicket ventaId={venta.id}>Imprimir / reimprimir ticket</AbrirTicket></div>{venta.contacto && <TarjetaLealtad contactoId={venta.contacto.id} />}</section>}
      <OperacionesCajaA2 turnoId={turno.id} contactoId={contactoId} puedeConfigurarCredito={usuario.rol === "admin" || normalizar(usuario.puesto) === "encargado de tienda"} />
      <p className="text-xs text-muted-foreground">Perfil: {usuario.puesto}{usuario.rol === "admin" ? " · Admin" : ""}</p>
    </div>
  );
}

function Historial({ turnos }: { turnos: Turno[] }) {
  return <section className="surface overflow-hidden"><h2 className="p-4 font-bold">Cortes recientes</h2><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr className="border-t text-left text-xs uppercase text-muted-foreground"><th className="p-3">Caja</th><th className="p-3">Persona</th><th className="p-3">Apertura</th><th className="p-3">Estado</th><th className="p-3 text-right">Esperado</th><th className="p-3 text-right">Diferencia</th></tr></thead><tbody>{turnos.map((turno) => <tr key={turno.id} className="border-t"><td className="p-3">{turno.caja.nombre}</td><td className="p-3">{turno.usuario.nombre}</td><td className="p-3">{new Date(turno.abiertoAt).toLocaleString("es-MX")}</td><td className="p-3 capitalize">{turno.estado}</td><td className="p-3 text-right">{turno.efectivoEsperado === null ? "—" : formatoMoneda(turno.efectivoEsperado)}</td><td className="p-3 text-right">{turno.diferencia === null ? "—" : formatoMoneda(turno.diferencia)}</td></tr>)}</tbody></table></div></section>;
}
