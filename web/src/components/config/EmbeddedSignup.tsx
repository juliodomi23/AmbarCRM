"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Botón "Conectar WhatsApp Oficial (Meta)" — Embedded Signup de Tech Provider.
// Lanza el popup de Meta, captura el `code` + el evento WA_EMBEDDED_SIGNUP
// (waba_id / phone_number_id) y lo manda a /api/wa/onboard.
// Requiere: NEXT_PUBLIC_META_APP_ID y NEXT_PUBLIC_META_CONFIG_ID.
// Referencia: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation

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

type ResultadoSignup = "numero" | "solo-waba" | "coexistencia" | "cancelado" | "error";

export function EmbeddedSignup() {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // Datos del evento WA_EMBEDDED_SIGNUP (llegan por postMessage, no por el callback de FB.login).
  const datos = useRef<{ resultado?: ResultadoSignup; wabaId?: string; phoneNumberId?: string }>({});

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
        if (data.type !== "WA_EMBEDDED_SIGNUP") return;
        const payload = data.data || {};

        if (data.event === "FINISH") {
          datos.current = {
            resultado: "numero",
            wabaId: payload.waba_id,
            phoneNumberId: payload.phone_number_id
          };
          setInfo("Meta conectó el número. Terminando la configuración en AmbarCRM…");
        } else if (data.event === "FINISH_ONLY_WABA") {
          datos.current = { resultado: "solo-waba", wabaId: payload.waba_id };
          setInfo("Meta compartió la cuenta de WhatsApp, pero no conectó ningún número. Repite el flujo y agrega o selecciona un número.");
          setCargando(false);
        } else if (data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
          datos.current = {
            resultado: "coexistencia",
            wabaId: payload.waba_id,
            phoneNumberId: payload.phone_number_id
          };
          setInfo("Coexistence fue autorizado. Sincronizando el número con AmbarCRM…");
        } else if (data.event === "ERROR") {
          datos.current = { resultado: "error" };
          const referencia = payload.error_code ? ` Código: ${payload.error_code}.` : "";
          setError(`${payload.error_message || "Meta no pudo completar la conexión."}${referencia}`);
          setCargando(false);
        } else if (data.event === "CANCEL") {
          datos.current = { resultado: "cancelado" };
          if (payload.error_message) {
            const referencia = payload.error_code ? ` Código: ${payload.error_code}.` : "";
            setError(`Meta reportó un problema: ${payload.error_message}.${referencia}`);
          } else {
            const paso = payload.current_step ? ` en el paso ${payload.current_step}` : "";
            setError(`La conexión fue cancelada${paso}. No se guardaron cambios.`);
          }
          setCargando(false);
        }
      } catch {
        /* mensajes no-JSON del SDK: ignorar */
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function finalizar(resp: any) {
    const code = resp?.authResponse?.code;
    if (!code) {
      setCargando(false);
      if (["cancelado", "error", "solo-waba"].includes(datos.current.resultado || "")) return;
      return setError("Conexión cancelada o sin permisos.");
    }
    // El callback OAuth y el postMessage de sesión pueden llegar en distinto orden.
    for (let intento = 0; intento < 20 && !datos.current.resultado; intento++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const { resultado, wabaId, phoneNumberId } = datos.current;
    if (["cancelado", "error", "solo-waba"].includes(resultado || "")) {
      setCargando(false);
      return;
    }
    if (!wabaId) {
      setCargando(false);
      return setError("Meta no devolvió la WABA. Reintenta el flujo completo.");
    }
    const res = await fetch("/api/wa/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        wabaId,
        phoneNumberId,
        onboardingMode: resultado === "coexistencia" ? "coexistence" : "cloud_api"
      })
    });
    const d = await res.json().catch(() => ({}));
    setCargando(false);
    if (!res.ok) return setError(d.error ?? "Error al conectar.");
    setInfo(null);
    setOk(`${resultado === "coexistencia" ? "Coexistence conectado" : "Número conectado"} · ${d.phoneNumberId}`);
    if (d.aviso) setError(d.aviso);
    router.refresh();
  }

  // coexistencia = número que vive en la app WhatsApp Business del celular.
  // Sin ella: número nuevo o ya registrado en la API de Meta.
  function conectar(coexistencia: boolean) {
    setError(null);
    setInfo(null);
    setOk(null);
    if (!window.FB) {
      return setError(
        "No se pudo cargar la conexión con Meta. Si usas Brave o un bloqueador de anuncios, desactívalo para este sitio y recarga la página."
      );
    }
    if (!CONFIG_ID) return setError("Falta NEXT_PUBLIC_META_CONFIG_ID.");
    datos.current = {};
    setCargando(true);

    // El SDK de Meta rechaza callbacks async ("asyncfunction, not function"): por eso
    // el callback es síncrono y delega en finalizar().
    window.FB.login(
      (resp: any) => {
        finalizar(resp).catch(() => {
          setCargando(false);
          setError("No se pudo completar la conexión. Reintenta.");
        });
      },
      {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: coexistencia
          ? { setup: {}, featureType: "whatsapp_business_app_onboarding" }
          : { setup: {} }
      }
    );
  }

  if (!APP_ID || !CONFIG_ID) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        WhatsApp Oficial sin configurar. Define <code>NEXT_PUBLIC_META_APP_ID</code> y{" "}
        <code>NEXT_PUBLIC_META_CONFIG_ID</code> y vuelve a desplegar. Ver <code>DESPLIEGUE.md</code>.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4">
      <p className="font-semibold text-foreground">WhatsApp Oficial · Meta</p>
      <p className="text-xs text-muted-foreground">
        Usa el primer botón para un número nuevo o que ya está en la API de Meta. Usa el segundo
        para un número que hoy usas en la app WhatsApp Business del celular y quieres seguir usando ahí.
      </p>
      <p className="text-xs font-medium text-foreground">
        En la ventana de Meta, revisa que el portafolio seleccionado sea el de tu negocio.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => conectar(false)}
          disabled={cargando}
          className="rounded-lg bg-[rgb(24,119,242)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(21,104,216)] disabled:opacity-60"
        >
          {cargando ? "Conectando…" : "Conectar con Meta"}
        </button>
        <button
          onClick={() => conectar(true)}
          disabled={cargando}
          className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60"
        >
          Conectar mi app WhatsApp Business
        </button>
      </div>
      <div aria-live="polite">
        {info && <p className="text-sm text-blue-700">{info}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {ok && <p className="text-sm text-green-600">{ok}</p>}
      </div>
    </div>
  );
}
