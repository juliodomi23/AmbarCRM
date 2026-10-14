"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Modal, CLASE_CAMPO } from "@/components/ui";
import { toast } from "@/components/Toaster";

export function RegistrarPago({ id, saldo, hoy, cliente }: { id: string; saldo: string; hoy: string; cliente: string }) {
  const router = useRouter();
  const [abierto,setAbierto] = useState(false);
  const [enviando,setEnviando] = useState(false);
  const [datos,setDatos] = useState({ monto: saldo, fechaPago: hoy, metodo: "transferencia", referencia: "", clavePago: "" });
  function abrir() { setDatos({ monto: saldo, fechaPago: hoy, metodo: "transferencia", referencia: "", clavePago: crypto.randomUUID() }); setAbierto(true); }
  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setEnviando(true);
    try {
      const res = await fetch(`/api/cobros/${id}`, { method: "PATCH", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ ...datos, estado:"pagado" }) });
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? "No se pudo registrar el pago","error"); return; }
      toast(data.repetido ? "Este pago ya estaba registrado" : `Pago registrado · saldo $${data.saldo ?? "0"} MXN`);
      setAbierto(false); router.refresh();
    } catch { toast("No se pudo conectar. Puedes reintentar el mismo pago sin duplicarlo.","error"); }
    finally { setEnviando(false); }
  }
  const restante = Math.max(0,Math.round(Number(saldo)*100)-Math.round(Number(datos.monto || 0)*100))/100;
  return <><Boton onClick={abrir}>Registrar pago</Boton><Modal abierto={abierto} onClose={() => !enviando && setAbierto(false)} titulo="Registrar pago">
    <p className="mb-4 text-sm">{cliente} · saldo <strong>${saldo} MXN</strong></p>
    <form onSubmit={guardar} className="max-h-[65vh] space-y-4 overflow-y-auto">
      <label className="block space-y-1"><span className="text-sm">Monto recibido (MXN)</span><input required type="number" min="0.01" max={saldo} step="0.01" className={CLASE_CAMPO} value={datos.monto} onChange={e => setDatos({...datos,monto:e.target.value})} /></label>
      <p className="rounded-lg bg-muted p-3 text-sm" role="status">Saldo después del pago: <strong>${restante.toFixed(2)} MXN</strong>{restante > 0 && <span className="mt-1 block">El cargo seguirá pendiente por el saldo restante.</span>}</p>
      <label className="block space-y-1"><span className="text-sm">Fecha de pago</span><input required type="date" max={hoy} value={datos.fechaPago} className={CLASE_CAMPO} onChange={e => setDatos({...datos,fechaPago:e.target.value})} /></label>
      <label className="block space-y-1"><span className="text-sm">Método</span><select value={datos.metodo} className={CLASE_CAMPO} onChange={e => setDatos({...datos,metodo:e.target.value})}>{["transferencia","tarjeta","efectivo","mercado_pago"].map(m => <option key={m} value={m}>{m.replaceAll("_"," ")}</option>)}</select></label>
      <label className="block space-y-1"><span className="text-sm">Referencia</span><input value={datos.referencia} className={CLASE_CAMPO} onChange={e => setDatos({...datos,referencia:e.target.value})} /></label>
      <div className="flex justify-end gap-2"><Boton type="button" variante="ghost" disabled={enviando} onClick={() => setAbierto(false)}>Cancelar</Boton><Boton disabled={enviando}>{enviando ? "Registrando…" : "Registrar pago"}</Boton></div>
    </form>
  </Modal></>;
}
