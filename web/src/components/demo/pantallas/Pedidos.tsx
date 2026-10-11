"use client";

// Pedidos en línea: el page.tsx real compone la pantalla en línea; aquí se repite con los mismos componentes.
import { EnlacePublico } from "@/components/reservas/EnlacePublico";
import { GestionCatalogo } from "@/components/pedidos/GestionCatalogo";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { Badge, EncabezadoPagina, type TonoBadge } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { useDatos } from "@/lib/demo/usar-almacen";

const TONO_PEDIDO: Record<string, TonoBadge> = { pendiente: "warning", pagada: "success", preparando: "info", lista: "info", entregada: "success", cancelada: "destructive" };

export function PantallaPedidos() {
  const d = useDatos();
  const esAdmin = d.usuarios[0].rol === "admin";
  const c = (d.modulos.pedidos_en_linea?.config ?? {}) as Record<string, any>;
  const config = {
    permiteEntrega: c.permiteEntrega !== false, permiteRecoger: c.permiteRecoger !== false, minimoCompra: Number(c.minimoCompra ?? 0), costoEnvio: Number(c.costoEnvio ?? 0),
    maxPorTelefono: Number(c.maxPorTelefono ?? 3), maxPorIp: Number(c.maxPorIp ?? 10), horasVencimiento: Number(c.horasVencimiento ?? 48), plantillaPedido: c.plantillaPedido as { name: string; language: string } | undefined,
  };
  const enlace = "https://demo.ambarcrm.com/tienda/casa-ambar-demo";
  const productos = (d.extra.productos ?? []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map((p) => ({ id: p.id, nombre: p.nombre, precio: String(p.precio), unidad: p.unidad, visibleEnLinea: p.visibleEnLinea, agotadoManual: p.agotadoManual, etiquetasEnLinea: p.etiquetasEnLinea as string[] }));
  const pedidos = (d.extra.ventas ?? []).filter((v) => v.canal === "tienda_en_linea").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50).map((v) => ({ id: v.id, folio: v.folio as string, estado: v.estado as string, total: Number(v.total), contacto: { nombre: d.contactos.find((x) => x.id === v.contactoId)?.nombre ?? "" } }));
  return <div className="space-y-5 p-4 md:p-6"><EncabezadoPagina titulo="Pedidos en línea" descripcion="Publica tu catálogo, recibe pedidos y controla la disponibilidad real." /><EnlacePublico url={enlace} />
    <section className="surface flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 className="font-semibold">Ajustes</h2><p className="text-xs text-muted-foreground">Mínimo ${config.minimoCompra.toFixed(2)} · envío ${config.costoEnvio.toFixed(2)} · máximo {config.maxPorTelefono} por teléfono y {config.maxPorIp} por IP cada 24 h · vence en {config.horasVencimiento} h.</p></div>{esAdmin && <FormularioModulo boton="Cambiar" titulo="Ajustes de pedidos" endpoint="/api/pedidos-en-linea/ajustes" discreto valores={{ permiteEntrega: String(config.permiteEntrega), permiteRecoger: String(config.permiteRecoger), minimoCompra: config.minimoCompra.toFixed(2), costoEnvio: config.costoEnvio.toFixed(2), maxPorTelefono: String(config.maxPorTelefono), maxPorIp: String(config.maxPorIp), horasVencimiento: String(config.horasVencimiento), plantillaNombre: config.plantillaPedido?.name ?? "", plantillaIdioma: config.plantillaPedido?.language ?? "es_MX" }} campos={[{ nombre: "permiteEntrega", etiqueta: "Entrega a domicilio", tipo: "seleccion", opciones: [{ valor: "true", etiqueta: "Sí" }, { valor: "false", etiqueta: "No" }] }, { nombre: "permiteRecoger", etiqueta: "Recoger en tienda", tipo: "seleccion", opciones: [{ valor: "true", etiqueta: "Sí" }, { valor: "false", etiqueta: "No" }] }, { nombre: "minimoCompra", etiqueta: "Compra mínima", tipo: "dinero" }, { nombre: "costoEnvio", etiqueta: "Costo de envío", tipo: "dinero" }, { nombre: "maxPorTelefono", etiqueta: "Pedidos por teléfono / 24 h", tipo: "numero" }, { nombre: "maxPorIp", etiqueta: "Pedidos por IP / 24 h", tipo: "numero" }, { nombre: "horasVencimiento", etiqueta: "Horas para vencer pendientes", tipo: "numero" }, { nombre: "plantillaNombre", etiqueta: "Plantilla aprobada de WhatsApp (opcional)", tipo: "texto", ayuda: "Se usa fuera de la ventana de 24 horas" }, { nombre: "plantillaIdioma", etiqueta: "Idioma de plantilla", tipo: "texto" }]} />}</section>
    <GestionCatalogo productos={productos} esAdmin={esAdmin} />
    <section className="surface p-4"><h2 className="mb-3 font-semibold">Pedidos recientes</h2>{pedidos.length === 0 ? <EmptyState titulo="Aún no hay pedidos" descripcion="Cuando un cliente compre desde tu tienda en línea, el pedido aparecerá aquí." /> : pedidos.map((pedido) => <div key={String(pedido.id)} className="fila-lista -mx-2 flex items-center justify-between gap-3 rounded-md border-t border-border/60 px-2 py-2 text-sm"><span><b>{pedido.folio}</b> · {pedido.contacto?.nombre ?? "Cliente"}</span><span className="flex items-center gap-2"><Badge tono={TONO_PEDIDO[pedido.estado] ?? "neutral"} punto className="capitalize">{pedido.estado}</Badge><span className="tnum">${pedido.total.toFixed(2)}</span></span></div>)}</section>
  </div>;
}
