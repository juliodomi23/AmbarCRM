import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { dinero } from "@/lib/dinero";
import { configPedidos } from "@/lib/pedidos";

export const PATCH = conModulo("pedidos_en_linea", { admin: true }, async (_sesion, req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const minimoCompra = dinero(body.minimoCompra);
  const costoEnvio = dinero(body.costoEnvio);
  const maxPorTelefono = Number(body.maxPorTelefono);
  const maxPorIp = Number(body.maxPorIp);
  const horasVencimiento = Number(body.horasVencimiento);
  if (minimoCompra === null || costoEnvio === null || !Number.isInteger(maxPorTelefono) || maxPorTelefono < 1 || maxPorTelefono > 20 || !Number.isInteger(maxPorIp) || maxPorIp < 1 || maxPorIp > 100 || !Number.isInteger(horasVencimiento) || horasVencimiento < 1 || horasVencimiento > 8760) {
    return NextResponse.json({ error: "Revisa los ajustes" }, { status: 400 });
  }
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "pedidos_en_linea", activo: true } });
  if (!modulo) return NextResponse.json({ error: "Módulo no encontrado" }, { status: 404 });
  const anterior = (modulo.config ?? {}) as Record<string, unknown>;
  const config = configPedidos({
    ...anterior,
    permiteEntrega: body.permiteEntrega === true || body.permiteEntrega === "true",
    permiteRecoger: body.permiteRecoger === true || body.permiteRecoger === "true",
    minimoCompra, costoEnvio, maxPorTelefono, maxPorIp, horasVencimiento,
    plantillaPedido: String(body.plantillaNombre ?? "").trim()
      ? { name: String(body.plantillaNombre).trim(), language: String(body.plantillaIdioma ?? "es_MX").trim() }
      : null,
  });
  if (!config.permiteEntrega && !config.permiteRecoger) return NextResponse.json({ error: "Activa al menos una forma de entrega" }, { status: 400 });
  await db.moduloOrg.update({ where: { id: modulo.id }, data: { config: { ...anterior, permiteEntrega: config.permiteEntrega, permiteRecoger: config.permiteRecoger, minimoCompra: config.minimoCompra.toFixed(2), costoEnvio: config.costoEnvio.toFixed(2), maxPorTelefono, maxPorIp, horasVencimiento, plantillaPedido: config.plantillaPedido } } });
  return NextResponse.json({ ok: true });
});
