"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo } from "@/components/ui";
import { api, PUESTOS } from "@/components/config/tabs/shared";

export function TabUsuarios({ usuarios }: { usuarios: any[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    password: "",
    rol: "agente",
    puesto: "Agente",
  });

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (await api("/api/usuarios", "POST", form)) {
      setForm({
        nombre: "",
        email: "",
        password: "",
        rol: "agente",
        puesto: "Agente",
      });
      router.refresh();
    }
  }
  async function toggleActivo(u: any) {
    if (await api(`/api/usuarios/${u.id}`, "PATCH", { activo: !u.activo }))
      router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        Invita al equipo creando su acceso. El <b>puesto</b> describe su función
        —recepcionista, doctor o vendedor— y el <b>rol</b> define permisos:
        Admin configura el CRM; Agente trabaja la operación diaria.
      </div>
      <form
        onSubmit={crear}
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
      >
        <Campo
          label="Nombre"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          required
        />
        <Campo
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <Campo
          label="Contraseña"
          type="text"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">Rol</span>
          <select
            value={form.rol}
            onChange={(e) => setForm({ ...form, rol: e.target.value })}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm"
          >
            <option value="agente">Agente</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">Puesto</span>
          <select
            value={form.puesto}
            onChange={(e) => setForm({ ...form, puesto: e.target.value })}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm"
          >
            {PUESTOS.map((puesto) => (
              <option key={puesto}>{puesto}</option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2">
          <Boton type="submit">+ Invitar integrante</Boton>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-background text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Puesto</th>
              <th className="px-4 py-3">Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-t border-border/60">
                <td className="px-4 py-3 font-medium text-foreground">
                  {u.nombre}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3 capitalize text-muted-foreground">
                  {u.rol}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.puesto}</td>
                <td className="px-4 py-3">
                  {u.activo ? "Activo" : "Inactivo"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => toggleActivo(u)}
                    className="text-primary hover:underline"
                  >
                    {u.activo ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
