import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { ChatCliente, type ConversacionItem } from "../src/components/chat/ChatCliente";
import { nombreVisibleCanal, tipoCanal, type TipoCanal } from "../src/lib/channel/tipo-canal";

assert.equal(tipoCanal("cloud_api"), "whatsapp");
assert.equal(tipoCanal("api"), "whatsapp");
assert.equal(tipoCanal("messenger"), "messenger");
assert.equal(tipoCanal("instagram"), "instagram");
assert.equal(nombreVisibleCanal("Ámbar Rojo", "messenger"), "Messenger · Ámbar Rojo");
assert.equal(nombreVisibleCanal("Ámbar Rojo", "instagram"), "Instagram · Ámbar Rojo");
assert.equal(nombreVisibleCanal("Messenger · Ámbar Rojo", "messenger"), "Messenger · Ámbar Rojo");
assert.equal(nombreVisibleCanal("Instagram Ámbar Rojo", "instagram"), "Instagram Ámbar Rojo");
assert.equal(nombreVisibleCanal("Ámbar Rojo", "cloud_api"), "Ámbar Rojo");

const sinNavegar = () => undefined;
const router = { back: sinNavegar, forward: sinNavegar, refresh: sinNavegar, push: sinNavegar, replace: sinNavegar, prefetch: sinNavegar, bfcacheId: "chat" };
const canales = [
  { id: "1", nombre: "WA", proveedor: "cloud_api", activo: true },
  { id: "2", nombre: "Página", proveedor: "messenger", activo: true },
  { id: "3", nombre: "Cuenta", proveedor: "instagram", activo: true },
];
const conversacion = (id: string, proveedor: string): ConversacionItem => ({
  id, contacto: { id, nombre: `Contacto ${id}`, telefono: null }, esPersonal: false, fijado: false,
  responsableId: id === "1" ? "7" : null, noLeidos: 0, ultimoMensajeAt: null, preview: "",
  estado: "abierta", etiquetas: [], canalId: id, canalNombre: "Canal", canalProveedor: proveedor,
  canalActivo: true, botActivo: false,
});
const conversaciones = [conversacion("1", "cloud_api"), conversacion("2", "messenger"), conversacion("3", "instagram")];
const renderizar = (canalesVisibles: typeof canales, tipoInicial?: TipoCanal) => renderToStaticMarkup(createElement(AppRouterContext.Provider,
  { value: router }, createElement(SearchParamsContext.Provider, { value: new URLSearchParams() },
    createElement(ChatCliente, { canales: canalesVisibles, conversaciones, plantillas: [], usuarioId: "7", tipoInicial }))));

const mixto = renderizar(canales);
assert.ok(mixto.includes('aria-label="Tipo de canal"'));
assert.ok(mixto.includes("Todos los canales de WhatsApp"));
assert.ok(mixto.includes("Contacto 1") && !mixto.includes("Contacto 2") && !mixto.includes("Contacto 3"));
assert.ok(mixto.includes("Mis (1)"));
assert.ok(!mixto.includes('<option value="2"') && !mixto.includes('<option value="3"'));

const directoMessenger = renderizar(canales, "messenger");
assert.ok(directoMessenger.includes("Contacto 2") && !directoMessenger.includes("Contacto 1"));
assert.ok(directoMessenger.includes("Todos los canales de Messenger"));
assert.ok(directoMessenger.includes("Messenger · Página"));

const soloInstagram = renderizar(canales.slice(2));
assert.ok(!soloInstagram.includes('aria-label="Tipo de canal"'));
assert.ok(soloInstagram.includes("Todos los canales de Instagram"));
assert.ok(soloInstagram.includes("Instagram · Cuenta"));
assert.ok(soloInstagram.includes("Contacto 3") && !soloInstagram.includes("Contacto 1"));

const soloWhatsapp = renderizar(canales.slice(0, 1));
assert.ok(!soloWhatsapp.includes('aria-label="Tipo de canal"'));
assert.ok(soloWhatsapp.includes("Contacto 1"));

console.log("OK · bandeja por tipo: WhatsApp por defecto, canales y contadores aislados, selector oculto con un solo tipo");
