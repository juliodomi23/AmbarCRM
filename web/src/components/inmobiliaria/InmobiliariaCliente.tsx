"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo, Modal, formatoMoneda } from "@/components/ui";
import { toast } from "@/components/Toaster";

const ESTADOS = ["disponible", "reservada", "vendida", "rentada"] as const;
type EstadoPropiedad = (typeof ESTADOS)[number];

const ETIQUETAS: Record<EstadoPropiedad, string> = {
  disponible: "Disponible",
  reservada: "Reservada",
  vendida: "Vendida",
  rentada: "Rentada",
};

type Propiedad = {
  id: string;
  clave: string | null;
  titulo: string;
  tipo: string;
  operacion: string;
  direccion: string | null;
  colonia: string | null;
  ciudad: string;
  recamaras: number;
  banos: string;
  superficie: string;
  precio: string;
  estado: EstadoPropiedad;
  fotoUrl: string | null;
  notas: string | null;
};

const INICIAL = {
  clave: "",
  titulo: "",
  tipo: "Casa",
  operacion: "Venta",
  direccion: "",
  colonia: "",
  ciudad: "",
  recamaras: "0",
  banos: "0",
  superficie: "0",
  precio: "",
  estado: "disponible" as EstadoPropiedad,
  fotoUrl: "",
  notas: "",
};

function errorApi(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    return String(payload.error);
  }
  return "No se pudo guardar la propiedad";
}

export function InmobiliariaCliente({ propiedades }: { propiedades: Propiedad[] }) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("");
  const [modal, setModal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [formulario, setFormulario] = useState(INICIAL);

  const filtradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return propiedades.filter((propiedad) => {
      if (estado && propiedad.estado !== estado) return false;
      if (!termino) return true;
      return [propiedad.titulo, propiedad.tipo, propiedad.ciudad, propiedad.colonia]
        .filter(Boolean)
        .some((valor) => valor!.toLowerCase().includes(termino));
    });
  }, [busqueda, estado, propiedades]);

  function set(campo: keyof typeof formulario, valor: string) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    const respuesta = await fetch("/api/inmobiliaria/propiedades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formulario),
    });
    const payload = await respuesta.json().catch(() => null);
    setGuardando(false);
    if (!respuesta.ok) return toast(errorApi(payload), "error");
    setFormulario(INICIAL);
    setModal(false);
    toast("Propiedad agregada");
    router.refresh();
  }

  async function cambiarEstado(propiedad: Propiedad, nuevo: EstadoPropiedad) {
    const respuesta = await fetch(`/api/inmobiliaria/propiedades/${propiedad.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nuevo }),
    });
    if (!respuesta.ok) {
      return toast(errorApi(await respuesta.json().catch(() => null)), "error");
    }
    router.refresh();
  }

  const disponibles = propiedades.filter((propiedad) => propiedad.estado === "disponible");
  const valor = disponibles.reduce((total, propiedad) => total + Number(propiedad.precio), 0);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inmobiliaria</h1>
          <p className="text-sm text-muted-foreground">Propiedades y citas de visita.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/citas"
            className="rounded-lg bg-muted px-3.5 py-2 text-sm font-medium"
          >
            Ver citas
          </Link>
          <Boton onClick={() => setModal(true)}>+ Propiedad</Boton>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Kpi etiqueta="Disponibles" valor={String(disponibles.length)} />
        <Kpi etiqueta="Publicadas" valor={String(propiedades.length)} />
        <Kpi etiqueta="Valor disponible" valor={formatoMoneda(valor)} />
      </section>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar propiedad, ciudad o colonia…"
          className="min-w-64 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm"
        />
        <select
          value={estado}
          onChange={(evento) => setEstado(evento.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((item) => (
            <option key={item} value={item}>{ETIQUETAS[item]}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtradas.map((propiedad) => (
          <article
            key={propiedad.id}
            className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
          >
            {propiedad.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={propiedad.fotoUrl}
                alt={propiedad.titulo}
                className="h-40 w-full object-cover"
              />
            ) : (
              <div className="grid h-32 place-items-center bg-muted text-4xl">🏠</div>
            )}
            <div className="space-y-3 p-4">
              <div className="flex justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{propiedad.titulo}</h2>
                  <p className="text-xs text-muted-foreground">
                    {propiedad.tipo} · {propiedad.operacion} · {propiedad.ciudad}
                  </p>
                </div>
                <select
                  value={propiedad.estado}
                  onChange={(evento) =>
                    cambiarEstado(propiedad, evento.target.value as EstadoPropiedad)
                  }
                  className="h-8 rounded-lg border border-input px-2 text-xs"
                >
                  {ESTADOS.map((item) => (
                    <option key={item} value={item}>{ETIQUETAS[item]}</option>
                  ))}
                </select>
              </div>
              <p className="text-xl font-bold">{formatoMoneda(Number(propiedad.precio))}</p>
              <p className="text-xs text-muted-foreground">
                {propiedad.recamaras} rec. · {propiedad.banos} baños · {propiedad.superficie} m²
              </p>
            </div>
          </article>
        ))}
      </div>

      <Modal abierto={modal} onClose={() => setModal(false)} titulo="Nueva propiedad">
        <form onSubmit={guardar} className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
          <Campo
            label="Título"
            value={formulario.titulo}
            onChange={(evento) => set("titulo", evento.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Campo
              label="Clave"
              value={formulario.clave}
              onChange={(e) => set("clave", e.target.value)}
            />
            <Campo
              label="Tipo"
              value={formulario.tipo}
              onChange={(e) => set("tipo", e.target.value)}
              required
            />
            <Campo
              label="Operación"
              value={formulario.operacion}
              onChange={(e) => set("operacion", e.target.value)}
              required
            />
            <Campo
              label="Ciudad"
              value={formulario.ciudad}
              onChange={(e) => set("ciudad", e.target.value)}
              required
            />
            <Campo
              label="Colonia"
              value={formulario.colonia}
              onChange={(e) => set("colonia", e.target.value)}
            />
            <Campo
              label="Dirección"
              value={formulario.direccion}
              onChange={(e) => set("direccion", e.target.value)}
            />
            <Campo
              label="Recámaras"
              type="number"
              min="0"
              value={formulario.recamaras}
              onChange={(e) => set("recamaras", e.target.value)}
            />
            <Campo
              label="Baños"
              type="number"
              min="0"
              step="0.5"
              value={formulario.banos}
              onChange={(e) => set("banos", e.target.value)}
            />
            <Campo
              label="Superficie m²"
              type="number"
              min="0"
              value={formulario.superficie}
              onChange={(e) => set("superficie", e.target.value)}
            />
            <Campo
              label="Precio"
              type="number"
              min="0"
              value={formulario.precio}
              onChange={(e) => set("precio", e.target.value)}
              required
            />
          </div>
          <Campo
            label="URL de fotografía"
            type="url"
            value={formulario.fotoUrl}
            onChange={(e) => set("fotoUrl", e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Boton type="button" variante="ghost" onClick={() => setModal(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
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
      <p className="text-xs uppercase text-muted-foreground">{etiqueta}</p>
      <p className="mt-1 text-2xl font-bold">{valor}</p>
    </div>
  );
}
