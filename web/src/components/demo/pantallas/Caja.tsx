"use client";

// Caja: CajaCliente real con las props de app/(app)/caja/page.tsx, desde el almacén.
// ventasSinRed=false: la demo no usa IndexedDB ni cola de ventas sin internet.
import { CajaCliente } from "@/components/caja/CajaCliente";
import { turnoVista } from "@/lib/demo/api/modulos-giro";
import { useDatos } from "@/lib/demo/usar-almacen";

export function PantallaCaja() {
  const d = useDatos();
  const yo = d.usuarios[0];
  const turnos = d.extra.turnos ?? [];
  const config = d.modulos.caja?.config as { descuentoMaximoCajero?: number } | undefined;
  return (
    <CajaCliente
      cajas={(d.extra.cajas ?? []).filter((c) => c.activa).map((c) => ({ id: c.id, nombre: c.nombre, sucursal: c.sucursal }))}
      productos={(d.extra.productos ?? []).filter((p) => p.activo)}
      turnoInicial={(() => { const t = turnos.find((x) => x.estado === "abierto" && x.usuarioId === yo.id); return t ? turnoVista(d, t) : null; })()}
      turnosRecientes={turnos.slice(0, 20).map((t) => turnoVista(d, t))}
      descuentoMaximo={config?.descuentoMaximoCajero ?? 10}
      usuario={{ rol: yo.rol, puesto: yo.puesto }}
      identidad={{ orgId: "demo", userId: yo.id }}
      ventasSinRed={false}
    />
  );
}
