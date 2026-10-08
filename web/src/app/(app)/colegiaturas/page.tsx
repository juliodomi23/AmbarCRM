import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { hoyMexico, LIMITE_OPCIONES, OPCIONES, opcionesDe } from "@/lib/opciones-formularios";

export const dynamic = "force-dynamic";

export default async function ColegiaturasPage() {
  if (!(await moduloActivo("colegiaturas"))) redirect("/");
  const [colegiaturas, cargos, pendientes, pagadas] = await Promise.all([
    db.colegiaturaAcademia.findMany({
      include: { alumno: { include: { contacto: true } } }, orderBy: { vencimiento: "asc" },
      where: { estado: { not: "pagada" } }, take: LIMITE_PANEL,
    }),
    db.colegiaturaAcademia.count(),
    db.colegiaturaAcademia.aggregate({ where: { estado: { not: "pagada" } }, _count: { _all: true }, _sum: { monto: true } }),
    db.colegiaturaAcademia.count({ where: { estado: "pagada" } }),
  ]);
  const moneda = (valor: number) => valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  const alumnosActivos = await db.alumnoAcademia.findMany({
    where: { estado: "activo" }, include: { contacto: true }, orderBy: { contacto: { nombre: "asc" } }, take: LIMITE_OPCIONES,
  });
  return <PanelListado titulo="Colegiaturas" descripcion="Cargos pendientes por vencimiento y cartera por cobrar."
    acciones={<FormularioModulo boton="+ Nuevo cargo" titulo="Nuevo cargo de colegiatura" endpoint="/api/academia/colegiaturas"
      campos={[
        { nombre: "alumnoId", etiqueta: "Alumno", tipo: "seleccion", requerido: true, opciones: opcionesDe(alumnosActivos, (a) => `${a.contacto.nombre}${a.matricula ? ` · ${a.matricula}` : ""}`, "Elige un alumno") },
        { nombre: "concepto", etiqueta: "Concepto", tipo: "texto", valorInicial: "Colegiatura" },
        { nombre: "periodo", etiqueta: "Periodo", tipo: "texto", ayuda: "Ej. Octubre 2026" },
        { nombre: "monto", etiqueta: "Monto", tipo: "dinero", requerido: true },
        { nombre: "vencimiento", etiqueta: "Vence", tipo: "fecha", requerido: true },
        { nombre: "estado", etiqueta: "Estado", tipo: "seleccion", opciones: OPCIONES.estadoColegiatura },
        { nombre: "metodo", etiqueta: "Método de pago", tipo: "seleccion", opciones: [{ valor: "", etiqueta: "Sin pagar" }, ...OPCIONES.metodoPago] },
      ]} />}
    metricas={[
      { etiqueta: "Cargos", valor: String(cargos) },
      { etiqueta: "Pendientes", valor: String(pendientes._count._all) },
      { etiqueta: "Por cobrar", valor: moneda(Number(pendientes._sum.monto ?? 0)) },
      { etiqueta: "Pagadas", valor: String(pagadas) },
    ]}
    items={colegiaturas.map((item) => ({
      id: String(item.id), titulo: `${item.concepto} · ${item.alumno.contacto.nombre}`,
      descripcion: `${item.periodo ?? "Sin periodo"} · Vence ${item.vencimiento.toLocaleDateString("es-MX")}`,
      estado: item.estado, dato: moneda(Number(item.monto)),
    }))} />;
}
