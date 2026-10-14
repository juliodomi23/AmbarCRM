"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Modal, CLASE_CAMPO } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { confirmar } from "@/components/Confirmador";

export function AccionesContrato({ id,estado,hoy,esAdmin }: {id:string;estado:string|null;hoy:string;esAdmin:boolean}) {
  const router = useRouter();
  const [baja,setBaja] = useState(false);
  const [fecha,setFecha] = useState(hoy);
  const [enviando,setEnviando] = useState(false);
  async function cambiar(datos:object) {
    setEnviando(true);
    try { const res = await fetch(`/api/contratos/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(datos)}); const data = await res.json(); if(!res.ok){toast(data.error,"error");return;} toast("Contrato actualizado"); setBaja(false); router.refresh(); }
    catch { toast("No se pudo conectar","error"); }
    finally { setEnviando(false); }
  }
  async function darBaja(e:React.FormEvent) {
    e.preventDefault();
    if(await confirmar({titulo:"Dar de baja el contrato",mensaje:`Fecha: ${fecha}. Se cancelarán los cargos pendientes con vencimiento posterior a esa fecha. Los pagos recibidos y las deudas anteriores se conservan.`,confirmar:"Dar de baja",peligro:true})) await cambiar({estado:"baja",fechaBaja:fecha,confirmarBaja:true});
  }
  if(["baja","incobrable"].includes(estado ?? "")) return null;
  return <div className="flex flex-wrap gap-2">{estado !== "produccion" && <Boton disabled={enviando} variante="ghost" onClick={() => cambiar({estado:"produccion"})}>Pasar a producción</Boton>}{estado !== "pausado" && <Boton disabled={enviando} variante="ghost" onClick={() => cambiar({estado:"pausado"})}>Pausar</Boton>}{esAdmin && <Boton disabled={enviando} variante="ghost" onClick={() => setBaja(true)}>Dar de baja</Boton>}
    <Modal abierto={baja} onClose={() => !enviando && setBaja(false)} titulo="Fecha de baja"><form onSubmit={darBaja} className="space-y-4"><label className="block space-y-1"><span className="text-sm">Fecha de baja</span><input required type="date" value={fecha} className={CLASE_CAMPO} onChange={e => setFecha(e.target.value)} /></label><p className="text-sm text-muted-foreground">Antes de guardar confirmarás la cancelación de los cargos futuros.</p><div className="flex justify-end gap-2"><Boton type="button" variante="ghost" disabled={enviando} onClick={() => setBaja(false)}>Cancelar</Boton><Boton variante="danger" disabled={enviando}>Continuar</Boton></div></form></Modal>
  </div>;
}
