"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, CLASE_CAMPO } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { REGIMENES_FISCALES, USOS_CFDI } from "@/lib/cfdi/validar";

export type DatosFiscalesVista = {
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  codigoPostal: string;
  usoCfdi: string;
  correo: string | null;
};

function errorApi(payload: unknown, respaldo: string) {
  if (payload && typeof payload === "object" && "error" in payload) return String(payload.error);
  return respaldo;
}

export function DatosFiscalesFicha({
  contactoId,
  datos,
}: {
  contactoId: string;
  datos: DatosFiscalesVista | null;
}) {
  const router = useRouter();
  const [formulario, setFormulario] = useState({
    rfc: datos?.rfc ?? "",
    razonSocial: datos?.razonSocial ?? "",
    regimenFiscal: datos?.regimenFiscal ?? "601",
    codigoPostal: datos?.codigoPostal ?? "",
    usoCfdi: datos?.usoCfdi ?? "G03",
    correo: datos?.correo ?? "",
  });
  const [guardando, setGuardando] = useState(false);

  function set(campo: keyof typeof formulario, valor: string) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (guardando) return;
    setGuardando(true);
    try {
      const respuesta = await fetch(`/api/contactos/${contactoId}/datos-fiscales`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formulario),
      });
      const payload = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        toast(errorApi(payload, "No se pudieron guardar los datos fiscales"), "error");
        return;
      }
      toast("Datos fiscales guardados");
      router.refresh();
    } catch {
      toast("No se pudieron guardar los datos fiscales. Revisa tu conexión.", "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">Datos fiscales</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Se usan para emitir la factura CFDI. Sin RFC y régimen fiscal no se puede facturar.
        </p>
      </div>
      <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">RFC</span>
          <input
            value={formulario.rfc}
            onChange={(evento) => set("rfc", evento.target.value.toUpperCase())}
            maxLength={13}
            required
            placeholder="XAXX010101000"
            className={CLASE_CAMPO}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Razón social</span>
          <input
            value={formulario.razonSocial}
            onChange={(evento) => set("razonSocial", evento.target.value)}
            maxLength={254}
            required
            className={CLASE_CAMPO}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Régimen fiscal</span>
          <select
            value={formulario.regimenFiscal}
            onChange={(evento) => set("regimenFiscal", evento.target.value)}
            className={CLASE_CAMPO}
          >
            {REGIMENES_FISCALES.map((regimen) => (
              <option key={regimen} value={regimen}>{regimen}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Código postal</span>
          <input
            value={formulario.codigoPostal}
            onChange={(evento) => set("codigoPostal", evento.target.value.replace(/\D/gu, "").slice(0, 5))}
            inputMode="numeric"
            maxLength={5}
            required
            className={CLASE_CAMPO}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Uso de CFDI</span>
          <select
            value={formulario.usoCfdi}
            onChange={(evento) => set("usoCfdi", evento.target.value)}
            className={CLASE_CAMPO}
          >
            {USOS_CFDI.map((uso) => (
              <option key={uso} value={uso}>{uso}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Correo para la factura</span>
          <input
            value={formulario.correo}
            onChange={(evento) => set("correo", evento.target.value)}
            type="email"
            maxLength={254}
            className={CLASE_CAMPO}
          />
        </label>
        <div className="flex justify-end sm:col-span-2">
          <Boton type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar datos fiscales"}
          </Boton>
        </div>
      </form>
    </section>
  );
}
