import Link from "next/link";
import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { db } from "@/lib/db";
import { getSesion } from "@/lib/session";
import { ESTADOS_AUDITORIA_FISCAL, puedeGestionarAuditoria } from "@/lib/auditoria";
import { EncabezadoPagina } from "@/components/ui";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { EmptyState } from "@/components/EmptyState";
import { AuditoriaFiscalEstado } from "@/components/modulos/auditoria/AuditoriaFiscalEstado";

export const dynamic = "force-dynamic";

function fechaCorta(valor: string | Date) {
  const clave = typeof valor === "string" ? valor.slice(0, 10) : valor.toISOString().slice(0, 10);
  return new Date(`${clave}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace(".", "");
}

export default async function AuditoriaFiscalPage() {
  if (!(await moduloActivo("auditoria"))) redirect("/");
  const sesion = await getSesion();
  if (!sesion?.user) redirect("/login");
  const esGestion = puedeGestionarAuditoria(sesion.user.puesto, sesion.user.rol);
  if (!esGestion) redirect("/auditoria");

  const [auditorias, clientes, usuarios] = await Promise.all([
    db.auditoriaFiscalCliente.findMany({
      include: { cliente: { include: { contacto: { select: { nombre: true, empresa: true } } } } },
      orderBy: [{ fechaInicio: "desc" }],
      take: 100,
    }),
    db.despachoCliente.findMany({ where: { activo: true }, select: { id: true, contacto: { select: { nombre: true, empresa: true } } }, orderBy: { updatedAt: "desc" }, take: 300 }),
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);

  const nombres = new Map(usuarios.map((usuario) => [String(usuario.id), usuario.nombre]));

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <EncabezadoPagina
        eyebrow="Auditoría"
        titulo="Auditoría fiscal a clientes"
        descripcion="Auditorías que el despacho realiza a sus clientes (distinto del control de calidad interno de colaboradores)."
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <FormularioModulo
              boton="Nueva auditoría"
              titulo="Registrar auditoría fiscal a un cliente"
              endpoint="/api/auditoria/fiscal"
              campos={[
                {
                  nombre: "clienteId",
                  etiqueta: "Cliente",
                  tipo: "seleccion",
                  requerido: true,
                  opciones: clientes.map((cliente) => ({ valor: String(cliente.id), etiqueta: cliente.contacto.empresa ?? cliente.contacto.nombre })),
                },
                { nombre: "periodo", etiqueta: "Periodo auditado", tipo: "texto", requerido: true, ayuda: "Ej. 2026-T4, Ejercicio 2025" },
                { nombre: "alcance", etiqueta: "Alcance", tipo: "textarea", requerido: true, ayuda: "Ej. ISR e IVA del ejercicio 2025" },
                { nombre: "fechaInicio", etiqueta: "Fecha de inicio", tipo: "fecha", requerido: true },
                {
                  nombre: "auditorId",
                  etiqueta: "Auditor responsable",
                  tipo: "seleccion",
                  requerido: true,
                  valorInicial: String(sesion.user.id ?? ""),
                  opciones: usuarios.map((usuario) => ({ valor: String(usuario.id), etiqueta: usuario.nombre })),
                },
              ]}
            />
          </div>
        }
      />

      {auditorias.length === 0 ? (
        <EmptyState titulo="Sin auditorías fiscales" descripcion="Registra la primera auditoría a un cliente para empezar a dar seguimiento." />
      ) : (
        <div className="surface divide-y divide-border/60 p-2">
          {auditorias.map((auditoria) => (
            <div key={String(auditoria.id)} className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_140px_160px_160px] sm:items-center">
              <Link href={`/auditoria/fiscal/${auditoria.id}`} className="min-w-0 rounded-lg transition hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <p className="truncate font-medium text-foreground">{auditoria.cliente.contacto.empresa ?? auditoria.cliente.contacto.nombre}</p>
                <p className="truncate text-xs text-muted-foreground">{auditoria.alcance}</p>
              </Link>
              <span className="text-xs text-muted-foreground">Periodo {auditoria.periodo}</span>
              <span className="text-xs text-muted-foreground">
                Inicio {fechaCorta(auditoria.fechaInicio)} · Auditor {nombres.get(String(auditoria.auditorId)) ?? "—"}
              </span>
              <div className="flex items-center justify-start sm:justify-end">
                <AuditoriaFiscalEstado
                  id={String(auditoria.id)}
                  estado={auditoria.estado}
                  hallazgos={auditoria.hallazgos}
                  opciones={ESTADOS_AUDITORIA_FISCAL.map((estado) => ({ valor: estado.clave, etiqueta: estado.etiqueta }))}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
