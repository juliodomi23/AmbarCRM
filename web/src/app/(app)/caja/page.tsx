import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { CajaCliente } from "@/components/caja/CajaCliente";
import { authOptions } from "@/lib/auth";
import { descuentoMaximoCajero } from "@/lib/caja";
import { db } from "@/lib/db";
import { moduloActivo, moduloHabilitado } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function CajaPage() {
  const sesion = await getServerSession(authOptions);
  if (!sesion?.user) redirect("/login");
  const [cajaActiva, productosActivos, ventasActivas] = await Promise.all([
    moduloActivo("caja"),
    moduloHabilitado("productos"),
    moduloHabilitado("ventas"),
  ]);
  if (!cajaActiva || !productosActivos || !ventasActivas) redirect("/");
  const userId = BigInt(sesion.user.id!);
  const [cajas, productos, turno, recientes, modulo] = await Promise.all([
    db.caja.findMany({ where: { activa: true }, orderBy: { nombre: "asc" } }),
    db.producto.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    db.turnoCaja.findFirst({
      where: { usuarioId: userId, estado: "abierto" },
      include: { caja: true, usuario: { select: { id: true, nombre: true } } },
    }),
    db.turnoCaja.findMany({
      where: sesion.user.rol === "admin" ? {} : { usuarioId: userId },
      include: { caja: true, usuario: { select: { id: true, nombre: true } } },
      orderBy: { abiertoAt: "desc" },
      take: 20,
    }),
    db.moduloOrg.findFirst({ where: { clave: "caja", activo: true }, select: { config: true } }),
  ]);
  return (
    <CajaCliente
      cajas={serializar(cajas)}
      productos={serializar(productos)}
      turnoInicial={serializar(turno)}
      turnosRecientes={serializar(recientes)}
      descuentoMaximo={descuentoMaximoCajero(modulo?.config)}
      usuario={{ rol: sesion.user.rol ?? "agente", puesto: sesion.user.puesto ?? "Agente" }}
    />
  );
}
