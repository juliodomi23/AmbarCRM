import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { destinoPublico, esIpInterna, validarWebhookUrl } from "../src/lib/webhook-url.ts";
import { orgDeArchivo } from "../src/lib/media-nombre.ts";
import { ipCliente, permitido } from "../src/lib/rate-limit.ts";

// SSRF: el administrador de cualquier empresa configura la URL del bot.
for (const interna of ["127.0.0.1", "10.0.0.5", "172.20.1.1", "192.168.1.10", "169.254.169.254", "100.64.0.1",
  "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:7f00:1"]) {
  assert.equal(esIpInterna(interna), true, `${interna} es interna`);
}
for (const publica of ["8.8.8.8", "31.220.49.58", "172.32.0.1", "2606:4700::1111"]) {
  assert.equal(esIpInterna(publica), false, `${publica} es pública`);
}
for (const url of [
  "http://db:5432", "http://app:3000/api/cron/x", "http://localhost/x", "http://n8n.local/hook",
  "http://2130706433/", "http://0x7f000001/", "http://127.1/", "http://[::1]/", "http://[fd00::1]/",
  "http://169.254.169.254/latest/meta-data", "ftp://ejemplo.com", "https://usuario:clave@ejemplo.com",
]) {
  assert.ok(validarWebhookUrl(url), `debe rechazar ${url}`);
}
assert.equal(validarWebhookUrl("https://n8n.ambarrojostudios.cloud/webhook/bot"), null);
assert.equal(await destinoPublico("http://db:5432"), false);
assert.equal(await destinoPublico("https://8.8.8.8/hook"), true);
assert.equal(await destinoPublico("https://localtest.me/hook"), false, "dominio público que resuelve a 127.0.0.1");

// Archivos: el nombre lleva la empresa dueña.
assert.equal(orgDeArchivo("o42-1760000000000-abcd.jpg"), 42n);
assert.equal(orgDeArchivo("1760000000000-abcd.jpg"), null);
assert.equal(orgDeArchivo("../o7-1-a.jpg"), 7n);

// Límite de intentos: por clave y por IP.
for (let i = 0; i < 3; i++) assert.equal(permitido("prueba:ip", 3, 60_000), true);
assert.equal(permitido("prueba:ip", 3, 60_000), false);
assert.equal(ipCliente({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }), "1.2.3.4");
assert.equal(ipCliente({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }), "5.6.7.8");

// Piezas que no deben desaparecer.
const [media, auth, config, importar, enviar] = await Promise.all([
  readFile("src/app/api/media/[archivo]/route.ts", "utf8"),
  readFile("src/lib/auth.ts", "utf8"),
  readFile("next.config.mjs", "utf8"),
  readFile("src/app/api/contactos/importar/route.ts", "utf8"),
  readFile("src/app/api/mensajes/enviar/route.ts", "utf8"),
]);
assert.match(media, /orgDeArchivo\(archivo\)/, "media verifica la empresa dueña");
assert.match(auth, /login-ip:/, "login limitado por IP");
assert.match(config, /Strict-Transport-Security/);
assert.match(importar, /status: 413/);
assert.match(enviar, /MAX_BASE64/);

console.log("seguridad: SSRF, archivos por empresa, límites e intentos OK");
