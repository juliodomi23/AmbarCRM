import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { getSesion } from "@/lib/session";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { camposPago } from "@/lib/campos-ar";
import { fechaAR, hoyAR } from "@/lib/contratos-cobros";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { RecordarCobro } from "@/components/ar/RecordarCobro";
import { EncabezadoPagina, Badge } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";
export default async function CobrosPage() {
  const sesion = await getSesion();
  if (!sesion?.user.orgId) redirect("/login");
  if (!(await moduloActivo("cobros"))) redirect("/");
  const [cobros, contratos, pendiente, pagado, modulo] = await Promise.all([
    db.cobro.findMany({ take: LIMITE_PANEL, include: { contrato: { include: { contacto: { select: { nombre: true } } } } }, orderBy: [{ vence: { sort: "asc", nulls: "last" } }, { id: "desc" }] }),
    db.contrato.findMany({ take: LIMITE_PANEL, include: { contacto: { select: { nombre: true } } }, orderBy: { id: "desc" } }),
    db.cobro.aggregate({ where: { estado: { in: ["pendiente", "vencido"] } }, _sum: { monto: true } }),
    db.cobro.aggregate({ where: { estado: "pagado" }, _sum: { monto: true } }),
    db.moduloOrg.findFirst({ where: { clave: "cobros" } }),
  ]);
  const esAdmin = sesion.user.rol === "admin";
  const plantilla = (modulo?.config as { plantillaCobro?: { name: string; language: string } } | null)?.plantillaCobro;
  return <div className="space-y-5 p-4 md:p-6">
    <EncabezadoPagina titulo="Cobros y fechas de pago" descripcion="Registra los pagos recibidos y consulta los vencimientos. Los recordatorios se envían solo al pulsar el botón."
      acciones={<FormularioModulo boton="Nuevo cobro extra" titulo="Cargo adicional" endpoint="/api/cobros" campos={[
        { nombre: "contratoId", etiqueta: "Contrato", tipo: "seleccion", requerido: true, opciones: contratos.map((contrato) => ({ valor: String(contrato.id), etiqueta: `${contrato.contacto.nombre} · ${contrato.tipo.replaceAll("_", " ")}` })) },
        { nombre: "monto", etiqueta: "Monto MXN", tipo: "dinero", requerido: true }, { nombre: "vence", etiqueta: "Vencimiento", tipo: "fecha" }, { nombre: "nota", etiqueta: "Concepto / nota", tipo: "textarea" },
      ]} />} />
    <section className="grid gap-3 sm:grid-cols-2">
      <div className="surface p-4"><p className="text-xs text-muted-foreground">Por cobrar</p><strong className="text-2xl">${pendiente._sum.monto?.toFixed(2) ?? "0.00"}</strong></div>
      <div className="surface p-4"><p className="text-xs text-muted-foreground">Total registrado como pagado</p><strong className="text-2xl">${pagado._sum.monto?.toFixed(2) ?? "0.00"}</strong></div>
    </section>
    {esAdmin && <div className="surface flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm text-muted-foreground">Plantilla de recordatorio: {plantilla?.name ?? "sin configurar"}</p><FormularioModulo discreto boton="Configurar plantilla" titulo="Recordatorios manuales" endpoint="/api/cobros/ajustes" valores={{ plantillaNombre: plantilla?.name ?? "", plantillaIdioma: plantilla?.language ?? "es_MX" }} campos={[
      { nombre: "plantillaNombre", etiqueta: "Nombre de plantilla aprobada", tipo: "texto", ayuda: "Variables: {{1}} cliente, {{2}} monto, {{3}} vencimiento." }, { nombre: "plantillaIdioma", etiqueta: "Idioma", tipo: "texto" },
    ]} /></div>}
    <section className="surface overflow-hidden">
      {!cobros.length && <EmptyState titulo="Sin cobros" descripcion="Los contratos con monto de cierre generan anticipo y balance." />}
      {cobros.map((cobro) => {
        const abierto = ["pendiente", "vencido"].includes(cobro.estado);
        const vencido = abierto && cobro.vence && cobro.vence < fechaAR(hoyAR())!;
        return <article key={String(cobro.id)} className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-0">
          <div className="min-w-0"><h2 className="font-medium break-words">{cobro.contrato.contacto.nombre}</h2><p className="text-sm text-muted-foreground">{cobro.concepto} · {cobro.periodo?.toISOString().slice(0, 7) ?? cobro.contrato.tipo.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">Vence: {cobro.vence?.toISOString().slice(0, 10) ?? "por confirmar"}</p></div>
          <div className="flex flex-wrap items-center gap-3"><strong>${cobro.monto.toFixed(2)}</strong><Badge tono={vencido ? "destructive" : cobro.estado === "pagado" ? "success" : "neutral"}>{vencido ? "vencido" : cobro.estado}</Badge>
            {abierto && <><FormularioModulo discreto boton="Registrar pago / estado" titulo="Actualizar cobro" endpoint={`/api/cobros/${cobro.id}`} valores={{ estado: "pagado", metodo: "transferencia", referencia: "", nota: "" }} campos={camposPago(esAdmin)} /><RecordarCobro id={String(cobro.id)} /></>}
            {abierto && <FormularioModulo discreto boton={cobro.vence ? "Cambiar fecha" : "Definir vencimiento"} titulo="Vencimiento del cobro" endpoint={`/api/cobros/${cobro.id}`} valores={{ vence: cobro.vence?.toISOString().slice(0, 10) ?? "" }} campos={[{ nombre: "vence", etiqueta: "Vencimiento", tipo: "fecha", ayuda: "Déjalo vacío si aún está por confirmar." }]} />}
          </div>
        </article>;
      })}
    </section>
  </div>;
}
