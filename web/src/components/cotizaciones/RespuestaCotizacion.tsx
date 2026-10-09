"use client";

import { useState } from "react";
import { Boton } from "@/components/ui";

export function RespuestaCotizacion({ token, estadoInicial, respondidoPor, respondidoAt, modo }: {
  token: string; estadoInicial: string; respondidoPor?: string | null; respondidoAt?: string | null; modo?: "imprimir";
}) {
  const [estado, setEstado] = useState(estadoInicial);
  const [nombre, setNombre] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  if (modo === "imprimir") return <Boton onClick={() => window.print()}>Imprimir / Guardar PDF</Boton>;
  if (["aceptada", "rechazada", "vencida"].includes(estado)) {
    return <div className="rounded-lg bg-muted p-4 text-sm"><p className="font-semibold capitalize">Cotización {estado}</p>{respondidoPor && <p>Respuesta de {respondidoPor}{respondidoAt ? ` · ${new Date(respondidoAt).toLocaleString("es-MX")}` : ""}</p>}</div>;
  }
  async function responder(accion: "aceptar" | "rechazar") {
    setEnviando(true); setMensaje("");
    const respuesta = await fetch(`/api/public/cotizaciones/${token}/responder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion, nombre }) });
    const resultado = await respuesta.json().catch(() => ({}));
    setEnviando(false);
    if (!respuesta.ok) return setMensaje(resultado.error ?? "No se pudo guardar la respuesta");
    setEstado(resultado.cotizacion.estado);
    setMensaje(resultado.repetida ? "Esta respuesta ya estaba registrada." : "Gracias. Tu respuesta quedó registrada.");
  }
  return <div className="space-y-3"><div><h3 className="font-semibold">Responder cotización</h3><p className="text-sm text-muted-foreground">Escribe el nombre de quien acepta o rechaza.</p></div><input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={160} placeholder="Nombre completo" className="w-full rounded-lg border border-input px-3 py-2 text-sm" /><div className="flex gap-2"><Boton disabled={enviando || !nombre.trim()} onClick={() => responder("aceptar")}>Aceptar</Boton><Boton variante="danger" disabled={enviando || !nombre.trim()} onClick={() => responder("rechazar")}>Rechazar</Boton></div>{mensaje && <p className="text-sm">{mensaje}</p>}</div>;
}
