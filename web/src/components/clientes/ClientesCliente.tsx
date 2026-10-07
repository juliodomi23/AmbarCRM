"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AvatarNombre } from "@/components/AvatarNombre";
import { ZONA_CITAS } from "@/components/citas/fecha";
import { Boton, Campo, Modal } from "@/components/ui";
import { toast } from "@/components/Toaster";

type CitaCliente = {
  id: string;
  titulo: string;
  inicio: string;
  estado: string;
  doctor: { nombre: string } | null;
};

type Cliente = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  expediente: {
    fechaNacimiento: string | null;
    sexo: string | null;
    alergias: string | null;
    antecedentes: string | null;
  };
  citas: CitaCliente[];
};

type ContactoDisponible = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
};

const FORMULARIO_INICIAL = {
  contactoId: "",
  nombre: "",
  telefono: "",
  email: "",
  fechaNacimiento: "",
  sexo: "",
  alergias: "",
  antecedentes: "",
};

function edad(fecha: string | null) {
  if (!fecha) return null;
  const [anio, mes, dia] = fecha.slice(0, 10).split("-").map(Number);
  const hoy = new Date();
  let resultado = hoy.getFullYear() - anio;
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)) {
    resultado--;
  }
  return resultado;
}

function proximaCita(citas: CitaCliente[]) {
  return citas
    .filter(
      (cita) =>
        new Date(cita.inicio) >= new Date() &&
        !["cancelada", "no_asistio"].includes(cita.estado),
    )
    .sort((a, b) => +new Date(a.inicio) - +new Date(b.inicio))[0];
}

function mensajeError(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    return String(payload.error);
  }
  return "No se pudo guardar el cliente";
}

export function ClientesCliente({
  clientes,
  contactosDisponibles,
  citasActivo,
  modo = "clientes",
}: {
  clientes: Cliente[];
  contactosDisponibles: ContactoDisponible[];
  citasActivo: boolean;
  modo?: "clientes" | "pacientes";
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL);
  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return clientes;
    return clientes.filter(
      (cliente) =>
        cliente.nombre.toLowerCase().includes(termino) ||
        (cliente.telefono ?? "").includes(termino) ||
        (cliente.email ?? "").toLowerCase().includes(termino),
    );
  }, [busqueda, clientes]);
  const conAlertas = clientes.filter((cliente) => {
    const alergias = cliente.expediente.alergias?.toLowerCase();
    return alergias && !["ninguna", "ninguno", "no"].includes(alergias);
  }).length;

  function set(campo: keyof typeof formulario, valor: string) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    const respuesta = await fetch(`/api/${modo}`, {
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
    setModal(false);
    setFormulario(FORMULARIO_INICIAL);
    toast(modo === "pacientes" ? "Paciente creado" : "Cliente creado");
    router.refresh();
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {modo === "pacientes" ? "Pacientes" : "Clientes"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {modo === "pacientes"
              ? "Personas con expediente clínico, alergias e historial de atención."
              : "Personas con ficha de servicio, preferencias e historial de atención."}
          </p>
        </div>
        <Boton onClick={() => setModal(true)}>
          + Nuevo {modo === "pacientes" ? "paciente" : "cliente"}
        </Boton>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar por nombre, teléfono o correo…"
          className="min-w-60 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm"
        />
        <Resumen etiqueta={modo === "pacientes" ? "Pacientes" : "Clientes"} valor={clientes.length} />
        <Resumen etiqueta="Con alertas" valor={conAlertas} alerta={conAlertas > 0} />
      </div>

      {filtrados.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((cliente) => {
            const siguiente = proximaCita(cliente.citas);
            const edadCliente = edad(cliente.expediente.fechaNacimiento);
            return (
              <article
                key={cliente.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-soft"
              >
                <div className="flex items-start gap-3">
                  <AvatarNombre nombre={cliente.nombre} className="h-11 w-11" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/${modo}/${cliente.id}`}
                      className="font-semibold text-foreground hover:text-primary"
                    >
                      {cliente.nombre}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {cliente.telefono ? `+${cliente.telefono}` : "Sin teléfono"}
                      {edadCliente !== null ? ` · ${edadCliente} años` : ""}
                    </p>
                    {cliente.expediente.alergias && (
                      <p className="mt-2 line-clamp-2 text-xs text-amber-700">
                        {modo === "pacientes" ? "Alergias" : "Sensibilidades"}: {cliente.expediente.alergias}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs">
                  {siguiente ? (
                    <>
                      <p className="font-medium">Próxima cita</p>
                      <p className="text-muted-foreground">
                        {new Intl.DateTimeFormat("es-MX", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: ZONA_CITAS,
                        }).format(new Date(siguiente.inicio))}
                        {siguiente.doctor ? ` · ${siguiente.doctor.nombre}` : ""}
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Sin próxima cita</p>
                  )}
                </div>
                <div className="mt-3 flex justify-end gap-3 text-sm font-medium">
                  {citasActivo && (
                    <Link href={`/citas?contactoId=${cliente.id}`} className="text-primary">
                      Agendar
                    </Link>
                  )}
                  <Link href={`/${modo}/${cliente.id}`} className="text-primary">
                    {modo === "pacientes" ? "Ver expediente" : "Ver ficha"}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="font-semibold">
            {busqueda
              ? `No encontramos ${modo}`
              : `Aún no hay ${modo}`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {busqueda
              ? "Prueba con otro nombre, teléfono o correo."
              : "Crea uno nuevo o convierte un contacto existente."}
          </p>
        </div>
      )}

      <Modal
        abierto={modal}
        onClose={() => setModal(false)}
        titulo={`Nuevo ${modo === "pacientes" ? "paciente" : "cliente"}`}
      >
        <form onSubmit={guardar} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-muted-foreground">
              Convertir contacto existente
            </span>
            <select
              value={formulario.contactoId}
              onChange={(evento) => set("contactoId", evento.target.value)}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm"
            >
              <option value="">Crear como contacto nuevo</option>
              {contactosDisponibles.map((contacto) => (
                <option key={contacto.id} value={contacto.id}>
                  {contacto.nombre}
                  {contacto.telefono ? ` · +${contacto.telefono}` : ""}
                </option>
              ))}
            </select>
          </label>
          {!formulario.contactoId && (
            <>
              <Campo
                label="Nombre"
                value={formulario.nombre}
                onChange={(evento) => set("nombre", evento.target.value)}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Campo
                  label="Teléfono"
                  value={formulario.telefono}
                  onChange={(evento) => set("telefono", evento.target.value)}
                />
                <Campo
                  label="Correo"
                  type="email"
                  value={formulario.email}
                  onChange={(evento) => set("email", evento.target.value)}
                />
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Campo
              label="Fecha de nacimiento"
              type="date"
              value={formulario.fechaNacimiento}
              onChange={(evento) => set("fechaNacimiento", evento.target.value)}
            />
            <Campo
              label="Sexo"
              value={formulario.sexo}
              onChange={(evento) => set("sexo", evento.target.value)}
            />
          </div>
          <Area
            label="Alergias o sensibilidades"
            value={formulario.alergias}
            onChange={(valor) => set("alergias", valor)}
          />
          <Area
            label="Preferencias y antecedentes"
            value={formulario.antecedentes}
            onChange={(valor) => set("antecedentes", valor)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Boton type="button" variante="ghost" onClick={() => setModal(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" disabled={guardando}>
              {guardando
                ? "Guardando…"
                : `Crear ${modo === "pacientes" ? "paciente" : "cliente"}`}
            </Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Resumen({
  etiqueta,
  valor,
  alerta = false,
}: {
  etiqueta: string;
  valor: number;
  alerta?: boolean;
}) {
  return (
    <span
      className={[
        "rounded-full border px-3 py-1.5 text-xs font-medium",
        alerta
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-border bg-card text-muted-foreground",
      ].join(" ")}
    >
      {valor} {etiqueta.toLowerCase()}
    </span>
  );
}

function Area({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <textarea
        rows={2}
        value={value}
        onChange={(evento) => onChange(evento.target.value)}
        className="w-full rounded-lg border border-input px-3 py-2 text-sm"
      />
    </label>
  );
}
