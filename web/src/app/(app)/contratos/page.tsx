import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { getSesion } from "@/lib/session";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { PanelListado } from "@/components/modulos/PanelListado";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { camposContrato } from "@/lib/campos-ar";

export const dynamic = "force-dynamic";
export default async function ContratosPage() {
  if (!(await getSesion())?.user.orgId) redirect("/login");
  if (!(await moduloActivo("contratos"))) redirect("/");
  const [contratos, total, produccion, desarrollo, sinDia, contactos] = await Promise.all([
    db.contrato.findMany({ take: LIMITE_PANEL, include: { contacto: { select: { id: true, nombre: true } } }, orderBy: { id: "desc" } }),
    db.contrato.count(), db.contrato.count({ where: { estado: "produccion" } }),
    db.contrato.count({ where: { estado: { in: ["en_desarrollo", "en_pruebas"] } } }),
    db.contrato.count({ where: { diaCobro: null, mensualidad: { gt: 0 }, OR: [{ estado: null }, { estado: { notIn: ["baja", "incobrable"] } }] } }),
    db.contacto.findMany({ take: LIMITE_PANEL, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);
  const campos = camposContrato();
  const clientesEdicion = new Map([...contactos, ...contratos.map((contrato) => contrato.contacto)].map((contacto) => [String(contacto.id), contacto.nombre]));
  const camposEdicion = camposContrato([...clientesEdicion].map(([valor, etiqueta]) => ({ valor, etiqueta })));
  return <PanelListado titulo="Servicios contratados" descripcion="Un servicio por contrato. Los datos sin confirmar permanecen vacíos."
    metricas={[{ etiqueta: "Contratos", valor: String(total) }, { etiqueta: "En producción", valor: String(produccion) }, { etiqueta: "En desarrollo / pruebas", valor: String(desarrollo) }, { etiqueta: "Sin día de cobro", valor: String(sinDia) }]}
    acciones={<FormularioModulo boton="Nuevo contrato" titulo="Nuevo servicio contratado" endpoint="/api/contratos" campos={campos} />}
    edicion={{ titulo: "Editar contrato", campos: camposEdicion }}
    items={contratos.map((contrato) => ({
      id: String(contrato.id), titulo: contrato.contacto.nombre,
      descripcion: `${contrato.tipo.replaceAll("_", " ")} · ${contrato.diaCobro ? `cobro día ${contrato.diaCobro}` : "sin día de cobro"} · cierre ${contrato.montoCierre === null ? "por confirmar" : `$${contrato.montoCierre.toFixed(2)}`}`,
      estado: contrato.estado ?? "por_confirmar", dato: contrato.mensualidad === null ? "Mensualidad por definir" : `$${contrato.mensualidad.toFixed(2)} / mes`,
      edicion: { endpoint: `/api/contratos/${contrato.id}`, valores: Object.fromEntries(campos.map((campo) => {
        const valor = contrato[campo.nombre as keyof typeof contrato];
        return [campo.nombre, valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor ?? "")];
      })) },
    }))} />;
}
