import { redirect } from "next/navigation";
import { PanelLegal } from "@/components/legal/PanelLegal";
import { db } from "@/lib/db";
import { esPasante } from "@/lib/legal";
import { moduloActivo } from "@/lib/modulos";
import { getSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function OperacionLegalPage() {
  const sesion = await getSesion();
  if (!sesion?.user?.id) redirect("/login");
  if (!(await moduloActivo("operacion_legal"))) redirect("/");
  const [operaciones, sucursales, usuarios] = await Promise.all([
    db.registroOperacionLegal.findMany({
      where: esPasante(sesion.user.puesto, sesion.user.rol)
        ? { usuarioId: BigInt(sesion.user.id) }
        : undefined,
      include: { usuario: true, sucursal: true }, orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    }),
    db.sucursalLegal.count({ where: { activa: true } }),
    db.usuario.count({ where: { activo: true } }),
  ]);
  return <PanelLegal titulo="Operación del despacho" descripcion="Sucursales, asistencia y productividad del equipo."
    metricas={[
      { etiqueta: "Sucursales", valor: String(sucursales) },
      { etiqueta: "Equipo activo", valor: String(usuarios) },
      { etiqueta: "Registros", valor: String(operaciones.length) },
      { etiqueta: "Checadas", valor: String(operaciones.filter((item) => item.tipo === "checada").length) },
    ]}
    filas={operaciones.map((item) => ({
      id: String(item.id), titulo: item.descripcion || item.tipo,
      subtitulo: [item.usuario?.nombre, item.sucursal?.nombre, item.tipo].filter(Boolean).join(" · "),
      estado: item.estado || item.tipo,
      fecha: item.fecha?.toLocaleString("es-MX", { timeZone: "America/Mexico_City" }) ?? null,
    }))} />;
}
