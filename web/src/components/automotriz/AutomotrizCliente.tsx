"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo, Modal, formatoMoneda } from "@/components/ui";
import { toast } from "@/components/Toaster";

const ESTADOS = ["disponible", "reservado", "vendido", "taller"] as const;
type EstadoVehiculo = (typeof ESTADOS)[number];

const ETIQUETAS: Record<EstadoVehiculo, string> = {
  disponible: "Disponible",
  reservado: "Reservado",
  vendido: "Vendido",
  taller: "En taller",
};

const COLORES: Record<EstadoVehiculo, string> = {
  disponible: "bg-emerald-100 text-emerald-700",
  reservado: "bg-amber-100 text-amber-700",
  vendido: "bg-slate-200 text-slate-700",
  taller: "bg-violet-100 text-violet-700",
};

type Vehiculo = {
  id: string;
  numeroStock: string | null;
  vin: string | null;
  marca: string;
  modelo: string;
  anio: number;
  version: string | null;
  color: string | null;
  kilometraje: number;
  precio: string;
  moneda: string;
  estado: EstadoVehiculo;
  fotoUrl: string | null;
  notas: string | null;
};

const FORMULARIO_INICIAL = {
  numeroStock: "",
  vin: "",
  marca: "",
  modelo: "",
  anio: String(new Date().getFullYear()),
  version: "",
  color: "",
  kilometraje: "0",
  precio: "",
  estado: "disponible" as EstadoVehiculo,
  fotoUrl: "",
  notas: "",
};

function mensajeError(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    return String(payload.error);
  }
  return "No se pudo guardar el vehículo";
}

export function AutomotrizCliente({ vehiculos }: { vehiculos: Vehiculo[] }) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [modal, setModal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL);

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return vehiculos.filter((vehiculo) => {
      if (filtroEstado && vehiculo.estado !== filtroEstado) return false;
      if (!termino) return true;
      return [
        vehiculo.marca,
        vehiculo.modelo,
        vehiculo.version,
        vehiculo.numeroStock,
        vehiculo.vin,
      ].some((valor) => valor?.toLowerCase().includes(termino));
    });
  }, [busqueda, filtroEstado, vehiculos]);

  const disponibles = vehiculos.filter((vehiculo) => vehiculo.estado === "disponible");
  const reservados = vehiculos.filter((vehiculo) => vehiculo.estado === "reservado").length;
  const vendidos = vehiculos.filter((vehiculo) => vehiculo.estado === "vendido").length;
  const valorInventario = disponibles.reduce(
    (total, vehiculo) => total + Number(vehiculo.precio),
    0,
  );

  function set(campo: keyof typeof formulario, valor: string) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    const respuesta = await fetch("/api/automotriz/vehiculos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formulario),
    });
    const payload = await respuesta.json().catch(() => null);
    setGuardando(false);
    if (!respuesta.ok) {
      toast(mensajeError(payload), "error");
      return;
    }
    setFormulario(FORMULARIO_INICIAL);
    setModal(false);
    toast("Vehículo agregado");
    router.refresh();
  }

  async function cambiarEstado(vehiculo: Vehiculo, estado: EstadoVehiculo) {
    const respuesta = await fetch(`/api/automotriz/vehiculos/${vehiculo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    const payload = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      toast(mensajeError(payload), "error");
      return;
    }
    toast(`Estado actualizado a ${ETIQUETAS[estado].toLowerCase()}`);
    router.refresh();
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Automotriz</h1>
          <p className="text-sm text-muted-foreground">
            Inventario y disponibilidad de vehículos.
          </p>
        </div>
        <Boton onClick={() => setModal(true)}>+ Agregar vehículo</Boton>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="Disponibles" valor={String(disponibles.length)} />
        <Kpi etiqueta="Reservados" valor={String(reservados)} />
        <Kpi etiqueta="Vendidos" valor={String(vendidos)} />
        <Kpi etiqueta="Valor disponible" valor={formatoMoneda(valorInventario)} />
      </section>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar marca, modelo, stock o VIN…"
          className="min-w-64 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm"
        />
        <select
          value={filtroEstado}
          onChange={(evento) => setFiltroEstado(evento.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((estado) => (
            <option key={estado} value={estado}>
              {ETIQUETAS[estado]}
            </option>
          ))}
        </select>
      </div>

      {filtrados.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((vehiculo) => (
            <VehiculoCard
              key={vehiculo.id}
              vehiculo={vehiculo}
              onCambiarEstado={cambiarEstado}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="font-semibold">No hay vehículos con esos filtros</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Agrega el primer vehículo o cambia la búsqueda.
          </p>
        </div>
      )}

      <Modal abierto={modal} onClose={() => setModal(false)} titulo="Agregar vehículo">
        <form onSubmit={guardar} className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <Campo
              label="Marca"
              value={formulario.marca}
              onChange={(evento) => set("marca", evento.target.value)}
              required
            />
            <Campo
              label="Modelo"
              value={formulario.modelo}
              onChange={(evento) => set("modelo", evento.target.value)}
              required
            />
            <Campo
              label="Año"
              type="number"
              min="1900"
              value={formulario.anio}
              onChange={(evento) => set("anio", evento.target.value)}
              required
            />
            <Campo
              label="Versión"
              value={formulario.version}
              onChange={(evento) => set("version", evento.target.value)}
            />
            <Campo
              label="Número de stock"
              value={formulario.numeroStock}
              onChange={(evento) => set("numeroStock", evento.target.value)}
            />
            <Campo
              label="VIN"
              value={formulario.vin}
              onChange={(evento) => set("vin", evento.target.value)}
            />
            <Campo
              label="Color"
              value={formulario.color}
              onChange={(evento) => set("color", evento.target.value)}
            />
            <Campo
              label="Kilometraje"
              type="number"
              min="0"
              value={formulario.kilometraje}
              onChange={(evento) => set("kilometraje", evento.target.value)}
              required
            />
            <Campo
              label="Precio"
              type="number"
              min="0"
              step="0.01"
              value={formulario.precio}
              onChange={(evento) => set("precio", evento.target.value)}
              required
            />
            <label className="block space-y-1">
              <span className="text-sm font-medium text-muted-foreground">Estado</span>
              <select
                value={formulario.estado}
                onChange={(evento) => set("estado", evento.target.value)}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm"
              >
                {ESTADOS.map((estado) => (
                  <option key={estado} value={estado}>
                    {ETIQUETAS[estado]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Campo
            label="URL de fotografía"
            type="url"
            value={formulario.fotoUrl}
            onChange={(evento) => set("fotoUrl", evento.target.value)}
          />
          <label className="block space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Notas</span>
            <textarea
              rows={2}
              value={formulario.notas}
              onChange={(evento) => set("notas", evento.target.value)}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Boton type="button" variante="ghost" onClick={() => setModal(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar vehículo"}
            </Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Kpi({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <p className="text-xs font-medium uppercase text-muted-foreground">{etiqueta}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{valor}</p>
    </div>
  );
}

function VehiculoCard({
  vehiculo,
  onCambiarEstado,
}: {
  vehiculo: Vehiculo;
  onCambiarEstado: (vehiculo: Vehiculo, estado: EstadoVehiculo) => void;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      {vehiculo.fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={vehiculo.fotoUrl}
          alt={`${vehiculo.marca} ${vehiculo.modelo}`}
          className="h-40 w-full object-cover"
        />
      ) : (
        <div className="grid h-32 place-items-center bg-muted text-4xl" aria-hidden>
          🚗
        </div>
      )}
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">
              {vehiculo.marca} {vehiculo.modelo} {vehiculo.anio}
            </h2>
            <p className="text-xs text-muted-foreground">
              {[vehiculo.version, vehiculo.color].filter(Boolean).join(" · ") || "Sin detalles"}
            </p>
          </div>
          <span className={`rounded-full px-2 py-1 text-xs ${COLORES[vehiculo.estado]}`}>
            {ETIQUETAS[vehiculo.estado]}
          </span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-lg font-bold">{formatoMoneda(Number(vehiculo.precio))}</p>
            <p className="text-xs text-muted-foreground">
              {vehiculo.kilometraje.toLocaleString("es-MX")} km
              {vehiculo.numeroStock ? ` · Stock ${vehiculo.numeroStock}` : ""}
            </p>
          </div>
          <select
            value={vehiculo.estado}
            onChange={(evento) =>
              onCambiarEstado(vehiculo, evento.target.value as EstadoVehiculo)
            }
            className="rounded-lg border border-input px-2 py-1.5 text-xs"
            aria-label={`Estado de ${vehiculo.marca} ${vehiculo.modelo}`}
          >
            {ESTADOS.map((estado) => (
              <option key={estado} value={estado}>
                {ETIQUETAS[estado]}
              </option>
            ))}
          </select>
        </div>
        {vehiculo.notas && (
          <p className="line-clamp-2 border-t border-border pt-2 text-xs text-muted-foreground">
            {vehiculo.notas}
          </p>
        )}
      </div>
    </article>
  );
}
