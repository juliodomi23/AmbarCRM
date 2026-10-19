"use client";

import { DatosPersonalesFicha } from "./DatosPersonalesFicha";
import { SelectorContactoFicha } from "./SelectorContactoFicha";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AvatarNombre } from "@/components/AvatarNombre";
import { ZONA_CITAS } from "@/components/citas/fecha";
import { Boton, Campo, Modal, EncabezadoPagina } from "@/components/ui";
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
        ["programada", "confirmada", "en_sala"].includes(cita.estado),
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
  zona = ZONA_CITAS,
}: {
  clientes: Cliente[];
  contactosDisponibles: ContactoDisponible[];
  citasActivo: boolean;
  zona?: string;
  modo?: "clientes" | "pacientes";
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState(false);
  const [usarContacto, setUsarContacto] = useState(false);
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
    if (guardando) return;
    setGuardando(true);
    try {
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
    setUsarContacto(false);
    router.refresh();
    } catch { toast("No se pudo guardar. Revisa tu conexión e intenta de nuevo.", "error"); }
    finally { setGuardando(false); }
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <EncabezadoPagina
        titulo={modo === "pacientes" ? "Pacientes" : "Clientes"}
        descripcion={modo === "pacientes"
              ? "Personas con expediente clínico, alergias e historial de atención."
              : "Preferencias, sensibilidades e historial para preparar cada visita."}
        acciones={
          <>
            <Boton onClick={() => setModal(true)}>
          + Nuevo {modo === "pacientes" ? "paciente" : "cliente"}
        </Boton>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          aria-label="Buscar clientes por nombre, teléfono o correo"
          placeholder="Buscar por nombre, teléfono o correo…"
          className="min-w-0 w-full sm:w-auto sm:min-w-60 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm"
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
                      className="break-words font-semibold text-foreground hover:text-primary"
                    >
                      {cliente.nombre}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {cliente.telefono ? `+${cliente.telefono}` : "Sin teléfono"}
                      {edadCliente !== null ? ` · ${edadCliente} años` : ""}
                    </p>
                    {cliente.expediente.alergias && (
                      <p className="mt-2 line-clamp-2 text-xs text-warning">
                        {modo === "pacientes" ? "Alergias" : "Sensibilidades"}: {cliente.expediente.alergias}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs">
                  {siguiente ? (
                    <>
                      <p className="font-medium">Próxima cita · {siguiente.titulo}</p>
                      <p className="text-muted-foreground">
                        {new Intl.DateTimeFormat("es-MX", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: zona,
                        }).format(new Date(siguiente.inicio))}
                        {siguiente.doctor ? ` · ${siguiente.doctor.nombre}` : ""}
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Sin próxima cita</p>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-sm font-medium">
                  {citasActivo && (
                    <Link href={`/citas?contactoId=${cliente.id}`} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-3 text-primary-foreground">
                      Agendar
                    </Link>
                  )}
                  <Link href={`/${modo}/${cliente.id}`} className="inline-flex min-h-11 items-center px-2 text-primary">
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
          <div className="grid grid-cols-2 gap-2" aria-label="Origen del cliente">
            <button type="button" disabled={guardando} aria-pressed={!usarContacto} className={`min-h-11 rounded-lg border px-3 text-sm ${!usarContacto ? "border-primary bg-primary/10 text-primary" : "border-input"}`} onClick={() => { setUsarContacto(false); set("contactoId", ""); }}>Persona nueva</button>
            <button type="button" disabled={guardando} aria-pressed={usarContacto} className={`min-h-11 rounded-lg border px-3 text-sm ${usarContacto ? "border-primary bg-primary/10 text-primary" : "border-input"}`} onClick={() => setUsarContacto(true)}>Ya es contacto</button>
          </div>
          {usarContacto && <SelectorContactoFicha modo={modo} contactos={contactosDisponibles} value={formulario.contactoId} onChange={(id) => set("contactoId", id)} />}
          {!usarContacto && (
            <>
              <Campo
                label="Nombre"
                value={formulario.nombre}
                onChange={(evento) => set("nombre", evento.target.value)}
                required
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo
                  label="WhatsApp o teléfono"
                  type="tel"
                  autoComplete="tel"
                  placeholder="Ej. 961 123 4567"
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
          <Area
            label={modo === "pacientes" ? "Alergias" : "Alergias o sensibilidades"}
            placeholder={modo === "pacientes" ? "" : "Ej. sensibilidad al adhesivo, al acrílico o a fragancias"}
            value={formulario.alergias}
            onChange={(valor) => set("alergias", valor)}
          />
          <Area
            label={modo === "pacientes" ? "Antecedentes clínicos" : "Preferencias de servicio"}
            placeholder={modo === "pacientes" ? "" : "Ej. forma de uña, tonos favoritos, estilo de pestañas"}
            value={formulario.antecedentes}
            onChange={(valor) => set("antecedentes", valor)}
          />
          <DatosPersonalesFicha clinica={modo === "pacientes"} fechaNacimiento={formulario.fechaNacimiento} sexo={formulario.sexo} onChange={set} />
          <div className="flex justify-end gap-2 pt-2">
            <Boton type="button" variante="ghost" onClick={() => setModal(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" disabled={guardando || (usarContacto && !formulario.contactoId)}>
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
          ? "border-warning/30 bg-warning/10 text-warning"
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
  placeholder,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <textarea
        rows={2}
        placeholder={placeholder}
        value={value}
        onChange={(evento) => onChange(evento.target.value)}
        className="w-full rounded-lg border border-input px-3 py-2 text-sm"
      />
    </label>
  );
}
