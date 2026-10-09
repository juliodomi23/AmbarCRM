import { redirect } from "next/navigation";
import { PanelLegal } from "@/components/legal/PanelLegal";
import { db } from "@/lib/db";
import { esPasante } from "@/lib/legal";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { getSesion } from "@/lib/session";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { opcionesDe } from "@/lib/opciones-formularios";
import { camposExpediente, fechaCampo, textoCampo } from "@/lib/campos-modulos";

export const dynamic = "force-dynamic";

export default async function LegalPage() {
  const sesion = await getSesion();
  if (!sesion?.user?.id) redirect("/login");
  if (!(await moduloActivo("legal"))) redirect("/");
  const filtro = esPasante(sesion.user.puesto, sesion.user.rol)
    ? { responsableId: BigInt(sesion.user.id) }
    : {};
  const [expedientes, total, activos, suspendidos, materias] = await Promise.all([
    db.expedienteLegal.findMany({
      where: filtro,
      include: { contacto: true, responsable: true },
      orderBy: { updatedAt: "desc" },
      take: LIMITE_PANEL,
    }),
    db.expedienteLegal.count({ where: filtro }),
    db.expedienteLegal.count({ where: { ...filtro, estado: "activo" } }),
    db.expedienteLegal.count({ where: { ...filtro, estado: "suspendido" } }),
    db.expedienteLegal.groupBy({ by: ["materia"], where: { ...filtro, materia: { not: null } } }),
  ]);
  const equipo = await db.usuario.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } });
  const sucursales = await db.sucursalLegal.findMany({ where: { activa: true }, orderBy: { nombre: "asc" } });
  return (
    <PanelLegal
      titulo="Expedientes legales"
      descripcion="Asuntos, responsables, etapas procesales y actividad del despacho."
      acciones={<FormularioModulo boton="+ Nuevo expediente" titulo="Nuevo expediente" endpoint="/api/legal/expedientes"
      campos={camposExpediente(opcionesDe(equipo, (u) => u.nombre, "Quien lo registra"), opcionesDe(sucursales, (s) => s.nombre, "Sin sucursal"))} />}
      edicion={{ titulo: "Editar expediente", campos: camposExpediente(opcionesDe(equipo, (u) => u.nombre, "Sin asignar"), opcionesDe(sucursales, (s) => s.nombre, "Sin sucursal")).filter((campo) => campo.tipo !== "contacto") }}
      metricas={[
        { etiqueta: "Expedientes", valor: String(total) },
        { etiqueta: "Activos", valor: String(activos) },
        { etiqueta: "Suspendidos", valor: String(suspendidos) },
        { etiqueta: "Materias", valor: String(materias.length) },
      ]}
      filas={expedientes.map((item) => ({
        id: String(item.id), edicion: { endpoint: `/api/legal/expedientes/${item.id}`, valores: { numeroInterno: textoCampo(item.numeroInterno), materia: textoCampo(item.materia), responsableId: textoCampo(item.responsableId), sucursalId: textoCampo(item.sucursalId), tipoJuicio: textoCampo(item.tipoJuicio), juzgado: textoCampo(item.juzgado), etapaProcesal: textoCampo(item.etapaProcesal), fechaInicio: fechaCampo(item.fechaInicio), cuantia: textoCampo(item.cuantia), estado: textoCampo(item.estado), resumen: textoCampo(item.resumen) } },
        titulo: item.numeroInterno || item.numeroJudicial || `Expediente ${item.id}`,
        subtitulo: [item.contacto?.nombre, item.materia, item.etapaProcesal, item.responsable?.nombre]
          .filter(Boolean)
          .join(" · "),
        estado: item.estado,
        fecha: item.fechaInicio?.toLocaleDateString("es-MX") ?? null,
        href: `/legal/${item.id}`,
      }))}
    />
  );
}
