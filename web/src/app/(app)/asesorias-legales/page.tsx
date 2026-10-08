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
      campos={[
        { nombre: "tema", etiqueta: "Tema", tipo: "texto", requerido: true },
        { nombre: "contactoId", etiqueta: "Cliente (contacto)", tipo: "contacto" },
        { nombre: "abogadoId", etiqueta: "Abogado", tipo: "seleccion", opciones: opcionesDe(equipo, (u) => u.nombre, "Yo") },
        { nombre: "expedienteId", etiqueta: "Expediente", tipo: "seleccion", opciones: opcionesDe(expedientesOpciones, (e) => [e.numeroInterno, e.materia, e.contacto?.nombre].filter(Boolean).join(" · "), "Sin expediente") },
        { nombre: "fecha", etiqueta: "Fecha", tipo: "fecha", valorInicial: hoyMexico() },
        { nombre: "origen", etiqueta: "Origen", tipo: "texto", ayuda: "Ej. WhatsApp, recomendación, página web" },
        { nombre: "estado", etiqueta: "Estado", tipo: "seleccion", opciones: OPCIONES.estadoAsesoria },
        { nombre: "resumen", etiqueta: "Resumen", tipo: "textarea" },
      ]} />}
    metricas={[
      { etiqueta: "Asesorías", valor: String(total) },
      { etiqueta: "Pendientes", valor: String(pendientes) },
      { etiqueta: "Contratos", valor: String(contratos) },
      { etiqueta: "Conversión", valor: total ? `${Math.round(contratos / total * 100)}%` : "0%" },
    ]}
    filas={asesorias.map((item) => ({
      id: String(item.id), titulo: item.tema || item.contacto?.nombre || `Asesoría ${item.id}`,
      subtitulo: [item.contacto?.nombre, item.abogado?.nombre, item.origen].filter(Boolean).join(" · "),
      estado: item.estado, fecha: item.fecha?.toLocaleDateString("es-MX") ?? null,
    }))} />;
}
