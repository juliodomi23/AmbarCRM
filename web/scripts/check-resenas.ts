import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calificacionValida, configResenas, enlaceGoogleValido, origenValido, resumenResenas, semanaLocal } from "../src/lib/resenas";
import { matrizQr, qrSvg } from "../src/lib/qr-svg";

// Solo https y dominios de Google: nada de open redirect.
for (const bueno of ["https://g.page/r/CabC123/review", "https://www.google.com/maps/place/x", "https://maps.app.goo.gl/abc", "https://search.google.com/local/writereview?placeid=1"]) {
  assert.ok(enlaceGoogleValido(bueno), bueno);
}
for (const malo of ["http://g.page/r/x", "https://evil.test/g.page", "https://google.com.evil.test/x", "https://evilgoogle.com/x", "https://user:pw@g.page/x", "javascript:alert(1)", "//evil.test", "", null, 7]) {
  assert.equal(enlaceGoogleValido(malo), null, String(malo));
}

assert.equal(origenValido("Mostrador"), "mostrador");
assert.equal(origenValido("mesa-3_a"), "mesa-3_a");
for (const invalido of ["mesa 3", "mesa/3", "ñandú", "", undefined, "a".repeat(41), "<script>"]) assert.equal(origenValido(invalido), "directo");
assert.equal(origenValido("a".repeat(40)), "a".repeat(40));

assert.equal(calificacionValida("5"), 5);
for (const invalida of [0, 6, 2.5, "x", null, undefined]) assert.equal(calificacionValida(invalida), null);

assert.deepEqual(configResenas({}), { enlaceGoogle: null, diasEntreSolicitudes: 90, plantillaResena: null });
assert.equal(configResenas({ enlaceGoogle: "http://evil.test", diasEntreSolicitudes: 0 }).enlaceGoogle, null);
assert.equal(configResenas({ diasEntreSolicitudes: 30 }).diasEntreSolicitudes, 30);
assert.equal(configResenas({ diasEntreSolicitudes: 4000 }).diasEntreSolicitudes, 90);

// La semana empieza en lunes y respeta la zona: 2026-10-12 02:00Z sigue siendo domingo 11 en Ciudad de México.
assert.equal(semanaLocal(new Date("2026-10-12T02:00:00Z"), "America/Mexico_City"), "2026-10-05");
assert.equal(semanaLocal(new Date("2026-10-12T12:00:00Z"), "America/Mexico_City"), "2026-10-12");

const resumen = resumenResenas([
  { calificacion: 5, origen: "mostrador", createdAt: new Date("2026-10-06T18:00:00Z") },
  { calificacion: 1, origen: "mostrador", createdAt: new Date("2026-10-07T18:00:00Z") },
  { calificacion: 4, origen: "directo", createdAt: new Date("2026-10-13T18:00:00Z") },
], "America/Mexico_City");
assert.equal(resumen.total, 3);
assert.equal(resumen.promedio, 10 / 3);
assert.deepEqual(resumen.distribucion, [1, 0, 0, 1, 1]);
assert.deepEqual(resumen.tendencia.map((fila) => [fila.clave, fila.total]), [["2026-10-05", 2], ["2026-10-12", 1]]);
assert.deepEqual(resumen.origenes.map((fila) => [fila.clave, fila.total]), [["mostrador", 2], ["directo", 1]]);

// QR propio: tamaños por versión y límite.
assert.equal(matrizQr("a".repeat(14)).length, 21);
assert.equal(matrizQr("a".repeat(15)).length, 25);
assert.equal(matrizQr("a".repeat(213)).length, 57);
assert.throws(() => matrizQr("a".repeat(214)));
assert.match(qrSvg("https://crm.test/opinion/x?o=directo"), /^<svg[^>]+><rect[^>]+\/><path d="M[^"]+"/);

// La ruta pública jamás redirige a lo que llegue en la petición.
const publica = await readFile("src/app/api/public/opinion/[slug]/route.ts", "utf8");
assert.match(publica, /limitarIp\(/);
assert.match(publica, /negocio\.enlaceGoogle/);
assert.doesNotMatch(publica, /body\.(url|redirect|destino|next)/);
const ajustes = await readFile("src/app/api/resenas/ajustes/route.ts", "utf8");
assert.match(ajustes, /conModulo\("resenas", \{ admin: true \}/);
assert.match(ajustes, /enlaceGoogleValido/);
for (const ruta of ["src/app/api/citas/[id]/route.ts", "src/app/api/ventas/[id]/route.ts"]) {
  const contenido = await readFile(ruta, "utf8");
  assert.match(contenido, /solicitarResena\(/, `${ruta} debe pedir la reseña tras cambiar de estado`);
}
const envio = await readFile("src/lib/resenas-envio.ts", "utf8");
assert.match(envio, /FOR UPDATE/);
const proxy = await readFile("src/proxy.ts", "utf8");
assert.match(proxy, /\|opinion\|/);

console.log("resenas: enlace de Google, origen, estrellas, config, semana local, QR y ruta pública OK");
