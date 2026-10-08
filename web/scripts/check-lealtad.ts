import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buscarCliente,
  configSinSecretos,
  diezDigitos,
  formaDeAviso,
  slugValido,
  tarjetaPublica,
  textoPremio,
  type ClienteAurum,
} from "../src/lib/lealtad.ts";

const cliente: ClienteAurum = {
  token: "secreto-de-la-tarjeta",
  name: "Ana López",
  phone: "9611234567",
  stamps: 4,
  rewards: 1,
  pending_rewards: 1,
};

// Teléfonos: Aurum guarda 10 dígitos o con lada; AmbarCRM, con 521.
assert.equal(diezDigitos("+52 1 961 123 4567"), "9611234567");
assert.equal(diezDigitos("123"), null);
assert.equal(buscarCliente([cliente], "5219611234567"), cliente);
assert.equal(buscarCliente([{ ...cliente, phone: "529611234567" }], "9611234567")?.name, "Ana López");
assert.equal(buscarCliente([cliente], "5219990000000"), null);
assert.equal(buscarCliente([cliente], null), null);

assert.equal(slugValido(" Mi-Barberia "), "mi-barberia");
assert.equal(slugValido("../admin"), null);
assert.equal(slugValido("a"), null);

// Secretos: ni la clave cifrada ni el token de la tarjeta salen al navegador.
const publico = configSinSecretos({
  puestosPermitidos: [],
  aurum: { slug: "barberia", claveCifrada: "encv1:x:y:z", estado: "ok" },
});
assert.ok(!JSON.stringify(publico).includes("claveCifrada"));
assert.deepEqual((publico.aurum as { slug: string }).slug, "barberia");
assert.ok(!JSON.stringify(tarjetaPublica(cliente)).includes("secreto"));

// Aviso: texto libre si la ventana está abierta; plantilla solo con la ventana cerrada.
const plantilla = { name: "premio_lealtad", language: "es_MX" };
assert.equal(formaDeAviso(plantilla, true), "texto");
assert.equal(formaDeAviso(plantilla, false), "plantilla");
assert.equal(formaDeAviso(null, true), "texto");
assert.equal(formaDeAviso(null, false), "nota");
assert.match(textoPremio("Ana López", ["Corte gratis"]), /Felicidades Ana! Ganaste: Corte gratis/);

// Piezas que no deben desaparecer en un refactor.
const [webhook, modulosApi, sql, aurum] = await Promise.all([
  readFile("src/app/api/public/aurum/webhook/route.ts", "utf8"),
  readFile("src/app/api/modulos/route.ts", "utf8"),
  readFile("prisma/sql/actualizaciones.sql", "utf8"),
  readFile("src/lib/aurum.ts", "utf8"),
]);
assert.match(webhook, /timingSafeEqual/);
assert.match(webhook, /clientesAurum\(conexion, \{ fresco: true \}\)/, "el webhook re-verifica con Aurum");
assert.match(modulosApi, /configSinSecretos/);
assert.match(modulosApi, /delete \(config as Record<string, unknown>\)\.aurum/);
assert.match(sql, /CREATE OR REPLACE FUNCTION resolve_org_by_aurum_slug/);
assert.match(aurum, /process\.env\.AURUM_URL/, "la URL de Aurum viene del entorno, nunca del cliente");

console.log("lealtad: teléfonos, secretos, avisos y webhook OK");
