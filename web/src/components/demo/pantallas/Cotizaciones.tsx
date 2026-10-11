"use client";

// Cotizaciones: CotizacionesCliente real con las props de app/(app)/cotizaciones/page.tsx, desde el almacén.
import { CotizacionesCliente } from "@/components/cotizaciones/CotizacionesCliente";
import { useNavegacionDemo } from "@/lib/demo/navegacion";
import { useDatos } from "@/lib/demo/usar-almacen";

export function PantallaCotizaciones() {
  const d = useDatos();
  const { query } = useNavegacionDemo();
  const consulta = new URLSearchParams(query);
  const config = d.modulos.cotizaciones?.config as { ivaPorcentaje?: string; preciosConIva?: boolean } | undefined;
  const contacto = d.contactos.find((c) => c.id === consulta.get("contactoId"));
  return (
    <CotizacionesCliente
      cotizaciones={(d.extra.cotizaciones ?? []).map((c) => ({
        id: c.id, folio: c.folio, estado: c.estado, vigencia: c.vigencia, total: String(c.total), tokenPublico: c.tokenPublico,
        contacto: { nombre: d.contactos.find((x) => x.id === c.contactoId)?.nombre ?? "—" }, oportunidad: null, venta: null,
      }))}
      productos={(d.extra.productos ?? []).filter((p) => p.activo).map((p) => ({ id: p.id, nombre: p.nombre, sku: p.sku, precio: String(p.precio), unidad: p.unidad, stock: String(p.stock) }))}
      config={{ ivaPorcentaje: config?.ivaPorcentaje ?? "16", preciosConIva: Boolean(config?.preciosConIva) }}
      esAdmin={d.usuarios[0].rol === "admin"}
      abrirNueva={consulta.get("nueva") === "1"}
      contactoInicial={contacto ? { id: contacto.id, nombre: contacto.nombre } : null}
      oportunidadInicial=""
      baseUrl="https://demo.ambarcrm.com"
    />
  );
}
