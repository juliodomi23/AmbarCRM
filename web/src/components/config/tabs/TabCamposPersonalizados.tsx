"use client";

import { useEffect, useState } from "react";
import { Boton, Campo } from "@/components/ui";
import { api } from "@/components/config/tabs/shared";

export function TabCamposPersonalizados() {
  const [campos, setCampos] = useState<any[]>([]);
  const [entidad, setEntidad] = useState("contacto");
  const [f, setF] = useState({
    clave: "",
    etiqueta: "",
    tipo: "texto",
    obligatorio: false,
    opciones: "",
  });
  const cargar = () =>
    fetch(`/api/campos-personalizados?entidad=${entidad}`)
      .then((r) => r.json())
      .then((d) => setCampos(d.campos ?? []));
  useEffect(() => {
    void fetch(`/api/campos-personalizados?entidad=${entidad}`)
      .then((r) => r.json())
      .then((d) => setCampos(d.campos ?? []));
  }, [entidad]);
  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (
      await api("/api/campos-personalizados", "POST", {
        ...f,
        entidad,
        opciones: f.tipo === "opcion"
          ? f.opciones.split(",").map((opcion) => opcion.trim()).filter(Boolean)
          : [],
      })
    ) {
      setF({
        clave: "",
        etiqueta: "",
        tipo: "texto",
        obligatorio: false,
        opciones: "",
      });
      cargar();
    }
  }
  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <p className="font-semibold">¿Para qué sirven?</p>
        <p className="mt-1">
          Agregan datos propios del negocio sin programar: por ejemplo tipo de
          tratamiento, presupuesto, zona de interés o vehículo buscado. Aparecen
          en la ficha, Chat, oportunidades, tabla de Contactos y archivos CSV.
        </p>
        <p className="mt-2 text-xs">
          La clave es interna y no cambia; la etiqueta es el nombre que verá el equipo.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={() => setEntidad("contacto")}
        >
          Contactos
        </button>
        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={() => setEntidad("oportunidad")}
        >
          Oportunidades
        </button>
      </div>
      <form
        onSubmit={crear}
        className="grid gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
      >
        <Campo
          label="Clave"
          value={f.clave}
          onChange={(e) =>
            setF({
              ...f,
              clave: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
            })
          }
          required
        />
        <Campo
          label="Etiqueta"
          value={f.etiqueta}
          onChange={(e) => setF({ ...f, etiqueta: e.target.value })}
          required
        />
        <select
          value={f.tipo}
          onChange={(e) => setF({ ...f, tipo: e.target.value })}
          className="rounded-lg border border-input px-3 py-2 text-sm"
        >
          <option value="texto">Texto</option>
          <option value="numero">Número</option>
          <option value="fecha">Fecha</option>
          <option value="opcion">Opción</option>
          <option value="si_no">Sí / no</option>
        </select>
        {f.tipo === "opcion" && (
          <Campo
            label="Opciones separadas por coma"
            value={f.opciones}
            onChange={(e) => setF({ ...f, opciones: e.target.value })}
            placeholder="Casa, Departamento, Terreno"
            required
          />
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.obligatorio}
            onChange={(e) => setF({ ...f, obligatorio: e.target.checked })}
          />{" "}
          Obligatorio
        </label>
        <Boton type="submit">Crear campo</Boton>
      </form>
      <div className="space-y-2">
        {campos.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
          >
            <span>
              {c.etiqueta}{" "}
              <span className="text-xs text-muted-foreground">({c.tipo})</span>
            </span>
            <button
              className="text-xs text-primary"
              onClick={async () => {
                await api(`/api/campos-personalizados/${c.id}`, "PATCH", {
                  activo: !c.activo,
                });
                cargar();
              }}
            >
              {c.activo ? "Desactivar" : "Activar"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
