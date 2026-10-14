"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, CLASE_CAMPO, Modal } from "@/components/ui";

type Valores = { nombre: string; proveedor: string; ip: string; propietario: string; loPagamos: boolean; activo: boolean; costoAnualMxn: string; vence: string; ramTotalMb: string; notas: string; cargasLibres: string };
const VACIO: Valores = { nombre: "", proveedor: "Hostinger", ip: "", propietario: "AR", loPagamos: true, activo: true, costoAnualMxn: "", vence: "", ramTotalMb: "", notas: "", cargasLibres: "" };
const CAMPOS = [
  ["nombre", "Nombre", "text"], ["proveedor", "Proveedor", "text"], ["ip", "IP", "text"],
  ["propietario", "Quién lo paga (AR / cliente / tercero)", "text"],
  ["costoAnualMxn", "Costo anual (MXN)", "number"], ["vence", "Vencimiento", "date"], ["ramTotalMb", "RAM total (MB)", "number"],
] as const;

export function FormularioServidor({ id, valores }: { id?: string; valores?: Valores }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState(valores ?? VACIO);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  function cerrar() { setAbierto(false); setToken(null); setError(""); }
  async function guardar(evento: React.FormEvent) {
    evento.preventDefault(); setOcupado(true); setError("");
    try {
      const res = await fetch(id ? `/api/servidores/${id}` : "/api/servidores", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) });
      const salida = await res.json();
      if (!res.ok) throw new Error(salida.error ?? "No se pudo guardar");
      router.refresh();
      if (salida.token) setToken(salida.token); else cerrar();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setOcupado(false); }
  }
  return <><Boton variante="ghost" className={`min-h-11 ${id ? "border font-semibold" : "border border-primary/30 !bg-primary/10 text-primary hover:!bg-primary/15"}`} onClick={() => { setDatos(valores ?? VACIO); setAbierto(true); }}>{id ? "Editar" : "+ Nuevo servidor"}</Boton>
    <Modal abierto={abierto} onClose={cerrar} titulo={token ? "Token de heartbeat" : id ? "Editar servidor" : "Nuevo servidor"}>
      {token ? <TokenHeartbeat token={token} cerrar={cerrar} /> : <form onSubmit={guardar} className="min-w-0 space-y-5">
        <p className="text-xs text-muted-foreground">Los campos con * son obligatorios. Puedes completar costo, vencimiento y RAM después.</p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">{CAMPOS.map(([clave, etiqueta, tipo]) => <label key={clave} className={`block min-w-0 text-sm ${clave === "nombre" || clave === "propietario" ? "sm:col-span-2" : ""}`}>{etiqueta}{["nombre", "proveedor", "ip", "propietario"].includes(clave) && " *"}<input className={`${CLASE_CAMPO} mt-1 min-h-11 min-w-0`} autoFocus={clave === "nombre"} type={tipo} step={clave === "costoAnualMxn" ? "0.01" : "1"} min={tipo === "number" ? 0 : undefined} required={["nombre", "proveedor", "ip", "propietario"].includes(clave)} value={datos[clave]} onChange={e => setDatos({ ...datos, [clave]: e.target.value })} /></label>)}</div>
        {[ ["cargasLibres", "Cargas adicionales (una por línea)"], ["notas", "Notas y datos por confirmar"] ].map(([clave, etiqueta]) => <label key={clave} className="block text-sm">{etiqueta}<textarea className={`${CLASE_CAMPO} mt-1 min-w-0`} rows={3} value={datos[clave as "notas" | "cargasLibres"]} onChange={e => setDatos({ ...datos, [clave]: e.target.value })} /></label>)}
        <p className="text-xs text-muted-foreground">Las cargas de clientes se vinculan al editar sus contratos en Servicios contratados.</p>
        {([["loPagamos", "Lo pagamos nosotros"], ["activo", "Servidor activo"]] as const).map(([clave, etiqueta]) => <label key={clave} className="flex min-h-11 items-center gap-3 text-sm"><input className="h-4 w-4 accent-primary" type="checkbox" checked={datos[clave]} onChange={e => setDatos({ ...datos, [clave]: e.target.checked })} />{etiqueta}</label>)}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><Boton className="min-h-11" type="button" variante="ghost" onClick={cerrar}>Cancelar</Boton><Boton className="min-h-11" disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar"}</Boton></div>
      </form>}
    </Modal></>;
}

function TokenHeartbeat({ token, cerrar }: { token: string; cerrar: () => void }) {
  return <div className="space-y-4"><p className="text-sm">Copia este token ahora. Se muestra una sola vez; al cerrar tendrás que regenerarlo.</p><code className="block select-all break-all rounded-lg bg-muted p-3 text-sm">{token}</code><Boton className="min-h-11" autoFocus onClick={cerrar}>Ya lo copié</Boton></div>;
}

export function RegenerarToken({ id, nombre }: { id: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  function cerrar() { setToken(null); setAbierto(false); setError(""); }
  async function regenerar() {
    setOcupado(true); setError("");
    try {
      const res = await fetch(`/api/servidores/${id}/token`, { method: "POST" });
      const datos = await res.json();
      if (!res.ok) throw new Error(datos.error);
      setToken(datos.token);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo regenerar"); }
    finally { setOcupado(false); }
  }
  return <><Boton variante="ghost" className="min-h-11 !bg-transparent !text-destructive hover:!bg-destructive/10" onClick={() => setAbierto(true)}>Regenerar token</Boton><Modal abierto={abierto} onClose={cerrar} titulo="Regenerar token de heartbeat">{token ? <TokenHeartbeat token={token} cerrar={cerrar} /> : <div className="space-y-4"><p className="break-words text-sm [overflow-wrap:anywhere]">Vas a regenerar el token de <strong>{nombre}</strong>.</p><p className="text-sm text-muted-foreground">El token anterior dejará de funcionar. Instala el nuevo token en este VPS al terminar.</p>{error && <p role="alert" className="text-destructive">{error}</p>}<div className="flex flex-wrap justify-end gap-2 border-t pt-4"><Boton className="min-h-11" autoFocus variante="ghost" onClick={cerrar}>Cancelar</Boton><Boton className="min-h-11" variante="danger" onClick={regenerar} disabled={ocupado}>{ocupado ? "Regenerando…" : "Regenerar token"}</Boton></div></div>}</Modal></>;
}
