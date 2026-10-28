"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";

export function AvisoConexionInstagram({ estado, mensaje }: { estado?: string; mensaje?: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!estado) return;
    const temporizador = window.setTimeout(() => {
      toast(mensaje || (estado === "ok" ? "Instagram conectado." : "No se pudo conectar. Vuelve a intentarlo o usa la conexión manual."), estado === "ok" ? "ok" : "error");
      router.replace("/configuracion", { scroll: false });
    }, 0);
    return () => window.clearTimeout(temporizador);
  }, [estado, mensaje, router]);

  return null;
}
