"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo } from "@/components/ui";
import { api } from "@/components/config/tabs/shared";

const VALOR_OTRO = "__otro__";

function PuestoSelector({
  value,
  onChange,
  opciones,
}: {
  value: string;
  onChange: (puesto: string) => void;
  opciones: string[];
}) {
  const coincide = opciones.includes(value);
  return (
    <div className="space-y-2">
      <select
        aria-label="Puesto"
        value={coincide ? value : VALOR_OTRO}
        onChange={(evento) => {
          onChange(evento.target.value === VALOR_OTRO ? "" : evento.target.value);
        }}
        className="min-h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
      >
        {opciones.map((puesto) => (
          <option key={puesto} value={puesto}>{puesto}</option>
        ))}
        <option value={VALOR_OTRO}>Otro…</option>
      </select>
      {!coincide && (
        <>
          <Campo
            label="Especifica el puesto"
            value={value}
            maxLength={60}
            onChange={(evento) => onChange(evento.target.value)}
            required
          />
          <p className="text-xs text-warning">
            Este puesto no coincide con ninguno de los permisos configurados; la persona podría no
            ver algunos módulos.
          </p>
        </>
      )}
    </div>
  );
}

export function TabUsuarios({
  usuarios,
  puestosSugeridos,
}: {
  usuarios: any[];
  puestosSugeridos: string[];
}) {
  const router = useRouter();
  const puestoInicial = puestosSugeridos.includes("Agente") ? "Agente" : puestosSugeridos[0];
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    password: "",
    rol: "agente",
    puesto: puestoInicial ?? "Agente",
  });
  const [puestosEditados, setPuestosEditados] = useState<Record<string, string>>(
    Object.fromEntries(usuarios.map((usuario) => [String(usuario.id), usuario.puesto])),
  );

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    if (await api("/api/usuarios", "POST", form)) {
      setForm({
        nombre: "",
        email: "",
        password: "",
        rol: "agente",
        puesto: puestoInicial ?? "Agente",
      });
      router.refresh();
    }
  }

  async function actualizarUsuario(id: string, datos: Record<string, unknown>) {
    if (await api(`/api/usuarios/${id}`, "PATCH", datos)) router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        Invita al equipo creando su acceso. El <b>puesto</b> describe su función —recepcionista,
        doctor o vendedor— y el <b>rol</b> define permisos: Admin configura el CRM; Agente trabaja
        la operación diaria.
      </div>
      <form
        onSubmit={crear}
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
      >
        <Campo
          label="Nombre"
          value={form.nombre}
          onChange={(evento) => setForm({ ...form, nombre: evento.target.value })}
          required
        />
        <Campo
          label="Email"
          type="email"
          value={form.email}
          onChange={(evento) => setForm({ ...form, email: evento.target.value })}
          required
        />
        <Campo
          label="Contraseña"
          type="text"
          value={form.password}
          onChange={(evento) => setForm({ ...form, password: evento.target.value })}
          required
        />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">Rol</span>
          <select
            value={form.rol}
            onChange={(evento) => setForm({ ...form, rol: evento.target.value })}
            className="min-h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
          >
            <option value="agente">Agente</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm font-medium text-muted-foreground">Puesto</span>
          <PuestoSelector
            value={form.puesto}
            onChange={(puesto) => setForm({ ...form, puesto })}
            opciones={puestosSugeridos}
          />
        </label>
        <div className="sm:col-span-2">
          <Boton type="submit">+ Invitar integrante</Boton>
        </div>
      </form>

      <p className="text-xs text-muted-foreground">
        Los cambios de puesto pueden tardar hasta 5 minutos en aplicarse.
      </p>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-background text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Integrante</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Puesto y módulos visibles</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => {
              const id = String(usuario.id);
              return (
                <tr key={id} className="border-t border-border/60 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{usuario.nombre}</p>
                    <p className="text-xs text-muted-foreground">{usuario.email}</p>
                  </td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">{usuario.rol}</td>
                  <td className="min-w-72 space-y-2 px-4 py-3">
                    <PuestoSelector
                      value={puestosEditados[id] ?? usuario.puesto}
                      onChange={(puesto) => {
                        setPuestosEditados((actual) => ({ ...actual, [id]: puesto }));
                      }}
                      opciones={puestosSugeridos}
                    />
                    <div className="flex flex-wrap gap-1">
                      {(usuario.modulosAccesibles ?? []).map((modulo: string) => (
                        <span
                          key={modulo}
                          className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
                        >
                          {modulo}
                        </span>
                      ))}
                      {!usuario.modulosAccesibles?.length && (
                        <span className="text-xs text-warning">Sin módulos disponibles</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => actualizarUsuario(id, { puesto: puestosEditados[id] })}
                      className="min-h-10 text-primary hover:underline"
                    >
                      Guardar puesto
                    </button>
                  </td>
                  <td className="px-4 py-3">{usuario.activo ? "Activo" : "Inactivo"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => actualizarUsuario(id, { activo: !usuario.activo })}
                      className="min-h-10 text-primary hover:underline"
                    >
                      {usuario.activo ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
