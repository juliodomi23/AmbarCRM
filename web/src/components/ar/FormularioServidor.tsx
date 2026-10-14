"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Modal } from "@/components/ui";

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
  return <><Boton variante={id ? "ghost" : "primary"} onClick={() => { setDatos(valores ?? VACIO); setAbierto(true); }}>{id ? "Editar" : "Nuevo servidor"}</Boton>
    <Modal abierto={abierto} onClose={cerrar} titulo={token ? "Token de heartbeat" : id ? "Editar servidor" : "Nuevo servidor"}>
      {token ? <TokenHeartbeat token={token} cerrar={cerrar} /> : <form onSubmit={guardar} className="space-y-3">
        {CAMPOS.map(([clave, etiqueta, tipo]) => <label key={clave} className="block text-sm">{etiqueta}<input className="mt-1 w-full min-w-0 rounded-lg border bg-card px-3 py-2" type={tipo} step={clave === "costoAnualMxn" ? "0.01" : "1"} min={tipo === "number" ? 0 : undefined} required={["nombre", "proveedor", "ip", "propietario"].includes(clave)} value={datos[clave]} onChange={e => setDatos({ ...datos, [clave]: e.target.value })} /></label>)}
        {[ ["cargasLibres", "Cargas adicionales (una por línea)"], ["notas", "Notas y datos por confirmar"] ].map(([clave, etiqueta]) => <label key={clave} className="block text-sm">{etiqueta}<textarea className="mt-1 w-full rounded-lg border bg-card px-3 py-2" rows={3} value={datos[clave as "notas" | "cargasLibres"]} onChange={e => setDatos({ ...datos, [clave]: e.target.value })} /></label>)}
        <p className="text-xs text-muted-foreground">Las cargas de clientes se vinculan al editar sus contratos en Servicios contratados.</p>
        {([["loPagamos", "Lo pagamos nosotros"], ["activo", "Servidor activo"]] as const).map(([clave, etiqueta]) => <label key={clave} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={datos[clave]} onChange={e => setDatos({ ...datos, [clave]: e.target.checked })} />{etiqueta}</label>)}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><Boton type="button" variante="ghost" onClick={cerrar}>Cancelar</Boton><Boton disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar"}</Boton></div>
      </form>}
    </Modal></>;
}

function TokenHeartbeat({ token, cerrar }: { token: string; cerrar: () => void }) {
  return <div className="space-y-4"><p className="text-sm">Copia este token ahora. Se muestra una sola vez; al cerrar tendrás que regenerarlo.</p><code className="block select-all break-all rounded-lg bg-muted p-3 text-sm">{token}</code><Boton onClick={cerrar}>Ya lo copié</Boton></div>;
}

export function RegenerarToken({ id }: { id: string }) {
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
  return <><Boton variante="ghost" onClick={() => setAbierto(true)}>Regenerar token</Boton><Modal abierto={abierto} onClose={cerrar} titulo="Regenerar token de heartbeat">{token ? <TokenHeartbeat token={token} cerrar={cerrar} /> : <div className="space-y-4"><p className="text-sm">El token anterior dejará de funcionar. Instala el nuevo token en este VPS al terminar.</p>{error && <p role="alert" className="text-red-700">{error}</p>}<div className="flex flex-wrap gap-2"><Boton variante="ghost" onClick={cerrar}>Cancelar</Boton><Boton onClick={regenerar} disabled={ocupado}>Regenerar</Boton></div></div>}</Modal></>;
}
