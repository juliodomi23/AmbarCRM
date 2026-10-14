"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Modal, CLASE_CAMPO } from "@/components/ui";
import { toast } from "@/components/Toaster";

type ContratoCobro = { id: string; tipo: string; mensualidad: string | null; diaCobro: number | null; contacto: { nombre: string } };
const formatoMonto = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });
function mensualidadContrato(contrato: ContratoCobro | null) {
  return contrato?.mensualidad && Number(contrato.mensualidad) > 0 ? contrato.mensualidad : "";
}
function descripcionContrato(contrato: ContratoCobro) {
  const mensualidad = mensualidadContrato(contrato);
  return `${contrato.contacto.nombre} · ${contrato.tipo.replaceAll("_", " ")} · ${mensualidad ? `$${formatoMonto.format(Number(mensualidad))}/mes` : "sin mensualidad"} · ${contrato.diaCobro === null ? "día por confirmar" : `día ${contrato.diaCobro}`}`;
}

export function NuevoCobro({ contratoId }: { contratoId?: string }) {
  const router = useRouter();
  const [abierto,setAbierto] = useState(false);
  const [enviando,setEnviando] = useState(false);
  const [q,setQ] = useState("");
  const [contratos,setContratos] = useState<ContratoCobro[]>([]);
  const [contratoSeleccionado,setContratoSeleccionado] = useState<ContratoCobro | null>(null);
  const [montoManual,setMontoManual] = useState<string | null>(null);
  const [datos,setDatos] = useState({ contratoId: contratoId ?? "", concepto:"extra", periodo:"", vence:"", nota:"" });
  const idContrato = contratoId ?? datos.contratoId;
  const contratoActual = contratoSeleccionado?.id === idContrato ? contratoSeleccionado : null;
  const monto = montoManual ?? (datos.concepto === "mensualidad" ? mensualidadContrato(contratoActual) : "");
  const opciones = contratoActual && !contratos.some(c => c.id === contratoActual.id) ? [contratoActual,...contratos] : contratos;
  useEffect(() => {
    if (!abierto) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(contratoId ? `/api/contratos/${contratoId}` : `/api/contratos?limite=50&q=${encodeURIComponent(q)}`,{signal:controller.signal});
        if (!res.ok) throw new Error("No se pudieron cargar los contratos");
        const data = await res.json();
        if (contratoId) setContratoSeleccionado(data.contrato);
        else {
          const lista: ContratoCobro[] = data.contratos ?? [];
          setContratos(lista);
          setContratoSeleccionado(actual => lista.find(c => c.id === actual?.id) ?? actual);
        }
      }
      catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) toast("No se pudieron buscar los contratos","error"); }
    },contratoId ? 0 : 250);
    return () => { clearTimeout(timer); controller.abort(); };
  },[q,abierto,contratoId]);
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!contratoActual) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/cobros",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...datos,contratoId:idContrato,monto,periodo:datos.concepto === "mensualidad" && datos.periodo ? `${datos.periodo}-01` : null})});
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? "No se pudo crear el cobro","error"); return; }
      toast(`Cobro creado · ${contratoActual.contacto.nombre} · ${datos.concepto} · $${formatoMonto.format(Number(monto))} MXN`);
      setAbierto(false); setMontoManual(null); setContratoSeleccionado(null); setDatos({contratoId:contratoId ?? "",concepto:"extra",periodo:"",vence:"",nota:""}); router.refresh();
    } catch { toast("No se pudo conectar","error"); }
    finally { setEnviando(false); }
  }
  return <><Boton onClick={() => setAbierto(true)}>Nuevo cobro</Boton><Modal abierto={abierto} onClose={() => !enviando && setAbierto(false)} titulo="Nuevo cobro"><form onSubmit={guardar} className="flex max-h-[calc(90vh-6rem)] flex-col gap-4">
    <div className="min-h-0 space-y-4 overflow-y-auto">
    {!contratoId && <><label className="block space-y-1"><span className="text-sm">Buscar contrato por cliente o servicio</span><input className={CLASE_CAMPO} value={q} onChange={e => setQ(e.target.value)} /></label><label className="block space-y-1"><span className="text-sm">Contrato</span><select required className={`${CLASE_CAMPO} min-w-0 max-w-full`} value={datos.contratoId} onChange={e => { setDatos({...datos,contratoId:e.target.value}); setContratoSeleccionado(opciones.find(c => c.id === e.target.value) ?? null); }}><option value="">Selecciona un contrato</option>{opciones.map(c => <option key={c.id} value={c.id}>{descripcionContrato(c)}</option>)}</select></label><p className="text-xs text-muted-foreground">Hasta 50 resultados. Usa la búsqueda para encontrar otros contratos.</p></>}
    {contratoActual && <p className="break-words text-sm text-muted-foreground" aria-live="polite">{descripcionContrato(contratoActual)}</p>}
    <label className="block space-y-1"><span className="text-sm">Concepto</span><select value={datos.concepto} className={CLASE_CAMPO} onChange={e => setDatos({...datos,concepto:e.target.value})}>{["extra","mensualidad","anticipo","balance"].map(c => <option value={c} key={c}>{c}</option>)}</select></label>
    {datos.concepto === "mensualidad" && <label className="block space-y-1"><span className="text-sm">Periodo mensual</span><input required type="month" value={datos.periodo} className={CLASE_CAMPO} onChange={e => setDatos({...datos,periodo:e.target.value})} /></label>}
    <label className="block space-y-1"><span className="text-sm">Monto (MXN)</span><input required type="number" min="0.01" step="0.01" value={monto} className={CLASE_CAMPO} onChange={e => setMontoManual(e.target.value)} /></label>
    <label className="block space-y-1"><span className="text-sm">Vencimiento</span><input type="date" value={datos.vence} className={CLASE_CAMPO} onChange={e => setDatos({...datos,vence:e.target.value})} /></label>
    <label className="block space-y-1"><span className="text-sm">Nota</span><textarea value={datos.nota} className={CLASE_CAMPO} onChange={e => setDatos({...datos,nota:e.target.value})} /></label>
    </div>
    <div className="flex shrink-0 flex-wrap justify-end gap-2"><Boton type="button" variante="ghost" className="min-h-11" disabled={enviando} onClick={() => setAbierto(false)}>Cancelar</Boton><Boton className="min-h-11" disabled={enviando || !contratoActual}>{enviando ? "Creando…" : "Crear cobro"}</Boton></div>
  </form></Modal></>;
}
