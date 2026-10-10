"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AbrirTicket } from "@/components/caja/BotonImprimir";
import { OperacionesCajaA2 } from "@/components/caja/OperacionesCajaA2";
import { TarjetaLealtad } from "@/components/lealtad/TarjetaLealtad";
import type { ContactoVenta, ProductoRetail } from "@/components/retail/tipos";
import { toast } from "@/components/Toaster";
import { Boton, formatoMoneda } from "@/components/ui";
import { almacenIndexedDB } from "@/lib/caja-offline/almacen";
import { calcularLineaLocal, horasDeCatalogo, leerCatalogoLocal, sincronizarCatalogo, type CatalogoLocal } from "@/lib/caja-offline/catalogo";
import type { ProductoCatalogoCaja } from "@/lib/caja-offline/tipos";
import { descartarVenta, encolarVenta, folioSinRed, listarCola, reintentarVenta, subirCola, type VentaEnCola } from "@/lib/caja-offline/cola";

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

class ErrorRed extends Error {}

async function api(url: string, method = "GET", body?: unknown) {
  const respuesta = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => { throw new ErrorRed("Esta acción necesita internet"); });
  const payload = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(payload.error ?? "No se pudo completar la operación");
  return payload;
}

function aProductoRetail(producto: ProductoCatalogoCaja): ProductoRetail {
  return {
    id: producto.id, grupoId: null, atributos: {}, sku: producto.sku, codigoBarras: producto.codigoBarras,
    nombre: producto.nombre, categoria: producto.categoria, descripcion: null, precio: Number(producto.precio),
    costo: 0, stock: Number(producto.stock), stockMinimo: 0, unidad: producto.unidad, vendePorPeso: producto.vendePorPeso,
    moneda: "MXN", fotoUrl: null, visibleEnLinea: false, agotadoManual: false, etiquetasEnLinea: [], activo: true,
  } as unknown as ProductoRetail;
}

const MINUTOS_REFRESCO_CATALOGO = 10;

export function CajaCliente({
  cajas,
  productos,
  turnoInicial,
  turnosRecientes,
  descuentoMaximo,
  usuario,
  identidad,
  ventasSinRed,
}: {
  cajas: Caja[];
  productos: ProductoRetail[];
  turnoInicial: Turno | null;
  turnosRecientes: Turno[];
  descuentoMaximo: number;
  usuario: { rol: string; puesto: string };
  identidad: { orgId: string; userId: string };
  ventasSinRed: boolean;
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
  const [pagos, setPagos] = useState({ efectivo: "", tarjeta: "", transferencia: "", nota_credito: "" });
  const [uuid, setUuid] = useState(() => crypto.randomUUID());
  const [ocupado, setOcupado] = useState(false);
  const [corte, setCorte] = useState<Corte | null>(null);
  const [venta, setVenta] = useState<VentaResultado | null>(null);
  const [catalogoLocal, setCatalogoLocal] = useState<CatalogoLocal | null>(null);
  const [enLinea, setEnLinea] = useState(true);
  const [modoSinRed, setModoSinRed] = useState(ventasSinRed);
  const [cola, setCola] = useState<VentaEnCola[]>([]);
  const [sesionCaducada, setSesionCaducada] = useState(false);
  const [ventaLocal, setVentaLocal] = useState<VentaEnCola | null>(null);

  useEffect(() => {
    if (!ventasSinRed) return;
    const almacen = almacenIndexedDB();
    let activo = true;
    const sincronizar = async () => {
      const resultado = await sincronizarCatalogo(almacen, identidad);
      if (!activo) return;
      if (resultado.estado === "actualizado" || resultado.estado === "local") setCatalogoLocal(resultado.datos);
      if (resultado.estado === "apagado") { setCatalogoLocal(null); setModoSinRed(false); }
    };
    void leerCatalogoLocal(almacen, identidad).then((local) => { if (activo && local) setCatalogoLocal(local); });
    void sincronizar();
    const alVolver = () => { setEnLinea(true); void sincronizar(); };
    const alPerder = () => setEnLinea(false);
    setEnLinea(navigator.onLine);
    window.addEventListener("online", alVolver);
    window.addEventListener("offline", alPerder);
    const intervalo = window.setInterval(() => { if (navigator.onLine) void sincronizar(); }, MINUTOS_REFRESCO_CATALOGO * 60_000);
    return () => {
      activo = false;
      window.removeEventListener("online", alVolver);
      window.removeEventListener("offline", alPerder);
      window.clearInterval(intervalo);
    };
  }, [ventasSinRed, identidad]);

  useEffect(() => {
    if (!ventasSinRed) return;
    const almacen = almacenIndexedDB();
    let activo = true;
    const refrescar = async () => { const lista = await listarCola(almacen, identidad); if (activo) setCola(lista); };
    const subir = async () => {
      if (!navigator.onLine) return;
      const ejecutar = async () => {
        const resultado = await subirCola(almacen, identidad);
        await refrescar();
        if (!activo) return;
        setSesionCaducada(resultado.estado === "sesion");
        if (resultado.estado === "apagado") setModoSinRed(false);
        if (resultado.subidas > 0) { toast(`${resultado.subidas} venta(s) hechas sin internet ya se subieron`); router.refresh(); }
      };
      if (navigator.locks) await navigator.locks.request("ambar-caja-subida", { ifAvailable: true }, async (candado) => { if (candado) await ejecutar(); });
      else await ejecutar();
    };
    void refrescar().then(subir);
    const alVolver = () => void subir();
    window.addEventListener("online", alVolver);
    const intervalo = window.setInterval(() => void subir(), 30_000);
    const alEncolar = () => void refrescar();
    window.addEventListener("ambar-cola-cambio", alEncolar);
    return () => {
      activo = false;
      window.removeEventListener("online", alVolver);
      window.removeEventListener("ambar-cola-cambio", alEncolar);
      window.clearInterval(intervalo);
    };
  }, [ventasSinRed, identidad, router]);

  const productosCaja = useMemo(
    () => (catalogoLocal ? catalogoLocal.catalogo.productos.map(aProductoRetail) : productos),
    [catalogoLocal, productos],
  );

  const filtrados = useMemo(() => {
    const termino = normalizar(busqueda.trim());
    if (!termino) return productosCaja.slice(0, 18);
    return productosCaja.filter((producto) =>
      [producto.nombre, producto.sku, producto.codigoBarras]
        .filter(Boolean)
        .some((valor) => normalizar(String(valor)).includes(termino)),
    ).slice(0, 18);
  }, [busqueda, productosCaja]);
  const calculoLineas = useMemo(() => {
    if (!catalogoLocal) return null;
    const porId = new Map(catalogoLocal.catalogo.productos.map((producto) => [producto.id, producto]));
    return lineas.map((linea) => {
      const producto = porId.get(linea.producto.id);
      return producto && Number(linea.cantidad) > 0 ? calcularLineaLocal(catalogoLocal.catalogo, producto, linea.cantidad) : null;
    });
  }, [catalogoLocal, lineas]);
  const subtotal = calculoLineas
    ? lineas.reduce((suma, linea, indice) => suma + Number(calculoLineas[indice]?.bruto ?? Number(linea.producto.precio) * Number(linea.cantidad || 0)), 0)
    : lineas.reduce((suma, linea) => suma + Number(linea.producto.precio) * Number(linea.cantidad || 0), 0);
  const descuentoPromociones = calculoLineas
    ? calculoLineas.reduce((suma, calculo) => suma + Number(calculo?.descuentoPromocion ?? 0), 0)
    : 0;
  const descuentoLineas = lineas.reduce((suma, linea) => suma + dinero(linea.descuento), 0) + descuentoPromociones;
  const total = Math.max(0, subtotal - descuentoLineas - dinero(descuento));
  const pagado = Object.values(pagos).reduce((suma, monto) => suma + dinero(monto), 0);
  const cambio = Math.max(0, pagado - total);
  const puedeVerReportes = usuario.rol === "admin" || usuario.puesto.trim().toLocaleLowerCase("es-MX") === "encargado de tienda";

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
    const exacto = productosCaja.find((producto) => producto.codigoBarras === busqueda.trim() || producto.sku?.toLowerCase() === busqueda.trim().toLowerCase());
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

  async function cobrarSinRed() {
    if (!turno || !catalogoLocal) {
      toast("Sin internet: conéctate una vez para descargar el catálogo", "error");
      return;
    }
    if (contactoId) return toast("Sin internet no se puede vender a un cliente: quítalo de la venta", "error");
    if (dinero(pagos.nota_credito) > 0) return toast("Sin internet no se aceptan notas de crédito", "error");
    const baseTrasPromocion = subtotal - descuentoPromociones;
    const manual = descuentoLineas - descuentoPromociones + dinero(descuento);
    const porcentaje = baseTrasPromocion > 0 ? (manual * 100) / baseTrasPromocion : 0;
    if (!catalogoLocal.sinTopeDescuento && porcentaje > catalogoLocal.catalogo.descuentoMaximo) {
      return toast(`Sin internet el descuento no puede pasar de ${catalogoLocal.catalogo.descuentoMaximo}%`, "error");
    }
    if (pagado < total) return toast("El pago no cubre el total", "error");
    const registro: VentaEnCola = {
      uuidCliente: uuid,
      folio: folioSinRed(uuid),
      identidad,
      turnoId: turno.id,
      vendidaAt: new Date().toISOString(),
      partidas: lineas.map((linea, indice) => ({
        productoId: linea.producto.id,
        nombre: linea.producto.nombre,
        cantidad: linea.cantidad,
        descuento: linea.descuento || "0",
        precioUnitario: calculoLineas?.[indice]?.precioUnitario ?? String(linea.producto.precio),
        total: calculoLineas?.[indice]?.total ?? (Number(linea.producto.precio) * Number(linea.cantidad)).toFixed(2),
      })),
      pagos: (["efectivo", "tarjeta", "transferencia"] as const)
        .filter((metodo) => dinero(pagos[metodo]) > 0)
        .map((metodo) => ({ metodo, monto: pagos[metodo] })),
      descuento: descuento || "0",
      totalCobrado: total.toFixed(2),
      cambio: cambio.toFixed(2),
      catalogoVersion: catalogoLocal.catalogo.version,
      estado: "pendiente",
      intentos: 0,
      proximoIntentoAt: null,
      ultimoError: null,
      codigo: null,
    };
    await encolarVenta(almacenIndexedDB(), registro);
    window.dispatchEvent(new Event("ambar-cola-cambio"));
    setVentaLocal(registro);
    limpiarVenta();
    toast(`Venta ${registro.folio} guardada sin internet; se subirá al volver la conexión`);
  }

  async function cobrar() {
    if (!turno || lineas.length === 0 || ocupado) return;
    if (modoSinRed && !navigator.onLine) return cobrarSinRed();
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
      setVenta(data.venta); setVentaLocal(null); limpiarVenta();
      toast(data.repetida ? "La venta ya estaba registrada" : `Venta ${data.venta.folio} cobrada`);
      router.refresh();
    } catch (error) {
      if (modoSinRed && error instanceof ErrorRed) { setOcupado(false); return cobrarSinRed(); }
      toast((error as Error).message, "error");
    }
    finally { setOcupado(false); }
  }

  function limpiarVenta() {
    setLineas([]); setDescuento("0"); setPagos({ efectivo: "", tarjeta: "", transferencia: "", nota_credito: "" }); setUuid(crypto.randomUUID());
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
    if (cola.length > 0) return toast(`Hay ${cola.length} venta(s) sin subir: espera a que se suban antes del corte Z`, "error");
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

  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "F2") { evento.preventDefault(); void cobrar(); }
      if (evento.key === "F4") { evento.preventDefault(); busquedaRef.current?.focus(); }
      if (evento.key === "Escape" && lineas.length) setLineas((actual) => actual.slice(0, -1));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  if (!turno) return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <div hidden data-caja-identidad={`${identidad.orgId}:${identidad.userId}`} />
      {modoSinRed && <EstadoSinRed enLinea={enLinea} catalogo={catalogoLocal} />}
      <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">Caja de mostrador</h1><p className="text-sm text-muted-foreground">Abre un turno para comenzar a cobrar.</p></div>{puedeVerReportes && <Link className="rounded-lg bg-muted px-4 py-2 text-sm font-medium" href="/reportes-retail">Ver reportes</Link>}</header>
      <section className="surface space-y-4 p-5">
        {cajas.length ? <><label className="block text-sm font-medium">Caja<select id="caja-apertura" className="mt-1 w-full rounded-lg border bg-card p-2">{cajas.map((caja) => <option key={caja.id} value={caja.id}>{caja.nombre}{caja.sucursal ? ` · ${caja.sucursal}` : ""}</option>)}</select></label><Boton disabled={ocupado} onClick={abrirTurno}>Abrir turno</Boton></> : usuario.rol === "admin" ? <div className="space-y-2"><p className="text-sm">Crea la primera caja para comenzar.</p><Boton onClick={crearCaja}>+ Crear caja</Boton></div> : <p className="text-sm">No hay cajas activas. Pide a un Admin que cree la primera.</p>}
      </section>
      {usuario.rol === "admin" && <AjusteSinRed activo={ventasSinRed} />}
      <Historial turnos={turnosRecientes} />
    </div>
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div hidden data-caja-identidad={`${identidad.orgId}:${identidad.userId}`} />
      {modoSinRed && <EstadoSinRed enLinea={enLinea} catalogo={catalogoLocal} />}
      <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Caja · {turno.caja.nombre}</h1><p className="text-sm text-muted-foreground">Turno de {turno.usuario.nombre} · F2 cobrar · F4 buscar · Esc quitar última línea</p></div><div className="flex flex-wrap gap-2">{puedeVerReportes && <Link className="rounded-lg bg-muted px-4 py-2 text-sm font-medium" href="/reportes-retail">Reportes</Link>}<Boton variante="ghost" onClick={() => mover("entrada")}>+ Entrada</Boton><Boton variante="ghost" onClick={() => mover("salida")}>− Salida</Boton><Boton variante="ghost" onClick={verCorte}>Corte X</Boton><Boton variante="danger" onClick={cerrarTurno}>Corte Z</Boton></div></header>
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
          <div className="space-y-2"><p className="text-xs font-semibold uppercase text-muted-foreground">Cobro mixto</p>{(["efectivo", "tarjeta", "transferencia", "nota_credito"] as const).map((metodo) => <label key={metodo} className="grid grid-cols-[1fr_130px] items-center text-sm capitalize"><span>{metodo.replace("_", " ")}</span><input type="number" min="0" step="0.01" value={pagos[metodo]} disabled={metodo === "nota_credito" && !contactoId} onChange={(e) => setPagos({ ...pagos, [metodo]: e.target.value })} className="rounded border p-2 text-right disabled:opacity-50" /></label>)}<div className="flex flex-wrap gap-1">{[50,100,200,500,1000].map((billete) => <button key={billete} onClick={() => setPagos({ ...pagos, efectivo: String(billete) })} className="rounded bg-muted px-2 py-1 text-xs">${billete}</button>)}</div></div>
          <div className="border-t pt-3 text-sm"><p className="flex justify-between"><span>Subtotal</span><span>{formatoMoneda(subtotal)}</span></p><p className="flex justify-between"><span>Pagado</span><span>{formatoMoneda(pagado)}</span></p><p className="flex justify-between text-base font-bold"><span>Total</span><span>{formatoMoneda(total)}</span></p><p className="flex justify-between text-success"><span>Cambio</span><span>{formatoMoneda(cambio)}</span></p></div>
          <div className="grid grid-cols-3 gap-2"><Boton className="py-3" disabled={!lineas.length || pagado < total || ocupado} onClick={cobrar}>Cobrar (F2)</Boton><Boton variante="ghost" disabled={!lineas.length || !contactoId || ocupado || (modoSinRed && !enLinea)} onClick={apartar}>Apartar</Boton><Boton variante="ghost" disabled={!lineas.length || !contactoId || ocupado || (modoSinRed && !enLinea)} onClick={venderCredito}>A crédito</Boton></div>
        </aside>
      </div>
      {corte && <section className="surface grid gap-2 p-4 text-sm sm:grid-cols-3"><strong className="sm:col-span-3">Corte {turno ? "X" : "Z"}</strong><span>{corte.ventas} ventas · {formatoMoneda(corte.ventasTotal)}</span><span>Efectivo cobrado {formatoMoneda(corte.efectivoCobrado)}</span><span>Esperado {formatoMoneda(corte.efectivoEsperado)}</span><span>Entradas {formatoMoneda(corte.entradas)}</span><span>Salidas {formatoMoneda(corte.salidas)}</span>{corte.diferencia !== undefined && <b>Diferencia {formatoMoneda(corte.diferencia)}</b>}</section>}
      {modoSinRed && <PanelCola cola={cola} sesionCaducada={sesionCaducada} identidad={identidad} />}
      {ventaLocal && <section className="surface p-4 text-sm"><strong>{ventaLocal.folio}</strong><p className="text-amber-700">Guardada sin internet · total {formatoMoneda(Number(ventaLocal.totalCobrado))}. Se subirá sola al volver la conexión.</p></section>}
      {venta && <section className="surface space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{venta.folio}</strong><p className="text-sm text-success">Venta registrada</p></div><AbrirTicket ventaId={venta.id}>Imprimir / reimprimir ticket</AbrirTicket></div>{venta.contacto && <TarjetaLealtad contactoId={venta.contacto.id} />}</section>}
      <OperacionesCajaA2 turnoId={turno.id} contactoId={contactoId} puedeConfigurarCredito={usuario.rol === "admin" || normalizar(usuario.puesto) === "encargado de tienda"} />
      <p className="text-xs text-muted-foreground">Perfil: {usuario.puesto}{usuario.rol === "admin" ? " · Admin" : ""}</p>
    </div>
  );
}

function PanelCola({ cola, sesionCaducada, identidad }: { cola: VentaEnCola[]; sesionCaducada: boolean; identidad: { orgId: string; userId: string } }) {
  if (cola.length === 0 && !sesionCaducada) return null;
  const refrescar = () => window.dispatchEvent(new Event("ambar-cola-cambio"));
  return <section className="surface space-y-2 border-amber-500 p-4 text-sm">
    <h2 className="font-bold">Ventas hechas sin internet · {cola.length} por subir</h2>
    {sesionCaducada && <p className="text-red-700">Tu sesión caducó: <Link className="underline" href="/login">inicia sesión</Link> para subirlas. Se conservan en este equipo.</p>}
    {cola.map((venta) => <div key={venta.uuidCliente} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
      <span><b>{venta.folio}</b> · {formatoMoneda(Number(venta.totalCobrado))} · {new Date(venta.vendidaAt).toLocaleString("es-MX")}</span>
      <span className={venta.estado === "error" ? "text-red-700" : "text-muted-foreground"}>
        {venta.estado === "error" ? `Error: ${venta.ultimoError} (avisa al Encargado)` : venta.estado === "esperando_turno" ? "Abre turno para subirla" : venta.intentos ? `Reintentando (${venta.intentos})` : "En espera"}
      </span>
      {venta.estado === "error" && <span className="flex gap-2">
        <button className="underline" onClick={async () => { await reintentarVenta(almacenIndexedDB(), venta); refrescar(); }}>Reintentar</button>
        <button className="underline" onClick={async () => { if (window.confirm(`¿Descartar ${venta.folio}? El rechazo queda registrado para el Encargado.`)) { await descartarVenta(almacenIndexedDB(), venta); refrescar(); } }}>Descartar</button>
      </span>}
    </div>)}
    <p className="text-xs text-muted-foreground">Cuenta {identidad.userId}</p>
  </section>;
}

function EstadoSinRed({ enLinea, catalogo }: { enLinea: boolean; catalogo: CatalogoLocal | null }) {
  const horas = catalogo ? horasDeCatalogo(catalogo) : null;
  return <p className={`rounded-lg border px-3 py-2 text-xs ${enLinea ? "text-muted-foreground" : "border-amber-500 bg-amber-50 text-amber-900"}`}>
    {enLinea ? "Con internet" : "Sin internet"} · {catalogo ? `catálogo ${catalogo.catalogo.version} de hace ${horas! < 1 ? "menos de 1 h" : `${Math.floor(horas!)} h`}${horas! > 24 ? " (desactualizado: conéctate para refrescarlo)" : ""}` : "catálogo no descargado: conéctate una vez para usar la caja sin internet"}
  </p>;
}

function AjusteSinRed({ activo }: { activo: boolean }) {
  const router = useRouter();
  async function cambiar(valor: boolean) {
    try {
      await api("/api/modulos", "PATCH", { clave: "caja", config: { ventasSinRed: valor } });
      toast(valor ? "Ventas sin internet activadas" : "Ventas sin internet apagadas");
      router.refresh();
    } catch (error) { toast((error as Error).message, "error"); }
  }
  return <section className="surface space-y-2 p-4 text-sm">
    <h2 className="font-bold">Ventas sin internet</h2>
    <p className="text-xs text-muted-foreground">Apagado por defecto. Al activarlo, las cajas guardan las ventas si se cae la red y las suben después, respetando lo cobrado y sin exigir existencia. Las ventas quedan marcadas para revisión.</p>
    <label className="flex items-center gap-2"><input type="checkbox" checked={activo} onChange={(e) => void cambiar(e.target.checked)} />Permitir ventas sin internet en esta empresa</label>
  </section>;
}

function Historial({ turnos }: { turnos: Turno[] }) {
  return <section className="surface overflow-hidden"><h2 className="p-4 font-bold">Cortes recientes</h2><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr className="border-t text-left text-xs uppercase text-muted-foreground"><th className="p-3">Caja</th><th className="p-3">Persona</th><th className="p-3">Apertura</th><th className="p-3">Estado</th><th className="p-3 text-right">Esperado</th><th className="p-3 text-right">Diferencia</th></tr></thead><tbody>{turnos.map((turno) => <tr key={turno.id} className="border-t"><td className="p-3">{turno.caja.nombre}</td><td className="p-3">{turno.usuario.nombre}</td><td className="p-3">{new Date(turno.abiertoAt).toLocaleString("es-MX")}</td><td className="p-3 capitalize">{turno.estado}</td><td className="p-3 text-right">{turno.efectivoEsperado === null ? "—" : formatoMoneda(turno.efectivoEsperado)}</td><td className="p-3 text-right">{turno.diferencia === null ? "—" : formatoMoneda(turno.diferencia)}</td></tr>)}</tbody></table></div></section>;
}
