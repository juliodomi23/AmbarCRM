"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Prisma } from "@prisma/client";
import estilos from "./tienda.module.css";

type Producto = { id: string; nombre: string; descripcion: string | null; categoria: string | null; precio: string; unidad: string; vendePorPeso: boolean; fotoUrl: string | null; etiquetas: string[]; agotado: boolean; disponible: string };
type Catalogo = { negocio: { nombre: string; logo: string | null }; config: { permiteEntrega: boolean; permiteRecoger: boolean; minimoCompra: string; costoEnvio: string }; productos: Producto[] };
type Desglose = { subtotal: string; ivaProductos: string; costoEnvio: string; ivaEnvio: string };

export function TiendaPublica({ slug }: { slug: string }) {
  const router = useRouter();
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("");
  const [carrito, setCarrito] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [desgloseServidor, setDesgloseServidor] = useState<Desglose | null>(null);
  const [tipoEntrega, setTipoEntrega] = useState("recoger");

  useEffect(() => { fetch(`/api/public/tienda/${slug}`).then((r) => r.json()).then((datos) => { setCatalogo(datos); setTipoEntrega(datos.config.permiteRecoger ? "recoger" : "domicilio"); }); }, [slug]);
  const categorias = useMemo(() => [...new Set((catalogo?.productos ?? []).map((p) => p.categoria).filter(Boolean))] as string[], [catalogo]);
  const productos = (catalogo?.productos ?? []).filter((p) => (!categoria || p.categoria === categoria) && `${p.nombre} ${p.descripcion ?? ""}`.toLocaleLowerCase("es-MX").includes(busqueda.toLocaleLowerCase("es-MX")));
  const partidasCarrito = useMemo(() => Object.entries(carrito).filter(([, cantidad]) => Number(cantidad) > 0).map(([productoId, cantidad]) => ({ productoId, cantidad })), [carrito]);
  useEffect(() => {
    if (partidasCarrito.length === 0) { setDesgloseServidor({ subtotal: "0.00", ivaProductos: "0.00", costoEnvio: catalogo?.config.costoEnvio ?? "0.00", ivaEnvio: "0.00" }); return; }
    const controlador = new AbortController();
    const espera = setTimeout(() => {
      fetch(`/api/public/tienda/${slug}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ partidas: partidasCarrito }), signal: controlador.signal })
        .then((respuesta) => respuesta.ok ? respuesta.json() : Promise.reject())
        .then((resultado) => setDesgloseServidor({ subtotal: String(resultado.subtotal), ivaProductos: String(resultado.ivaProductos), costoEnvio: String(resultado.costoEnvio), ivaEnvio: String(resultado.ivaEnvio) }))
        .catch(() => { if (!controlador.signal.aborted) setDesgloseServidor(null); });
    }, 180);
    return () => { clearTimeout(espera); controlador.abort(); };
  }, [partidasCarrito, slug, catalogo?.config.costoEnvio]);
  const subtotal = new Prisma.Decimal(desgloseServidor?.subtotal ?? "0.00");
  const envio = tipoEntrega === "domicilio" ? new Prisma.Decimal(desgloseServidor?.costoEnvio ?? "0.00") : new Prisma.Decimal(0);
  const total = subtotal.plus(envio);

  async function pedir(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault(); setMensaje(""); setEnviando(true);
    const datos = new FormData(evento.currentTarget);
    let uuidCliente = sessionStorage.getItem("uuid-pedido");
    if (!uuidCliente) { uuidCliente = crypto.randomUUID(); sessionStorage.setItem("uuid-pedido", uuidCliente); }
    const body = {
      uuidCliente, nombre: datos.get("nombre"), telefono: datos.get("telefono"), tipoEntrega: datos.get("tipoEntrega"),
      direccion: datos.get("direccion"), horarioDeseado: datos.get("horarioDeseado"), notas: datos.get("notas"),
      partidas: partidasCarrito,
    };
    const respuesta = await fetch(`/api/public/tienda/${slug}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const resultado = await respuesta.json();
    if (respuesta.ok) router.push(`/tienda/pedido/${resultado.token}`);
    else { setMensaje(resultado.error ?? "No se pudo crear el pedido"); setEnviando(false); }
  }

  if (!catalogo) return <main className={estilos.pagina}>Cargando catálogo…</main>;
  return <main className={estilos.pagina}>
    <header className={estilos.encabezado}>{catalogo.negocio.logo && <img src={catalogo.negocio.logo} alt="" /> /* eslint-disable-line @next/next/no-img-element */}<div><span>TIENDA EN LÍNEA</span><h1>{catalogo.negocio.nombre}</h1></div></header>
    <section className={estilos.filtros}><input aria-label="Buscar productos" placeholder="Buscar productos" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /><select aria-label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)}><option value="">Todas las categorías</option>{categorias.map((c) => <option key={c}>{c}</option>)}</select></section>
    <section className={estilos.catalogo}>{productos.map((producto) => <article key={producto.id} className={estilos.producto}>
      {producto.fotoUrl ? <img src={producto.fotoUrl} alt={producto.nombre} /> /* eslint-disable-line @next/next/no-img-element */ : <div className={estilos.sinFoto}>◇</div>}
      <div>{producto.etiquetas.map((e) => <span className={estilos.etiqueta} key={e}>{e}</span>)}<h2>{producto.nombre}</h2><p>{producto.descripcion}</p><strong>${producto.precio} / {producto.unidad}</strong>
        {producto.agotado ? <b className={estilos.agotado}>Agotado</b> : <><small>Disponible: {Number(producto.disponible).toLocaleString("es-MX")} {producto.unidad}</small><input aria-label={`Cantidad de ${producto.nombre}`} type="number" min="0" max={producto.disponible} step={producto.vendePorPeso ? ".001" : "1"} value={carrito[producto.id] ?? ""} onChange={(e) => setCarrito({ ...carrito, [producto.id]: e.target.value })} /></>}
      </div></article>)}</section>
    <form className={estilos.pedido} onSubmit={pedir}><h2>Completa tu pedido</h2><p>El servidor confirma precios y existencia.</p>
      <input name="nombre" required maxLength={120} placeholder="Nombre" /><input name="telefono" required inputMode="tel" placeholder="WhatsApp (10 dígitos)" />
      <select name="tipoEntrega" required value={tipoEntrega} onChange={(evento) => setTipoEntrega(evento.target.value)}>{catalogo.config.permiteRecoger && <option value="recoger">Recoger en tienda</option>}{catalogo.config.permiteEntrega && <option value="domicilio">Entrega a domicilio</option>}</select>
      <input name="direccion" maxLength={500} placeholder="Dirección (si es entrega)" /><input name="horarioDeseado" type="datetime-local" /><textarea name="notas" maxLength={500} placeholder="Notas" />
      <p>Productos: ${subtotal.toFixed(2)} · IVA trasladado: ${desgloseServidor?.ivaProductos ?? "—"}</p>
      {tipoEntrega === "domicilio" && <p>Envío (IVA incluido): ${envio.toFixed(2)} · IVA del envío: ${desgloseServidor?.ivaEnvio ?? "—"}</p>}
      <p>Total: <strong>${total.toFixed(2)}</strong></p>
      <button disabled={enviando || desgloseServidor === null || subtotal.lte(0)}>{enviando ? "Enviando…" : "Hacer pedido"}</button>{mensaje && <p role="alert">{mensaje}</p>}
    </form>
  </main>;
}
