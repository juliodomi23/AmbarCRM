import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CanalExterno } from "../src/components/config/CanalExterno";

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
assert.match(chat, /esMensajeriaMeta && mensajes.length > 0 && !cargandoMsgs && !ventana.abierta/);
for (const tipo of ["cloud_api", "messenger", "instagram", "api"]) assert.ok(config.includes(`value="${tipo}"`));
assert.match(config, /value="messenger" disabled=\{!metaRevision\}/, "Messenger solo se habilita con META_CANALES_REVISION");
assert.match(config, /value="instagram" disabled=\{!metaRevision\}/, "Instagram solo se habilita con META_CANALES_REVISION");
const [externo, configuracion] = await Promise.all([
  readFile("src/components/config/CanalExterno.tsx", "utf8"),
  readFile("src/app/(app)/configuracion/page.tsx", "utf8"),
]);
assert.match(configuracion, /session\?\.user\?\.rol !== "admin"\) redirect/);
assert.match(externo, /canal && esMeta && <Boton/);
assert.match(externo, /onClick=\{\(\) => void desconectar\(\)\}>Desconectar<\/Boton>/);
for (const texto of ["Se cancelará la suscripción en Facebook", "Borrar conversaciones", "Conservar historial"]) assert.ok(externo.includes(texto));
assert.match(externo, /if \(!continuar\) return;/, "cancelar la primera confirmación no desconecta");
assert.match(externo, /if \(res.status === 502\) \{[\s\S]*?await confirmar\([\s\S]*?if \(!forzar\) return;[\s\S]*?res = await retirar\(true\);/, "el retiro forzado exige 502 y una segunda confirmación");
assert.ok(externo.includes("La suscripción puede seguir activa en Facebook"));
const sinNavegar = () => undefined;
const router = { back: sinNavegar, forward: sinNavegar, refresh: sinNavegar, push: sinNavegar, replace: sinNavegar, prefetch: sinNavegar, bfcacheId: "check" };
for (const caso of [
  { props: { canal: { id: "1", nombre: "Messenger de prueba", proveedor: "messenger" } }, desconectar: true },
  { props: { canal: { id: "3", nombre: "Instagram de prueba", proveedor: "instagram" } }, desconectar: true },
  { props: { canal: { id: "2", nombre: "API de prueba", proveedor: "api" } }, desconectar: false },
  { props: { tipo: "messenger" as const }, desconectar: false },
]) {
  const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(CanalExterno, caso.props)));
  assert.equal(/>Desconectar<\/button>/.test(html), caso.desconectar, "botón solo para un canal Messenger existente");
  assert.ok(!html.includes("Retirar solo del CRM"), "el retiro forzado no se ofrece de entrada");
}
console.log("OK · canales UI: selector, datos SSR/SSE, ventanas separadas, rutas públicas exactas y desconexión Messenger solo en configuración admin con confirmación e historial opcional");
