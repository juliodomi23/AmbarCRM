"use client";

import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";

type Opcion = { id: string; nombre: string; sku?: string | null };
type Datos = {
  productos: Opcion[];
  contactos: Array<Opcion & { listaPrecioId: string | null }>;
  listas: Array<{ id: string; nombre: string; tipo: string }>;
  escalas: Array<{ id: string; desde: string; precio: string; producto: { nombre: string } }>;
  promociones: Array<{ id: string; nombre: string; tipo: string; inicia: string; termina: string; producto: { nombre: string } | null; categoria: string | null }>;
};

export function PreciosCliente({ datos }: { datos: Datos }) {
  const router = useRouter();
  async function enviar(evento: React.FormEvent<HTMLFormElement>, accion: string) {
    evento.preventDefault();
    const body = Object.fromEntries(new FormData(evento.currentTarget));
    const respuesta = await fetch("/api/precios", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accion, ...body }) });
    const resultado = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) return toast(resultado.error ?? "No se pudo guardar", "error");
    toast("Configuración de precios guardada"); router.refresh();
  }
  const campo = "rounded-lg border bg-card px-3 py-2 text-sm";
  return <main className="space-y-5 p-4 md:p-6"><header><h1 className="text-2xl font-bold">Precios y promociones</h1><p className="text-sm text-muted-foreground">Volumen → lista del cliente → mejor promoción vigente.</p></header>
    <section className="grid gap-4 lg:grid-cols-2">
      <Formulario titulo="Nueva lista" onSubmit={(e) => enviar(e, "lista")}><input className={campo} name="nombre" required placeholder="Nombre"/><select className={campo} name="tipo"><option value="cliente">Cliente</option><option value="mayoreo">Mayoreo</option><option value="publico">Pública (tienda)</option></select></Formulario>
      <Formulario titulo="Escala por volumen" onSubmit={(e) => enviar(e, "volumen")}><ProductoSelect className={campo} productos={datos.productos}/><input className={campo} name="desde" type="number" min=".001" step=".001" required placeholder="Desde cantidad"/><input className={campo} name="precio" type="number" min="0" step=".01" required placeholder="Precio unitario"/></Formulario>
      <Formulario titulo="Precio dentro de lista" onSubmit={(e) => enviar(e, "precio_lista")}><select className={campo} name="listaId" required><option value="">Lista</option>{datos.listas.map((lista) => <option value={lista.id} key={lista.id}>{lista.nombre}</option>)}</select><ProductoSelect className={campo} productos={datos.productos}/><input className={campo} name="precio" type="number" min="0" step=".01" required placeholder="Precio"/></Formulario>
      <Formulario titulo="Asignar lista a cliente" onSubmit={(e) => enviar(e, "asignar_lista")}><select className={campo} name="contactoId" required><option value="">Cliente</option>{datos.contactos.map((contacto) => <option value={contacto.id} key={contacto.id}>{contacto.nombre}</option>)}</select><select className={campo} name="listaId"><option value="">Sin lista</option>{datos.listas.map((lista) => <option value={lista.id} key={lista.id}>{lista.nombre}</option>)}</select></Formulario>
      <Formulario titulo="Nueva promoción" onSubmit={(e) => enviar(e, "promocion")}><input className={campo} name="nombre" required placeholder="Nombre que verá el cliente"/><select className={campo} name="tipo"><option value="porcentaje">Porcentaje</option><option value="monto">Monto por unidad</option><option value="precio_especial">Precio especial</option><option value="nxm">NxM</option></select><ProductoSelect className={campo} productos={datos.productos} opcional/><input className={campo} name="categoria" placeholder="O categoría"/><input className={campo} name="valor" type="number" min="0" step=".01" placeholder="% / monto / precio"/><input className={campo} name="cantidadCompra" type="number" min="2" placeholder="N (ej. 3)"/><input className={campo} name="cantidadPaga" type="number" min="1" placeholder="M (ej. 2)"/><input className={campo} name="inicia" type="date" required/><input className={campo} name="termina" type="date" required/></Formulario>
    </section>
    <section className="grid gap-4 lg:grid-cols-2"><Resumen titulo="Escalas" filas={datos.escalas.map((escala) => `${escala.producto.nombre}: ${escala.desde}+ a $${escala.precio}`)}/><Resumen titulo="Promociones" filas={datos.promociones.map((promo) => `${promo.nombre} · ${promo.producto?.nombre ?? promo.categoria} · ${promo.inicia.slice(0,10)} a ${promo.termina.slice(0,10)}`)}/></section>
  </main>;
}

function Formulario({ titulo, onSubmit, children }: { titulo: string; onSubmit: (evento: React.FormEvent<HTMLFormElement>) => void; children: React.ReactNode }) { return <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-xl border bg-card p-4"><h2 className="font-semibold">{titulo}</h2>{children}<button className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">Guardar</button></form>; }
function ProductoSelect({ productos, className, opcional = false }: { productos: Opcion[]; className: string; opcional?: boolean }) { return <select className={className} name="productoId" required={!opcional}><option value="">{opcional ? "Todos los de una categoría" : "Producto"}</option>{productos.map((producto) => <option value={producto.id} key={producto.id}>{producto.nombre}{producto.sku ? ` · ${producto.sku}` : ""}</option>)}</select>; }
function Resumen({ titulo, filas }: { titulo: string; filas: string[] }) { return <div className="rounded-xl border bg-card p-4"><h2 className="font-semibold">{titulo}</h2>{filas.length ? filas.map((fila, i) => <p className="border-t py-2 text-sm" key={`${fila}-${i}`}>{fila}</p>) : <p className="mt-2 text-sm text-muted-foreground">Sin registros.</p>}</div>; }
