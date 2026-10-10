import { redirect } from "next/navigation";
import { EnlacePublico } from "@/components/reservas/EnlacePublico";
import { GestionCatalogo } from "@/components/pedidos/GestionCatalogo";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { configPedidos } from "@/lib/pedidos";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PedidosEnLineaPage() {
  const sesion = await getSesion();
  if (!sesion?.user?.orgId) redirect("/login");
  if (!(await moduloActivo("pedidos_en_linea"))) redirect("/");
  const [org, modulo, productos, pedidos] = await Promise.all([
    db.org.findUnique({ where: { id: BigInt(sesion.user.orgId) }, select: { slug: true } }),
    db.moduloOrg.findFirst({ where: { clave: "pedidos_en_linea" }, select: { config: true } }),
    db.producto.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true, precio: true, unidad: true, visibleEnLinea: true, agotadoManual: true, etiquetasEnLinea: true } }),
    db.venta.findMany({ where: { canal: "tienda_en_linea" }, include: { contacto: { select: { nombre: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const config = configPedidos(modulo?.config);
  const esAdmin = sesion.user.rol === "admin";
  const enlace = `${(process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "")}/tienda/${org?.slug ?? ""}`;
  return <div className="space-y-5 p-4 md:p-6"><header><h1 className="text-2xl font-bold">Pedidos en línea</h1><p className="text-sm text-muted-foreground">Publica tu catálogo, recibe pedidos y controla la disponibilidad real.</p></header><EnlacePublico url={enlace} />
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"><div><h2 className="font-semibold">Ajustes</h2><p className="text-xs text-muted-foreground">Mínimo ${config.minimoCompra.toFixed(2)} · envío ${config.costoEnvio.toFixed(2)} · máximo {config.maxPorTelefono} por teléfono y {config.maxPorIp} por IP cada 24 h · vence en {config.horasVencimiento} h.</p></div>{esAdmin && <FormularioModulo boton="Cambiar" titulo="Ajustes de pedidos" endpoint="/api/pedidos-en-linea/ajustes" discreto valores={{ permiteEntrega: String(config.permiteEntrega), permiteRecoger: String(config.permiteRecoger), minimoCompra: config.minimoCompra.toFixed(2), costoEnvio: config.costoEnvio.toFixed(2), maxPorTelefono: String(config.maxPorTelefono), maxPorIp: String(config.maxPorIp), horasVencimiento: String(config.horasVencimiento), plantillaNombre: config.plantillaPedido?.name ?? "", plantillaIdioma: config.plantillaPedido?.language ?? "es_MX" }} campos={[{ nombre: "permiteEntrega", etiqueta: "Entrega a domicilio", tipo: "seleccion", opciones: [{ valor: "true", etiqueta: "Sí" }, { valor: "false", etiqueta: "No" }] }, { nombre: "permiteRecoger", etiqueta: "Recoger en tienda", tipo: "seleccion", opciones: [{ valor: "true", etiqueta: "Sí" }, { valor: "false", etiqueta: "No" }] }, { nombre: "minimoCompra", etiqueta: "Compra mínima", tipo: "dinero" }, { nombre: "costoEnvio", etiqueta: "Costo de envío", tipo: "dinero" }, { nombre: "maxPorTelefono", etiqueta: "Pedidos por teléfono / 24 h", tipo: "numero" }, { nombre: "maxPorIp", etiqueta: "Pedidos por IP / 24 h", tipo: "numero" }, { nombre: "horasVencimiento", etiqueta: "Horas para vencer pendientes", tipo: "numero" }, { nombre: "plantillaNombre", etiqueta: "Plantilla aprobada de WhatsApp (opcional)", tipo: "texto", ayuda: "Se usa fuera de la ventana de 24 horas" }, { nombre: "plantillaIdioma", etiqueta: "Idioma de plantilla", tipo: "texto" }]} />}</section>
    <GestionCatalogo productos={serializar(productos)} esAdmin={esAdmin} />
    <section className="rounded-xl border bg-card p-4"><h2 className="mb-3 font-semibold">Pedidos recientes</h2>{pedidos.length === 0 ? <p className="text-sm text-muted-foreground">Aún no hay pedidos.</p> : pedidos.map((pedido) => <div key={String(pedido.id)} className="flex justify-between border-t py-2 text-sm"><span><b>{pedido.folio}</b> · {pedido.contacto?.nombre ?? "Cliente"}</span><span>{pedido.estado} · ${pedido.total.toFixed(2)}</span></div>)}</section>
  </div>;
}
