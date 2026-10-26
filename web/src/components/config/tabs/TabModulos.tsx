"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CitasConfig } from "@/components/config/CitasConfig";
import { LealtadConfig } from "@/components/lealtad/LealtadConfig";
import { PagosConfig } from "@/components/config/PagosConfig";
import { toast } from "@/components/Toaster";
import { Boton } from "@/components/ui";
import { api, PUESTOS } from "@/components/config/tabs/shared";

/** Módulos con formulario propio en lugar del JSON libre. */
const CONFIG_PROPIA = new Set([
  "citas",
  "lealtad",
  "marketing",
  "meta_ads",
  "pagos_en_linea",
]);

export function TabModulos({
  modulos,
  canales,
}: {
  modulos: any[];
  canales: any[];
}) {
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
  function actualizarConfigVentas(campo: "preciosIncluyenIva" | "iva8Habilitado", valor: boolean) {
    let actual: Record<string, unknown>;
    try {
      actual = JSON.parse(config.ventas ?? "{}");
    } catch {
      return;
    }
    actual[campo] = valor;
    setConfig({ ...config, ventas: JSON.stringify(actual, null, 2) });
  }
  return (
    <div className="max-w-2xl space-y-3">
      {items.map((m) => (
        <div key={m.clave} className="surface p-4">
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
                    <label
                      key={puesto}
                      className="flex items-center gap-2 text-sm"
                    >
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
              {m.clave === "lealtad" && (
                <LealtadConfig modulo={m} canales={canales} />
              )}
              {m.clave === "pagos_en_linea" && <PagosConfig modulo={m} />}
              {m.clave === "ventas" && (
                <div className="mt-3 space-y-2 rounded-lg border border-border p-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={(() => { try { return JSON.parse(config.ventas ?? "{}").preciosIncluyenIva !== false; } catch { return true; } })()} onChange={(e) => actualizarConfigVentas("preciosIncluyenIva", e.target.checked)} />
                    Los precios incluyen IVA (configuración por defecto)
                  </label>
                  <p className="text-xs text-muted-foreground">Al desactivarlo, el IVA se suma al precio como concepto separado. Confirma la configuración fiscal con tu contador.</p>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={(() => { try { return JSON.parse(config.ventas ?? "{}").iva8Habilitado === true; } catch { return false; } })()} onChange={(e) => actualizarConfigVentas("iva8Habilitado", e.target.checked)} />
                    Habilitar tasa del 8 % en el catálogo de productos
                  </label>
                  <p className="text-xs text-muted-foreground">Solo admin. Actívala si la organización acredita los requisitos del estímulo fronterizo. Validar con contador.</p>
                  <Boton onClick={() => guardar("ventas")}>Guardar configuración</Boton>
                </div>
              )}
              {(m.clave === "marketing" || m.clave === "meta_ads") && (
                <div className="mt-3 space-y-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  <p>
                    El equipo prepara borradores y los administradores aprueban
                    el plan. Puedes ajustar los accesos arriba.
                  </p>
                  <p>
                    {m.clave === "meta_ads"
                      ? "La conexión publicitaria está pendiente. Aprobar una propuesta no publica anuncios ni genera gasto en Meta."
                      : "Las campañas se organizan dentro del CRM. Guardarlas no publica contenido ni envía mensajes."}
                  </p>
                  <a
                    className="inline-flex min-h-10 items-center font-medium text-primary underline underline-offset-4"
                    href={m.ruta}
                  >
                    Abrir {m.nombre} →
                  </a>
                </div>
              )}
              {!CONFIG_PROPIA.has(m.clave) && (
                <textarea
                  value={config[m.clave] ?? "{}"}
                  onChange={(e) =>
                    setConfig({ ...config, [m.clave]: e.target.value })
                  }
                  rows={5}
                  className="mt-3 w-full rounded-lg border border-input p-2 font-mono text-xs"
                />
              )}
              {!CONFIG_PROPIA.has(m.clave) && (
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
