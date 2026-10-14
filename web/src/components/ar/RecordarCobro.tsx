"use client";
import { useState } from "react";
import { toast } from "@/components/Toaster";
import { confirmar } from "@/components/Confirmador";

export function RecordarCobro({ id }: { id: string }) {
  const [enviando, setEnviando] = useState(false);
  async function enviar() {
    if (!(await confirmar({ titulo: "Recordar cobro por WhatsApp", mensaje: "Se enviará un recordatorio al cliente por el canal oficial configurado.", confirmar: "Enviar" }))) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/cobros/${id}/recordar`, { method: "POST" });
      const data = await res.json();
      toast(res.ok ? "Recordatorio enviado" : data.error, res.ok ? "ok" : "error");
    } catch { toast("No se pudo conectar", "error"); }
    finally { setEnviando(false); }
  }
  return <button disabled={enviando} onClick={enviar} className="text-xs font-medium text-primary hover:underline disabled:opacity-50">{enviando ? "Enviando…" : "Recordar por WhatsApp"}</button>;
}
