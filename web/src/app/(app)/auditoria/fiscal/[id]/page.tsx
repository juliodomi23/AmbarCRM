import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { db } from "@/lib/db";
import { getSesion } from "@/lib/session";
import { aBigInt } from "@/lib/ids";
import { ESTADOS_AUDITORIA_FISCAL, ESTADOS_PROCEDIMIENTO_FISCAL, etiquetaEstadoCambio, tonoEstadoCambio, puedeGestionarAuditoria } from "@/lib/auditoria";
import { EncabezadoPagina, Badge } from "@/components/ui";
import { AuditoriaFiscalEstado } from "@/components/modulos/auditoria/AuditoriaFiscalEstado";
import { AuditoriaFiscalProcedimientos } from "@/components/modulos/auditoria/AuditoriaFiscalProcedimientos";

export const dynamic = "force-dynamic";

function fechaLarga(valor: string | Date | null) {
  if (!valor) return "—";
  const clave = typeof valor === "string" ? valor.slice(0, 10) : valor.toISOString().slice(0, 10);
  return new Date(`${clave}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).replace(".", "");
}

function fechaHora(valor: Date) {
  return valor.toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).replace(".", "");
}

export default async function AuditoriaFiscalDetallePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await moduloActivo("auditoria"))) redirect("/");
  const sesion = await getSesion();
  if (!sesion?.user) redirect("/login");
  const esGestion = puedeGestionarAuditoria(sesion.user.puesto, sesion.user.rol);
  if (!esGestion) redirect("/auditoria");

  const id = aBigInt((await params).id);
  if (!id) notFound();

  const auditoria = await db.auditoriaFiscalCliente.findUnique({
    where: { id },
    include: {
      cliente: { include: { contacto: { select: { nombre: true, empresa: true } } } },
      cambios: { orderBy: { creadoAt: "desc" } },
      procedimientos: { orderBy: [{ orden: "asc" }, { id: "asc" }] },
    },
  });
  if (!auditoria) notFound();

  const usuariosIds = [auditoria.auditorId, ...auditoria.cambios.map((cambio) => cambio.userId).filter((valor): valor is bigint => valor !== null)];
  const usuarios = await db.usuario.findMany({ where: { id: { in: [...new Set(usuariosIds)] } }, select: { id: true, nombre: true } });
  const nombres = new Map(usuarios.map((usuario) => [String(usuario.id), usuario.nombre]));
  const nombreCliente = auditoria.cliente.contacto.empresa ?? auditoria.cliente.contacto.nombre;

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <EncabezadoPagina
        eyebrow="Auditoría fiscal"
        titulo={nombreCliente}
        descripcion={auditoria.alcance}
        acciones={<Link href="/auditoria/fiscal" className="min-h-10 rounded-lg border border-input px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">← Todas las auditorías</Link>}
      />

      <section className="surface grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <div><p className="text-sm text-muted-foreground">Periodo auditado</p><p className="font-medium text-foreground">{auditoria.periodo}</p></div>
        <div><p className="text-sm text-muted-foreground">Auditor responsable</p><p className="font-medium text-foreground">{nombres.get(String(auditoria.auditorId)) ?? "—"}</p></div>
        <div><p className="text-sm text-muted-foreground">Inicio</p><p className="font-medium text-foreground">{fechaLarga(auditoria.fechaInicio)}</p></div>
        <div><p className="text-sm text-muted-foreground">Cierre</p><p className="font-medium text-foreground">{fechaLarga(auditoria.fechaCierre)}</p></div>
        <div className="sm:col-span-2">
          <p className="text-sm text-muted-foreground">Estado actual</p>
          <div className="mt-1"><AuditoriaFiscalEstado id={String(auditoria.id)} estado={auditoria.estado} hallazgos={auditoria.hallazgos} opciones={ESTADOS_AUDITORIA_FISCAL.map((estado) => ({ valor: estado.clave, etiqueta: estado.etiqueta }))} /></div>
        </div>
        {auditoria.hallazgos && (
          <div className="sm:col-span-2">
            <p className="text-sm text-muted-foreground">Hallazgos / notas actuales</p>
            <p className="whitespace-pre-wrap text-sm text-foreground">{auditoria.hallazgos}</p>
          </div>
        )}
      </section>

      <section className="surface space-y-3 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Procedimientos y pruebas</h2>
          <p className="text-sm text-muted-foreground">Qué se revisó en esta auditoría y con qué resultado.</p>
        </div>
        <AuditoriaFiscalProcedimientos
          auditoriaId={String(auditoria.id)}
          iniciales={auditoria.procedimientos.map((procedimiento) => ({ id: String(procedimiento.id), nombre: procedimiento.nombre, estado: procedimiento.estado, resultado: procedimiento.resultado }))}
          opciones={ESTADOS_PROCEDIMIENTO_FISCAL.map((estado) => ({ valor: estado.clave, etiqueta: estado.etiqueta }))}
        />
      </section>

      <section className="surface space-y-3 p-4 sm:p-5">
        <h2 className="text-base font-semibold text-foreground">Historial</h2>
        {auditoria.cambios.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin cambios registrados todavía.</p>
        ) : (
          <div className="space-y-3">
            {auditoria.cambios.map((cambio) => (
              <div key={String(cambio.id)} className="flex gap-3 border-l-2 border-border pl-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {cambio.estadoAnterior && <Badge tono={tonoEstadoCambio(cambio.estadoAnterior)}>{etiquetaEstadoCambio(cambio.estadoAnterior)}</Badge>}
                    {cambio.estadoAnterior && <span className="text-muted-foreground">→</span>}
                    <Badge tono={tonoEstadoCambio(cambio.estadoNuevo)}>{etiquetaEstadoCambio(cambio.estadoNuevo)}</Badge>
                  </div>
                  {cambio.nota && <p className="whitespace-pre-wrap text-sm text-foreground">{cambio.nota}</p>}
                  <p className="text-xs text-muted-foreground">{fechaHora(cambio.creadoAt)} · {cambio.userId ? nombres.get(String(cambio.userId)) ?? "—" : "Sistema"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
