"use client";

// Navegación de la demo sin servidor. Los componentes reales usan <Link>, usePathname, useSearchParams y
// useRouter: aquí se proveen esos contextos de next/navigation con una ruta simulada, y los clics en
// <a href="/…"> se resuelven dentro de la demo. Ruta = hash (/demo#/chat); la query va en la URL real
// (/demo?conv=3#/chat) para que window.location.search coincida con useSearchParams().
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { almacen } from "./almacen";

const EVENTO = "demo-navegacion";

function instantanea() {
  return `${window.location.search}${window.location.hash}`;
}
function suscribir(cb: () => void) {
  window.addEventListener("hashchange", cb);
  window.addEventListener("popstate", cb);
  window.addEventListener(EVENTO, cb);
  return () => {
    window.removeEventListener("hashchange", cb);
    window.removeEventListener("popstate", cb);
    window.removeEventListener(EVENTO, cb);
  };
}

export function partirHref(href: string) {
  const [sinHash] = href.split("#");
  const i = sinHash.indexOf("?");
  const ruta = (i === -1 ? sinHash : sinHash.slice(0, i)) || "/";
  const query = i === -1 ? "" : sinHash.slice(i);
  return { ruta: ruta.startsWith("/") ? ruta : `/${ruta}`, query };
}

export function irA(href: string, reemplazar = false) {
  const { ruta, query } = partirHref(href);
  const destino = `${window.location.pathname}${query}#${ruta}`;
  if (reemplazar) window.history.replaceState(null, "", destino);
  else window.history.pushState(null, "", destino);
  window.dispatchEvent(new Event(EVENTO));
  document.querySelector("main")?.scrollTo?.(0, 0);
}

type Nav = { ruta: string; query: string; ir: (href: string, reemplazar?: boolean) => void };
const NavContext = createContext<Nav>({ ruta: "/", query: "", ir: () => {} });
export const useNavegacionDemo = () => useContext(NavContext);

/** Rutas que la demo sabe pintar; el resto muestra la pantalla «no disponible en la demo». */
export type EsRutaDemo = (ruta: string) => boolean;

export function NavegacionDemo({ children }: { children: React.ReactNode }) {
  const loc = useSyncExternalStore(suscribir, instantanea, () => "");
  const [antesDeHash, hash = ""] = loc.split("#");
  const ruta = hash.startsWith("/") ? partirHref(hash).ruta : "/";
  const query = antesDeHash;

  const ir = useCallback((href: string, reemplazar = false) => irA(href, reemplazar), []);

  const router = useMemo(
    () => ({
      push: (href: string) => irA(href),
      replace: (href: string) => irA(href, true),
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      // En el CRM real refresh() vuelve a pedir las props al servidor; aquí se recalculan del almacén.
      refresh: () => almacen.notificar(),
      prefetch: () => {},
      hmrRefresh: () => {},
    }),
    [],
  );
  const parametros = useMemo(() => new URLSearchParams(query), [query]);
  const nav = useMemo(() => ({ ruta, query, ir }), [ruta, query, ir]);

  // Captura clics en <a href="/…"> antes que React/Next: la demo no deja que Link navegue al servidor.
  useEffect(() => {
    const alHacerClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("/") || href.startsWith("//")) return; // externos, mailto:, tel:, #…
      if (a.hasAttribute("data-demo-salir") || href === "/login") return; // salir de la demo
      e.preventDefault();
      e.stopPropagation();
      // Páginas públicas del CRM (tienda, reservas, cotización…): son del servidor y no forman parte de la demo.
      if (/^\/(tienda|reservar|cotizacion|opinion|caja\/ticket|privacidad|terminos|eliminacion-datos)(\/|$)/.test(href)) {
        void fetch(href);
        return;
      }
      if (a.hasAttribute("download") || href.startsWith("/api/")) {
        void fetch(href); // la capa responde «En la demo esto no se guarda» (nunca sale)
        return;
      }
      irA(href);
    };
    document.addEventListener("click", alHacerClic, true);
    return () => document.removeEventListener("click", alHacerClic, true);
  }, []);

  return (
    <NavContext.Provider value={nav}>
      <AppRouterContext.Provider value={router as any}>
        <PathnameContext.Provider value={ruta}>
          <SearchParamsContext.Provider value={parametros}>{children}</SearchParamsContext.Provider>
        </PathnameContext.Provider>
      </AppRouterContext.Provider>
    </NavContext.Provider>
  );
}
