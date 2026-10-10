import { Prisma } from "@prisma/client";
import { cantidad, cantidadValidaParaProducto } from "@/lib/cantidad";
import { dinero } from "@/lib/dinero";

export type ConfigPedidos = {
  permiteEntrega: boolean;
  permiteRecoger: boolean;
  minimoCompra: Prisma.Decimal;
  costoEnvio: Prisma.Decimal;
  maxPorTelefono: number;
  maxPorIp: number;
  horasVencimiento: number;
  plantillaPedido: { name: string; language: string } | null;
};

function entero(valor: unknown, minimo: number, maximo: number, defecto: number) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= minimo && numero <= maximo ? numero : defecto;
}

function monto(valor: unknown, defecto: string) {
  return new Prisma.Decimal(String(dinero(valor) ?? defecto));
}

export function configPedidos(config: unknown): ConfigPedidos {
  const valor = (config ?? {}) as Record<string, unknown>;
  const plantilla = valor.plantillaPedido as Record<string, unknown> | null;
  return {
    permiteEntrega: valor.permiteEntrega !== false,
    permiteRecoger: valor.permiteRecoger !== false,
    minimoCompra: monto(valor.minimoCompra, "0"),
    costoEnvio: monto(valor.costoEnvio, "0"),
    maxPorTelefono: entero(valor.maxPorTelefono, 1, 20, 3),
    maxPorIp: entero(valor.maxPorIp, 1, 100, 10),
    horasVencimiento: entero(valor.horasVencimiento, 1, 8760, 24),
    plantillaPedido:
      plantilla && typeof plantilla.name === "string" && typeof plantilla.language === "string"
        ? { name: plantilla.name.trim(), language: plantilla.language.trim() }
        : null,
  };
}

export type PartidaPedidoEntrada = { productoId: bigint; cantidad: Prisma.Decimal };

export function validarPartidasPedido(valor: unknown) {
  if (!Array.isArray(valor) || valor.length === 0 || valor.length > 100) return null;
  const partidas = new Map<string, PartidaPedidoEntrada>();
  for (const item of valor) {
    const dato = item as Record<string, unknown>;
    const id = String(dato?.productoId ?? "");
    const cantidadPedida = cantidad(dato?.cantidad, new Prisma.Decimal("0.001"));
    if (!/^\d+$/.test(id) || !cantidadPedida) return null;
    const anterior = partidas.get(id)?.cantidad ?? new Prisma.Decimal(0);
    partidas.set(id, { productoId: BigInt(id), cantidad: anterior.plus(cantidadPedida) });
  }
  return [...partidas.values()];
}

export function cantidadPedidoValida(cantidadPedida: Prisma.Decimal, vendePorPeso: boolean) {
  return cantidadPedida.lte(9999) && cantidadValidaParaProducto(cantidadPedida, vendePorPeso);
}
