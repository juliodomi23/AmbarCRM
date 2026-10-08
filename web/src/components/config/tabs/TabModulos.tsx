"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CitasConfig } from "@/components/config/CitasConfig";
import { toast } from "@/components/Toaster";
import { Boton } from "@/components/ui";
import { api, PUESTOS } from "@/components/config/tabs/shared";

export function TabModulos({ modulos, canales }: { modulos: any[]; canales: any[] }) {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [puestos, setPuestos] = useState<Record<string, string[]>>({});
  useEffect(() => {
    fetch("/api/modulos")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.modulos ?? []);
        setConfig(
          Object.fromEntries(
            (d.modulos ?? []).map((m: any) => [
              m.clave,
              JSON.stringify(
                Object.fromEntries(
                  Object.entries(m.config ?? {}).filter(
                    ([clave]) => clave !== "puestosPermitidos",
                  ),
                ),
                null,
                2,
              ),
            ]),
          ),
        );
        setPuestos(
          Object.fromEntries(
            (d.modulos ?? []).map((m: any) => [
              m.clave,
              m.config?.puestosPermitidos ?? [],
            ]),
          ),
        );
      });
  }, []);
  async function guardar(clave: string) {
    try {
      const body = JSON.parse(config[clave] || "{}");
      body.puestosPermitidos = puestos[clave] ?? [];
      if (await api("/api/modulos", "PATCH", { clave, config: body }))
        router.refresh();
    } catch {
      toast("La configuración debe ser JSON válido", "error");
    }
  }
  async function guardarAccesos(clave: string) {
    if (
      await api("/api/modulos", "PATCH", {
        clave,
        config: { puestosPermitidos: puestos[clave] ?? [] },
      })
    ) {
      toast("Accesos guardados");
      router.refresh();
    }
  }
  function togglePuesto(clave: string, puesto: string) {
    setPuestos((actual) => {
      const seleccionados = actual[clave] ?? [];
      return {
        ...actual,
        [clave]: seleccionados.includes(puesto)
          ? seleccionados.filter((item) => item !== puesto)
          : [...seleccionados, puesto],
      };
    });
  }
  return (
    <div className="max-w-2xl space-y-3">
      {items.map((m) => (
        <div
          key={m.clave}
          className="rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{m.nombre}</p>
              <p className="text-xs text-muted-foreground">{m.descripcion}</p>
            </div>
            <span
              className={
                m.activo
                  ? "text-xs text-success"
                  : "text-xs text-muted-foreground"
              }
            >
              {m.activo ? "Activo" : "No activado"}
            </span>
          </div>
          {m.activo && (
            <>
              <div className="mt-4 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Puestos permitidos</p>
                    <p className="text-xs text-muted-foreground">
                      Sin puestos seleccionados, todo el equipo puede entrar.
                    </p>
                  </div>
                  <Boton onClick={() => guardarAccesos(m.clave)}>
                    Guardar accesos
                  </Boton>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {PUESTOS.map((puesto) => (
                    <label key={puesto} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={(puestos[m.clave] ?? []).includes(puesto)}
                        onChange={() => togglePuesto(m.clave, puesto)}
                      />
                      {puesto}
                    </label>
                  ))}
                </div>
              </div>
              {m.clave === "citas" && (
                <CitasConfig modulo={m} canales={canales} />
              )}
              {m.clave !== "citas" && (
                <textarea
                  value={config[m.clave] ?? "{}"}
                  onChange={(e) =>
                    setConfig({ ...config, [m.clave]: e.target.value })
                  }
                  rows={5}
                  className="mt-3 w-full rounded-lg border border-input p-2 font-mono text-xs"
                />
              )}
              {m.clave !== "citas" && (
                <Boton className="mt-2" onClick={() => guardar(m.clave)}>
                  Guardar configuración
                </Boton>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
