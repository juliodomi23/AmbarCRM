import { redirect } from "next/navigation";
import { PanelLegal } from "@/components/legal/PanelLegal";
import { db } from "@/lib/db";
import { esPasante } from "@/lib/legal";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { getSesion } from "@/lib/session";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { hoyMexico, LIMITE_OPCIONES, OPCIONES, opcionesDe } from "@/lib/opciones-formularios";

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
      campos={[
        { nombre: "numeroInterno", etiqueta: "Número interno", tipo: "texto", ayuda: "Captura el número interno o la materia" },
        { nombre: "materia", etiqueta: "Materia", tipo: "texto" },
        { nombre: "contactoId", etiqueta: "Cliente (contacto)", tipo: "contacto" },
        { nombre: "responsableId", etiqueta: "Responsable", tipo: "seleccion", opciones: opcionesDe(equipo, (u) => u.nombre, "Yo"), ayuda: "Si eres pasante, quedará a tu nombre" },
        { nombre: "sucursalId", etiqueta: "Sucursal", tipo: "seleccion", opciones: opcionesDe(sucursales, (s) => s.nombre, "Sin sucursal") },
        { nombre: "tipoJuicio", etiqueta: "Tipo de juicio", tipo: "texto" },
        { nombre: "juzgado", etiqueta: "Juzgado", tipo: "texto" },
        { nombre: "etapaProcesal", etiqueta: "Etapa procesal", tipo: "texto" },
        { nombre: "fechaInicio", etiqueta: "Fecha de inicio", tipo: "fecha" },
        { nombre: "cuantia", etiqueta: "Cuantía", tipo: "dinero" },
        { nombre: "estado", etiqueta: "Estado", tipo: "seleccion", opciones: OPCIONES.estadoExpediente },
        { nombre: "resumen", etiqueta: "Resumen", tipo: "textarea" },
      ]} />}
      metricas={[
        { etiqueta: "Expedientes", valor: String(total) },
        { etiqueta: "Activos", valor: String(activos) },
        { etiqueta: "Suspendidos", valor: String(suspendidos) },
        { etiqueta: "Materias", valor: String(materias.length) },
      ]}
      filas={expedientes.map((item) => ({
        id: String(item.id),
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
