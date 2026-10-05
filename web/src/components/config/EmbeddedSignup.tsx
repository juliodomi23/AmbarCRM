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
const GRAPH_VERSION = process.env.NEXT_PUBLIC_META_GRAPH_VERSION || "v26.0";
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
        window.FB?.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: true, version: GRAPH_VERSION });
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
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        const finished = data.event === "FINISH" || data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";
        if (data.type === "WA_EMBEDDED_SIGNUP" && finished) {
          datos.current = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id };
        } else if (data.type === "WA_EMBEDDED_SIGNUP" && data.event === "ERROR") {
          setError(data.data?.error_message || "Meta no pudo completar la conexión.");
          setCargando(false);
        } else if (data.type === "WA_EMBEDDED_SIGNUP" && data.event === "CANCEL") {
          setError("Conexión cancelada.");
          setCargando(false);
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
    datos.current = {};
    setCargando(true);

    window.FB.login(
      async (resp: any) => {
        const code = resp?.authResponse?.code;
        if (!code) {
          setCargando(false);
          return setError("Conexión cancelada o sin permisos.");
        }
        // El callback OAuth y el postMessage de sesión pueden llegar en distinto orden.
        for (let intento = 0; intento < 20 && !datos.current.wabaId; intento++) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        const { wabaId, phoneNumberId } = datos.current;
        if (!wabaId) {
          setCargando(false);
          return setError("Meta no devolvió la WABA. Reintenta el flujo completo.");
        }
        const res = await fetch("/api/wa/onboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, wabaId, phoneNumberId, onboardingMode: "coexistence" })
        });
        const d = await res.json().catch(() => ({}));
        setCargando(false);
        if (!res.ok) return setError(d.error ?? "Error al conectar.");
        setOk(`Conectado · ${d.phoneNumberId}`);
        router.refresh();
      },
      {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "whatsapp_business_app_onboarding" }
      }
    );
  }

  if (!APP_ID || !CONFIG_ID) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        WhatsApp Oficial con Coexistence sin configurar. Define{" "}
        <code>NEXT_PUBLIC_META_APP_ID</code> y <code>NEXT_PUBLIC_META_CONFIG_ID</code> tras
        aprobarte como Tech Provider. Ver <code>MULTI-TENANT.md</code>.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <p className="font-semibold text-slate-700">WhatsApp Oficial · Meta Coexistence</p>
      <p className="text-xs text-slate-500">
        Conecta directamente con Meta y conserva la app WhatsApp Business en el teléfono.
      </p>
      <button
        onClick={conectar}
        disabled={cargando}
        className="rounded-lg bg-[#1877F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#1568d8] disabled:opacity-60"
      >
        {cargando ? "Conectando…" : "Conectar con Meta"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-green-600">{ok}</p>}
    </div>
  );
}
