import { redirect } from "next/navigation";
import { PanelLegal } from "@/components/legal/PanelLegal";
import { db } from "@/lib/db";
import { esPasante } from "@/lib/legal";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { getSesion } from "@/lib/session";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { LIMITE_OPCIONES, opcionesDe } from "@/lib/opciones-formularios";
import { camposMovimiento, fechaCampo, textoCampo } from "@/lib/campos-modulos";

export const dynamic = "force-dynamic";

export default async function FinanzasLegalesPage() {
  const sesion = await getSesion();
  if (!sesion?.user?.id) redirect("/login");
  if (!(await moduloActivo("finanzas_legales"))) redirect("/");
  const filtro = esPasante(sesion.user.puesto, sesion.user.rol)
    ? { expediente: { responsableId: BigInt(sesion.user.id) } }
    : {};
  const [movimientos, cantidad, porTipo] = await Promise.all([
    db.movimientoLegal.findMany({
      where: filtro,
      include: { contacto: true, expediente: true }, orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      take: LIMITE_PANEL,
    }),
    db.movimientoLegal.count({ where: filtro }),
    db.movimientoLegal.groupBy({ by: ["tipo"], where: filtro, _count: { _all: true }, _sum: { monto: true } }),
  ]);
  const deTipo = (tipo: string) => porTipo.find((item) => item.tipo === tipo);
  const total = (tipo: string) => Number(deTipo(tipo)?._sum.monto ?? 0);
  const moneda = (valor: number) => valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  const expedientesOpciones = await db.expedienteLegal.findMany({
    where: { ...(esPasante(sesion.user.puesto, sesion.user.rol) ? { responsableId: BigInt(sesion.user.id) } : {}), estado: { in: ["activo", "suspendido"] } }, include: { contacto: true },
    orderBy: { updatedAt: "desc" }, take: LIMITE_OPCIONES,
  });
  return <PanelLegal titulo="Honorarios y caja" descripcion="Planes, cobros, gastos, caja y diligencias."
    acciones={<FormularioModulo boton="+ Nuevo movimiento" titulo="Nuevo movimiento" endpoint="/api/legal/movimientos"
      campos={camposMovimiento(opcionesDe(expedientesOpciones, (e) => [e.numeroInterno, e.materia, e.contacto?.nombre].filter(Boolean).join(" · "), "Sin expediente"))} />}
    edicion={{ titulo: "Editar movimiento", campos: camposMovimiento(opcionesDe(expedientesOpciones, (e) => [e.numeroInterno, e.materia, e.contacto?.nombre].filter(Boolean).join(" · "), "Sin expediente")), eliminar: "Borrar movimiento" }}
    metricas={[
      { etiqueta: "Movimientos", valor: String(cantidad) },
      { etiqueta: "Cobrado", valor: moneda(total("pago")) },
      { etiqueta: "Planes", valor: String(deTipo("plan_pago")?._count._all ?? 0) },
      { etiqueta: "Gastos", valor: moneda(total("gasto") + total("diligencia")) },
    ]}
    filas={movimientos.map((item) => ({
      id: String(item.id), edicion: { endpoint: `/api/legal/movimientos/${item.id}`, valores: { tipo: textoCampo(item.tipo), concepto: textoCampo(item.concepto), monto: textoCampo(item.monto), expedienteId: textoCampo(item.expedienteId), fecha: fechaCampo(item.fecha) } }, titulo: item.concepto,
      subtitulo: [item.contacto?.nombre, item.expediente?.numeroInterno, item.tipo].filter(Boolean).join(" · "),
      estado: item.estado || item.tipo, fecha: item.fecha?.toLocaleDateString("es-MX") ?? null,
      importe: Number(item.monto),
    }))} />;
}
