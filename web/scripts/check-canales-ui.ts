import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const proxy = await readFile("src/proxy.ts", "utf8");
const patron = /matcher:\s*\["([^"]+)"\]/.exec(proxy)![1];
const protegido = new RegExp(`^${patron}$`);
for (const ruta of ["/api/canales", "/api/canales/1", "/api/messenger/webhooks", "/api/messenger/privado", "/configuracion", "/chat"]) assert.equal(protegido.test(ruta), true, ruta);
for (const ruta of ["/api/canal-api/1/mensajes", "/api/messenger/webhook"]) assert.equal(protegido.test(ruta), false, ruta);
const [chat, pagina, lista, config] = await Promise.all([
  readFile("src/components/chat/ChatCliente.tsx", "utf8"), readFile("src/app/(app)/chat/page.tsx", "utf8"),
  readFile("src/app/api/conversaciones/route.ts", "utf8"), readFile("src/components/config/Canales.tsx", "utf8"),
]);
for (const origen of [pagina, lista]) for (const dato of ["canalProveedor", "ultimoEntranteAt"]) assert.ok(origen.includes(dato), `SSR y refresco deben conservar ${dato}`);
assert.match(chat, /seleccionada && esWhatsapp && \(/, "plantillas oficiales solo en WhatsApp");
assert.match(chat, /esMessenger && mensajes.length > 0 && !cargandoMsgs && !ventana.abierta/);
for (const tipo of ["cloud_api", "messenger", "api"]) assert.ok(config.includes(`value="${tipo}"`));
const [externo, configuracion] = await Promise.all([
  readFile("src/components/config/CanalExterno.tsx", "utf8"),
  readFile("src/app/(app)/configuracion/page.tsx", "utf8"),
]);
assert.match(configuracion, /session\?\.user\?\.rol !== "admin"\) redirect/);
assert.match(externo, /canal && esMessenger && <Boton/);
assert.match(externo, /onClick=\{\(\) => void desconectar\(\)\}>Desconectar<\/Boton>/);
for (const texto of ["Se cancelará la suscripción en Facebook", "Borrar conversaciones", "Conservar historial"]) assert.ok(externo.includes(texto));
assert.match(externo, /if \(!continuar\) return;/, "cancelar la primera confirmación no desconecta");
console.log("OK · canales UI: selector, datos SSR/SSE, ventanas separadas, rutas públicas exactas y desconexión Messenger solo en configuración admin con confirmación e historial opcional");
