import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { cantidadPedidoValida, configPedidos, validarPartidasPedido } from "../src/lib/pedidos";

const config = configPedidos({ minimoCompra: "250.50", costoEnvio: "49.90", maxPorTelefono: 4, maxPorIp: 12, permiteEntrega: true, permiteRecoger: false });
assert.equal(config.minimoCompra.toString(), "250.5");
assert.equal(config.costoEnvio.toString(), "49.9");
assert.equal(config.maxPorTelefono, 4);
assert.equal(config.maxPorIp, 12);
assert.equal(config.permiteRecoger, false);

const partidas = validarPartidasPedido([{ productoId: "10", cantidad: "0.750" }, { productoId: "10", cantidad: "0.250" }]);
assert.equal(partidas?.length, 1);
assert.equal(partidas?.[0].cantidad.toString(), "1");
assert.equal(cantidadPedidoValida(new Prisma.Decimal("1.5"), false), false);
assert.equal(cantidadPedidoValida(new Prisma.Decimal("1.234"), true), true);
assert.equal(validarPartidasPedido([{ productoId: "otra-empresa", cantidad: 1 }]), null);

const cuerpoManipulado = { total: "0.01", partidas: [{ productoId: "10", cantidad: "2" }] };
assert.equal("total" in (validarPartidasPedido(cuerpoManipulado.partidas)?.[0] ?? {}), false);

console.log(JSON.stringify({
  config: { minimo: config.minimoCompra.toFixed(2), envio: config.costoEnvio.toFixed(2), maxTelefono: config.maxPorTelefono, maxIp: config.maxPorIp },
  cantidades: { duplicadasAcumuladas: partidas?.[0].cantidad.toString(), piezaFraccionaria: "rechazada", pesoTresDecimales: "aceptado" },
  totalNavegadorIgnorado: true,
}));
