"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Modal, CLASE_CAMPO } from "@/components/ui";
import { toast } from "@/components/Toaster";

export function NuevoCobro({ contratoId }: { contratoId?: string }) {
  const router = useRouter();
  const [abierto,setAbierto] = useState(false);
  const [enviando,setEnviando] = useState(false);
  const [q,setQ] = useState("");
  const [contratos,setContratos] = useState<{ id:string;tipo:string;contacto:{nombre:string} }[]>([]);
  const [datos,setDatos] = useState({ contratoId: contratoId ?? "", concepto:"extra", periodo:"", monto:"", vence:"", nota:"" });
  useEffect(() => {
    if (!abierto || contratoId) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try { const res = await fetch(`/api/contratos?limite=50&q=${encodeURIComponent(q)}`,{signal:controller.signal}); const data = await res.json(); setContratos(data.contratos ?? []); }
      catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) toast("No se pudieron buscar los contratos","error"); }
    },250);
    return () => { clearTimeout(timer); controller.abort(); };
  },[q,abierto,contratoId]);
  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setEnviando(true);
    try {
      const res = await fetch("/api/cobros",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...datos,periodo:datos.concepto === "mensualidad" && datos.periodo ? `${datos.periodo}-01` : null})});
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? "No se pudo crear el cobro","error"); return; }
      toast("Cobro creado"); setAbierto(false); setDatos({contratoId:contratoId ?? "",concepto:"extra",periodo:"",monto:"",vence:"",nota:""}); router.refresh();
    } catch { toast("No se pudo conectar","error"); }
    finally { setEnviando(false); }
  }
  return <><Boton onClick={() => setAbierto(true)}>Nuevo cobro</Boton><Modal abierto={abierto} onClose={() => !enviando && setAbierto(false)} titulo="Nuevo cobro"><form onSubmit={guardar} className="max-h-[70vh] space-y-4 overflow-y-auto">
    {!contratoId && <><label className="block space-y-1"><span className="text-sm">Buscar contrato por cliente o servicio</span><input className={CLASE_CAMPO} value={q} onChange={e => setQ(e.target.value)} /></label><label className="block space-y-1"><span className="text-sm">Contrato</span><select required className={CLASE_CAMPO} value={datos.contratoId} onChange={e => setDatos({...datos,contratoId:e.target.value})}><option value="">Selecciona un contrato</option>{contratos.map(c => <option key={c.id} value={c.id}>{c.contacto.nombre} · {c.tipo.replaceAll("_"," ")}</option>)}</select></label><p className="text-xs text-muted-foreground">Hasta 50 resultados. Usa la búsqueda para encontrar otros contratos.</p></>}
    <label className="block space-y-1"><span className="text-sm">Concepto</span><select value={datos.concepto} className={CLASE_CAMPO} onChange={e => setDatos({...datos,concepto:e.target.value})}>{["extra","mensualidad","anticipo","balance"].map(c => <option value={c} key={c}>{c}</option>)}</select></label>
    {datos.concepto === "mensualidad" && <label className="block space-y-1"><span className="text-sm">Periodo mensual</span><input required type="month" value={datos.periodo} className={CLASE_CAMPO} onChange={e => setDatos({...datos,periodo:e.target.value})} /></label>}
    <label className="block space-y-1"><span className="text-sm">Monto (MXN)</span><input required type="number" min="0.01" step="0.01" value={datos.monto} className={CLASE_CAMPO} onChange={e => setDatos({...datos,monto:e.target.value})} /></label>
    <label className="block space-y-1"><span className="text-sm">Vencimiento</span><input type="date" value={datos.vence} className={CLASE_CAMPO} onChange={e => setDatos({...datos,vence:e.target.value})} /></label>
    <label className="block space-y-1"><span className="text-sm">Nota</span><textarea value={datos.nota} className={CLASE_CAMPO} onChange={e => setDatos({...datos,nota:e.target.value})} /></label>
    <div className="flex justify-end gap-2"><Boton type="button" variante="ghost" disabled={enviando} onClick={() => setAbierto(false)}>Cancelar</Boton><Boton disabled={enviando}>{enviando ? "Creando…" : "Crear cobro"}</Boton></div>
  </form></Modal></>;
}
