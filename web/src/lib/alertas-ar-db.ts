import { transaccionTenant } from "@/lib/retail-db";
import { hoyAR, fechaAR } from "@/lib/contratos-cobros";
import { saldoCobro } from "@/lib/ar-vistas";
import { alertasDeServidor, diasParaVencer, resumenAlertas, type AlertaAR } from "@/lib/servidores";

export function alertasAR(orgId: bigint, ahora = new Date()) {
  return transaccionTenant(orgId, async tx => {
    const hoy = hoyAR(ahora);
    const servidoresActivo = await tx.moduloOrg.findFirst({ where: { clave: "servidores", activo: true } });
    const cobrosActivo = await tx.moduloOrg.findFirst({ where: { clave: "cobros", activo: true } });
    const [servidores, cobros] = await Promise.all([
      servidoresActivo ? tx.servidor.findMany({ where: { activo: true }, include: { heartbeats: { orderBy: { fecha: "desc" }, take: 1 } } }) : [],
      cobrosActivo ? tx.cobro.findMany({ where: { estado: { in: ["pendiente", "vencido"] }, vence: { lt: fechaAR(hoy)! } }, include: { contrato: { include: { contacto: { select: { nombre: true } } } } }, orderBy: [{ vence: "asc" }, { id: "asc" }] }) : [],
    ]);
    const lista: AlertaAR[] = servidores.flatMap(s => alertasDeServidor(s, s.heartbeats[0] ?? (s.ultimoReporte ? { fecha: s.ultimoReporte, ramPct: null, discoPct: null } : null), hoy, ahora));
    for (const cobro of cobros) {
      const saldo = saldoCobro(cobro);
      if (!saldo.gt(0)) continue;
      const dias = -diasParaVencer(cobro.vence, hoy)!;
      lista.push({ nivel: dias > 15 ? "rojo" : "amarillo", tipo: "cobro", texto: `${cobro.contrato.contacto.nombre}: saldo pendiente $${saldo.toFixed(2)} MXN · ${dias} días de atraso (${cobro.concepto}, #${cobro.id})`, donde: "/cobros" });
    }
    return resumenAlertas(lista, hoy, ahora);
  });
}
