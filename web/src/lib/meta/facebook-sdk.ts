"use client";

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: any;
  }
}

let carga: Promise<void> | undefined;
let appInicializada: string | undefined;

export function cargarFacebookSdk(appId: string): Promise<void> {
  if (appInicializada && appInicializada !== appId) return Promise.reject(new Error("La app de Facebook no coincide con la del CRM."));
  if (carga) return carga;
  appInicializada = appId;
  carga = new Promise((resolve, reject) => {
    const inicializar = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version: process.env.NEXT_PUBLIC_META_GRAPH_VERSION || "v26.0" });
      resolve();
    };
    if (window.FB) return inicializar();
    window.fbAsyncInit = inicializar;
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("No se pudo cargar Facebook. Revisa tu bloqueador y recarga la página."));
    document.body.appendChild(script);
  });
  return carga;
}
