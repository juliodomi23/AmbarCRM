import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { ChatCliente, type ConversacionItem } from "../src/components/chat/ChatCliente";
import { nombreVisibleCanal, tipoCanal, tiposDeBandeja, sumarNoLeidosPorTipo, type TipoCanal } from "../src/lib/channel/tipo-canal";

assert.equal(tipoCanal("cloud_api"), "whatsapp");
assert.equal(tipoCanal("api"), "whatsapp");
assert.equal(tipoCanal("messenger"), "messenger");
assert.equal(tipoCanal("instagram"), "instagram");
assert.equal(nombreVisibleCanal("Ámbar Rojo", "messenger"), "Messenger · Ámbar Rojo");
assert.equal(nombreVisibleCanal("Ámbar Rojo", "instagram"), "Instagram · Ámbar Rojo");
assert.equal(nombreVisibleCanal("Messenger · Ámbar Rojo", "messenger"), "Messenger · Ámbar Rojo");
assert.equal(nombreVisibleCanal("Instagram Ámbar Rojo", "instagram"), "Instagram Ámbar Rojo");
assert.equal(nombreVisibleCanal("Ámbar Rojo", "cloud_api"), "Ámbar Rojo");
assert.deepEqual(sumarNoLeidosPorTipo([
  { canalId: 1n, noLeidos: 2 }, { canalId: 2n, noLeidos: 3 },
  { canalId: 3n, noLeidos: 1 }, { canalId: 4n, noLeidos: 4 },
  { canalId: null, noLeidos: 5 },
], [
  { id: 1n, proveedor: "cloud_api" }, { id: 2n, proveedor: "api" },
  { id: 3n, proveedor: "messenger" }, { id: 4n, proveedor: "instagram" },
]), { whatsapp: 10, messenger: 1, instagram: 4 });

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
const renderizar = (canalesVisibles: typeof canales, tipoInicial?: TipoCanal, conversacionesVisibles = conversaciones,
  noLeidosIniciales = { whatsapp: 0, messenger: 0, instagram: 0 }) => renderToStaticMarkup(createElement(AppRouterContext.Provider,
  { value: router }, createElement(SearchParamsContext.Provider, { value: new URLSearchParams() },
    createElement(ChatCliente, { canales: canalesVisibles, conversaciones: conversacionesVisibles, noLeidosIniciales, plantillas: [], usuarioId: "7", tipoInicial }))));

const mixto = renderizar(canales);
assert.ok(mixto.includes('aria-label="Tipo de canal"'));
assert.ok(mixto.includes("Todos los estados") && !mixto.includes('aria-label="Filtrar por canal"'));
assert.ok(mixto.includes("Contacto 1") && !mixto.includes("Contacto 2") && !mixto.includes("Contacto 3"));
assert.ok(mixto.includes("Mis (1)"));
assert.ok(!mixto.includes('<option value="2"') && !mixto.includes('<option value="3"'));

const directoMessenger = renderizar(canales, "messenger");
assert.ok(directoMessenger.includes("Contacto 2") && !directoMessenger.includes("Contacto 1"));
assert.ok(!directoMessenger.includes('aria-label="Filtrar por canal"'));
assert.ok(directoMessenger.includes('title="Messenger · Canal"') && directoMessenger.includes('>Canal</span>'));

const soloInstagram = renderizar(canales.slice(2), undefined, conversaciones.slice(2));
assert.ok(soloInstagram.includes('aria-label="Tipo de canal"'));
assert.ok(!soloInstagram.includes('aria-label="Filtrar por canal"'));
assert.ok(soloInstagram.includes('title="Instagram · Canal"') && soloInstagram.includes('>Canal</span>'));
assert.ok(soloInstagram.includes("Contacto 3") && !soloInstagram.includes("Contacto 1"));

const canalesMeta = canales.slice(1);
assert.deepEqual(tiposDeBandeja(canalesMeta), { disponibles: ["whatsapp", "messenger", "instagram"], inicial: "messenger" });
const soloMeta = renderizar(canalesMeta, undefined, conversaciones.slice(1));
assert.ok(soloMeta.indexOf('aria-label="WhatsApp"') < soloMeta.indexOf('aria-label="Messenger"'));
assert.ok(soloMeta.indexOf('aria-label="Messenger"') < soloMeta.indexOf('aria-label="Instagram"'));
assert.ok(soloMeta.includes("Contacto 2") && !soloMeta.includes("Contacto 3"));
const conConteos = renderizar(canales, "whatsapp", conversaciones.slice(0, 1), { whatsapp: 3, messenger: 1, instagram: 120 });
assert.ok(conConteos.includes('aria-label="WhatsApp, 3 sin leer"'));
assert.ok(conConteos.includes('aria-label="Messenger, 1 sin leer"'));
assert.ok(conConteos.includes('aria-label="Instagram, 120 sin leer"'));
assert.ok(conConteos.includes('>99+</span>'));
const whatsappSinCanal = renderizar(canalesMeta, "whatsapp", conversaciones.slice(1));
assert.ok(whatsappSinCanal.includes("Esta empresa no tiene un canal de WhatsApp conectado."));
assert.ok(!whatsappSinCanal.includes("Aún no hay conversaciones") && !whatsappSinCanal.includes('aria-label="Filtrar por canal"'));
const sinCanal = { ...conversacion("4", "cloud_api"), canalId: null, canalProveedor: null };
const whatsappHistorico = renderizar(canalesMeta, "whatsapp", [...conversaciones.slice(1), sinCanal]);
assert.ok(whatsappHistorico.includes("Contacto 4") && !whatsappHistorico.includes("Contacto 2"));

const soloWhatsapp = renderizar(canales.slice(0, 1));
assert.ok(!soloWhatsapp.includes('aria-label="Tipo de canal"'));
assert.ok(soloWhatsapp.includes("Contacto 1"));

console.log("OK · bandeja por tipo: pestañas, filtros y conteo global de no leídos por canal");
