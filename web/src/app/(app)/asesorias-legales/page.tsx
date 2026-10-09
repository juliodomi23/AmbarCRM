import { redirect } from "next/navigation";
import { PanelLegal } from "@/components/legal/PanelLegal";
import { db } from "@/lib/db";
import { esPasante } from "@/lib/legal";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { getSesion } from "@/lib/session";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { LIMITE_OPCIONES, opcionesDe } from "@/lib/opciones-formularios";
import { camposAsesoria, fechaCampo, textoCampo } from "@/lib/campos-modulos";

export const dynamic = "force-dynamic";

export default async function AsesoriasLegalesPage() {
  const sesion = await getSesion();
  if (!sesion?.user?.id) redirect("/login");
  if (!(await moduloActivo("asesorias_legales"))) redirect("/");
  const filtro = esPasante(sesion.user.puesto, sesion.user.rol)
    ? { abogadoId: BigInt(sesion.user.id) }
    : {};
  const [asesorias, total, pendientes, contratos] = await Promise.all([
    db.asesoriaLegal.findMany({
      where: filtro,
      include: { contacto: true, abogado: true },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      take: LIMITE_PANEL,
    }),
    db.asesoriaLegal.count({ where: filtro }),
    db.asesoriaLegal.count({ where: { ...filtro, estado: "pendiente" } }),
    db.asesoriaLegal.count({ where: { ...filtro, estado: "contrato_firmado" } }),
  ]);
  const equipo = await db.usuario.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } });
  const expedientesOpciones = await db.expedienteLegal.findMany({
    where: { estado: { in: ["activo", "suspendido"] } }, include: { contacto: true },
    orderBy: { updatedAt: "desc" }, take: LIMITE_OPCIONES,
  });
  return <PanelLegal titulo="Asesorías legales" descripcion="Consultas y conversión a nuevos asuntos."
    acciones={<FormularioModulo boton="+ Nueva asesoría" titulo="Nueva asesoría" endpoint="/api/legal/asesorias"
      campos={camposAsesoria(opcionesDe(equipo, (u) => u.nombre, "Quien lo registra"), opcionesDe(expedientesOpciones, (e) => [e.numeroInterno, e.materia, e.contacto?.nombre].filter(Boolean).join(" · "), "Sin expediente"))} />}
    edicion={{ titulo: "Editar asesoría", campos: camposAsesoria(opcionesDe(equipo, (u) => u.nombre, "Sin asignar"), opcionesDe(expedientesOpciones, (e) => [e.numeroInterno, e.materia, e.contacto?.nombre].filter(Boolean).join(" · "), "Sin expediente"), false), eliminar: "Borrar asesoría" }}
    metricas={[
      { etiqueta: "Asesorías", valor: String(total) },
      { etiqueta: "Pendientes", valor: String(pendientes) },
      { etiqueta: "Contratos", valor: String(contratos) },
      { etiqueta: "Conversión", valor: total ? `${Math.round(contratos / total * 100)}%` : "0%" },
    ]}
    filas={asesorias.map((item) => ({
      id: String(item.id), edicion: { endpoint: `/api/legal/asesorias/${item.id}`, valores: { tema: textoCampo(item.tema), abogadoId: textoCampo(item.abogadoId), expedienteId: textoCampo(item.expedienteId), fecha: fechaCampo(item.fecha), origen: textoCampo(item.origen), estado: textoCampo(item.estado), resumen: textoCampo(item.resumen) } }, titulo: item.tema || item.contacto?.nombre || `Asesoría ${item.id}`,
      subtitulo: [item.contacto?.nombre, item.abogado?.nombre, item.origen].filter(Boolean).join(" · "),
      estado: item.estado, fecha: item.fecha?.toLocaleDateString("es-MX") ?? null,
    }))} />;
}
