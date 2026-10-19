"use client";

import { useState } from "react";
import { Boton } from "@/components/ui";
import { api } from "./shared";
import { toast } from "@/components/Toaster";

export type EspecialistaAgenda = { id: string; nombre: string; activo: boolean };
export type ConfigAccesoAgenda = { agendaSoloPropia: boolean; agendaDoctorId: string };

export function CamposAccesoAgenda({ value, onChange, especialistas }: {
  value: ConfigAccesoAgenda;
  onChange: (value: ConfigAccesoAgenda) => void;
  especialistas: EspecialistaAgenda[];
}) {
  return <div className="space-y-2">
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-muted-foreground">Acceso a citas</span>
      <select className="min-h-10 w-full rounded-lg border border-input bg-card px-3 py-2" value={value.agendaSoloPropia ? "propia" : "todas"} onChange={(e) => onChange({ ...value, agendaSoloPropia: e.target.value === "propia" })}>
        <option value="todas">Toda la agenda</option><option value="propia">Solo un especialista</option>
      </select>
    </label>
    {value.agendaSoloPropia && <label className="block space-y-1 text-sm">
      <span className="font-medium text-muted-foreground">Especialista asignado</span>
      <select required className="min-h-10 w-full rounded-lg border border-input bg-card px-3 py-2" value={value.agendaDoctorId} onChange={(e) => onChange({ ...value, agendaDoctorId: e.target.value })}>
        <option value="">Selecciona un especialista…</option>
        {especialistas.map((d) => <option key={d.id} value={d.id} disabled={!d.activo}>{d.nombre}{d.activo ? "" : " · inactivo"}</option>)}
      </select>
    </label>}
    <p className="text-xs text-muted-foreground">También necesita un puesto con acceso al módulo Citas. Este permiso limita las citas; los permisos de Contactos y Expedientes se configuran por separado.</p>
  </div>;
}

export function AccesoAgendaUsuario({ usuario, especialistas, onSaved }: {
  usuario: { id: string; rol: string; agendaSoloPropia?: boolean; agendaDoctorId?: string | null };
  especialistas: EspecialistaAgenda[];
  onSaved: () => void;
}) {
  const [value, setValue] = useState<ConfigAccesoAgenda>({ agendaSoloPropia: usuario.agendaSoloPropia ?? false, agendaDoctorId: usuario.agendaDoctorId ?? "" });
  const [guardando, setGuardando] = useState(false);
  if (usuario.rol === "admin") return <p className="text-xs text-muted-foreground">Administrador: acceso a toda la agenda.</p>;
  return <form className="space-y-2" onSubmit={async (e) => {
    e.preventDefault();
    setGuardando(true);
    try { if (await api(`/api/usuarios/${usuario.id}`, "PATCH", { ...value, agendaDoctorId: value.agendaDoctorId || null })) onSaved(); }
    catch { toast("No se pudo guardar el acceso. Revisa tu conexión.", "error"); }
    finally { setGuardando(false); }
  }}>
    <CamposAccesoAgenda value={value} onChange={setValue} especialistas={especialistas} />
    <Boton type="submit" variante="ghost" disabled={guardando}>{guardando ? "Guardando…" : "Guardar acceso a citas"}</Boton>
  </form>;
}
