"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Botón "Conectar WhatsApp Oficial (Meta)" — Embedded Signup de Tech Provider.
// Lanza el popup de Meta, captura el `code` + el evento WA_EMBEDDED_SIGNUP
// (waba_id / phone_number_id) y lo manda a /api/wa/onboard.
// Requiere: NEXT_PUBLIC_META_APP_ID y NEXT_PUBLIC_META_CONFIG_ID.

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: any;
  }
}

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;
const CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID;
const FB_ORIGINS = ["https://www.facebook.com", "https://web.facebook.com"];

export function EmbeddedSignup() {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // Datos del evento WA_EMBEDDED_SIGNUP (llegan por postMessage, no por el callback de FB.login).
  const datos = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  useEffect(() => {
    if (!APP_ID) return;
    // Cargar el SDK de Facebook una sola vez.
    if (!document.getElementById("facebook-jssdk")) {
      window.fbAsyncInit = () => {
        window.FB?.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: true, version: "v21.0" });
      };
      const s = document.createElement("script");
      s.id = "facebook-jssdk";
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      s.async = true;
      s.defer = true;
      document.body.appendChild(s);
    }

    // Capturar waba_id / phone_number_id del popup.
    function onMessage(event: MessageEvent) {
      if (!FB_ORIGINS.includes(event.origin)) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH") {
          datos.current = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id };
        }
      } catch {
        /* mensajes no-JSON del SDK: ignorar */
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function conectar() {
    setError(null);
    setOk(null);
    if (!window.FB) return setError("El SDK de Meta aún no cargó. Reintenta en unos segundos.");
    if (!CONFIG_ID) return setError("Falta NEXT_PUBLIC_META_CONFIG_ID.");

    window.FB.login(
      async (resp: any) => {
        const code = resp?.authResponse?.code;
        if (!code) return setError("Conexión cancelada o sin permisos.");
        const { wabaId, phoneNumberId } = datos.current;
        if (!wabaId || !phoneNumberId) {
          return setError("No se recibieron los datos de la cuenta. Reintenta el flujo completo.");
        }
        setCargando(true);
        const res = await fetch("/api/wa/onboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, wabaId, phoneNumberId })
        });
        const d = await res.json().catch(() => ({}));
        setCargando(false);
        if (!res.ok) return setError(d.error ?? "Error al conectar.");
        setOk(`Conectado · ${d.phoneNumberId}`);
        router.refresh();
      },
      { config_id: CONFIG_ID, response_type: "code", override_default_response_type: true, extras: { setup: {} } }
    );
  }

  if (!APP_ID || !CONFIG_ID) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        WhatsApp Oficial (coexistencia Meta) sin configurar. Define{" "}
        <code>NEXT_PUBLIC_META_APP_ID</code> y <code>NEXT_PUBLIC_META_CONFIG_ID</code> tras
        aprobarte como Tech Provider. Ver <code>MULTI-TENANT.md</code>.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <p className="font-semibold text-slate-700">WhatsApp Oficial (coexistencia Meta)</p>
      <p className="text-xs text-slate-500">
        Conecta tu número manteniendo la app de WhatsApp Business. Sin QR ni tokens manuales.
      </p>
      <button
        onClick={conectar}
        disabled={cargando}
        className="rounded-lg bg-[#1877F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#1568d8] disabled:opacity-60"
      >
        {cargando ? "Conectando…" : "Conectar WhatsApp Oficial"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-green-600">{ok}</p>}
    </div>
  );
}
