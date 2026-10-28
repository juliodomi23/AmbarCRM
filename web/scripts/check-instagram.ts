import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CanalExterno } from "../src/components/config/CanalExterno";
import { IconoCanal } from "../src/components/chat/IconoCanal";
import { validarCondiciones } from "../src/lib/automatizaciones-esquema";
import { urlInstagramLogin } from "../src/lib/meta/instagram-login";
import { graphMensajeriaMeta, hostMensajeria } from "../src/lib/channel/meta-mensajeria";
import { verificarFirmaInstagramCanal } from "../src/lib/meta/signature";
import { createHmac } from "node:crypto";
import { nombreVisibleCanal } from "../src/lib/channel/tipo-canal";

const fuente = await readFile("src/proxy.ts", "utf8");
const patron = /matcher:\s*\["([^"]+)"\]/.exec(fuente)![1];
const protegido = new RegExp(`^${patron}$`);
assert.equal(protegido.test("/api/instagram/webhook"), false);
for (const ruta of ["/api/instagram/webhooks", "/api/instagram/privado", "/api/canales", "/configuracion"]) assert.equal(protegido.test(ruta), true);
const sinNavegar = () => undefined;
const router = { back: sinNavegar, forward: sinNavegar, refresh: sinNavegar, push: sinNavegar, replace: sinNavegar, prefetch: sinNavegar, bfcacheId: "instagram" };
const formulario = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(CanalExterno, { tipo: "instagram" })));
for (const texto of ["Instagram", "instagram_id", "24 h", "App Secret", "cuenta profesional", "Conectar con Instagram", "conexión manual"]) assert.ok(formulario.includes(texto), texto);
assert.equal((formulario.match(/type="password"/g) ?? []).length, 2);
assert.ok(!formulario.includes("Quitar app propia") && !formulario.includes("Regenerar credenciales"));
const icono = renderToStaticMarkup(createElement(IconoCanal, { proveedor: "instagram" }));
assert.ok(icono.includes('aria-label="Instagram"') && icono.includes("<rect"));
assert.deepEqual(validarCondiciones([{ tipo: "canal", valor: "instagram" }]), [{ tipo: "canal", valor: "instagram" }]);
assert.throws(() => validarCondiciones([{ tipo: "canal", valor: "otro" }]));
const sql = await readFile("prisma/sql/actualizaciones.sql", "utf8");
assert.ok(sql.includes("ALTER TYPE proveedor_canal ADD VALUE IF NOT EXISTS 'instagram'"));
assert.ok(sql.includes("canales_instagram_cuenta_activa_uq") && sql.includes("REVOKE ALL ON FUNCTION resolve_org_by_instagram(text) FROM PUBLIC"));
assert.ok(sql.includes("COALESCE(config->>'login', '') <> 'instagram'"));
process.env.INSTAGRAM_APP_ID = "123";
process.env.INSTAGRAM_APP_SECRET = "secreto-instagram";
process.env.META_APP_SECRET = "secreto-meta";
const oauth = new URL(urlInstagramLogin("https://crm.ejemplo.com", "estado"));
assert.equal(oauth.origin, "https://www.instagram.com");
assert.equal(oauth.searchParams.get("redirect_uri"), "https://crm.ejemplo.com/api/canales/instagram/oauth/callback");
assert.equal(oauth.searchParams.get("scope"), "instagram_business_basic,instagram_business_manage_messages");
assert.equal(oauth.searchParams.get("state"), "estado");
assert.equal(hostMensajeria({ login: "instagram" }), "https://graph.instagram.com/v26.0");
assert.equal(hostMensajeria({}), "https://graph.facebook.com/v26.0");
const fetchOriginal = globalThis.fetch;
const peticiones: { url: string; token: string | null }[] = [];
globalThis.fetch = async (url, init) => {
  peticiones.push({ url: String(url), token: new Headers(init?.headers).get("Authorization") });
  return Response.json({ success: true });
};
try {
  await graphMensajeriaMeta({ login: "instagram", token: "token-instagram" }, "me/messages");
  await graphMensajeriaMeta({ token: "token-pagina" }, "me/messages");
} finally { globalThis.fetch = fetchOriginal; }
assert.deepEqual(peticiones, [
  { url: "https://graph.instagram.com/v26.0/me/messages", token: "Bearer token-instagram" },
  { url: "https://graph.facebook.com/v26.0/me/messages", token: "Bearer token-pagina" },
]);
const cuerpo = '{"entry":[]}';
const firma = (secret: string) => `sha256=${createHmac("sha256", secret).update(cuerpo).digest("hex")}`;
assert.ok(verificarFirmaInstagramCanal({ login: "instagram" }, cuerpo, firma("secreto-instagram")));
assert.ok(!verificarFirmaInstagramCanal({ login: "instagram" }, cuerpo, firma("secreto-meta")));
assert.ok(verificarFirmaInstagramCanal({}, cuerpo, firma("secreto-meta")));
assert.ok(!verificarFirmaInstagramCanal({}, cuerpo, firma("secreto-instagram")));
assert.equal(nombreVisibleCanal("@julio", "instagram"), "Instagram · @julio");
console.log("OK · Instagram: login guiado y formulario manual, secretos ocultos, icono, condición estricta, migración y ruta pública exacta");
