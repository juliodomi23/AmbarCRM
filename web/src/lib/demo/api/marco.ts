// Endpoints del marco (AppShell, paleta de comandos, push, next-auth) en la API simulada.
import { MODULOS, puestoPuedeAcceder, puestosPermitidosModulo } from "@/lib/modulos-catalogo";
import { moduloVisibleEnOrg } from "@/lib/modulos-plataforma";
import { almacen } from "../almacen";
import { contadoresShell, sesionDemo } from "../vistas";
import { ruta, ErrorApi } from "./ruteo";

/** GET /api/modulos: el catálogo real con el estado de la empresa demo (mismo formato que la ruta real). */
export function listarModulos() {
  const d = almacen.datos;
  const yo = sesionDemo(d);
  return {
    modulos: MODULOS.filter(m => moduloVisibleEnOrg(m, null)).map((m) => {
      const guardado = d.modulos[m.clave];
      const config = guardado?.config ?? {};
      return {
        ...m,
        activo: Boolean(guardado?.activo) && puestoPuedeAcceder(m.clave, config, yo.puesto, yo.rol),
        config: { ...config, puestosPermitidos: puestosPermitidosModulo(m.clave, config) },
      };
    }),
  };
}

ruta("GET", "/api/modulos", () => listarModulos());
ruta("GET", "/api/shell", () => contadoresShell(almacen.datos));

ruta("GET", "/api/buscar", ({ url }) => {
  const d = almacen.datos;
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 2) return { resultados: [] };
  const coincide = (c: (typeof d.contactos)[number]) =>
    [c.nombre, c.telefono, c.empresa, c.email].some((v) => (v ?? "").toLowerCase().includes(q));
  const contactos = d.contactos.filter(coincide);
  const ids = new Set(contactos.map((c) => c.id));
  const convs = d.conversaciones.filter((c) => ids.has(c.contactoId)).slice(0, 6);
  return {
    resultados: [
      ...contactos
        .slice(0, 6)
        .map((c) => ({ id: `contacto-${c.id}`, tipo: "Contacto", titulo: c.nombre, detalle: c.empresa || c.telefono || "", href: `/contactos?q=${encodeURIComponent(c.nombre)}` })),
      ...convs.map((c) => {
        const contacto = d.contactos.find((x) => x.id === c.contactoId)!;
        return { id: `conversacion-${c.id}`, tipo: "Conversación", titulo: contacto.nombre, detalle: c.noLeidos ? `${c.noLeidos} sin leer` : c.estado, href: `/chat?conv=${c.id}` };
      }),
    ],
  };
});

// Push: la demo no registra service worker ni suscripciones.
ruta("GET", "/api/push/suscribir", () => ({ configurado: false }));
ruta("POST", "/api/push/suscribir", () => ({ ok: true }));

// next-auth (SessionProvider del layout raíz y botón «Cerrar sesión»).
ruta("GET", "/api/auth/session", () => ({}));
ruta("GET", "/api/auth/csrf", () => ({ csrfToken: "demo" }));
ruta("POST", "/api/auth/signout", () => ({ url: "/login" }));
ruta("POST", "/api/auth/_log", () => ({ ok: true }));
ruta("GET", "/api/auth/providers", () => ({}));

export { ErrorApi };
