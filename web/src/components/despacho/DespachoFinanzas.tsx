"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Boton, Campo, Selector } from "@/components/ui";

type Opcion = { id: string; nombre: string; email?: string };
type Movimiento = {
  id: string;
  unidad: "despacho" | "refmex";
  tipo: "ingreso" | "costo" | "gasto";
  concepto: string;
  monto: string;
  fecha: string;
  fechaVencimiento: string | null;
  responsableId: string;
  clienteId: string | null;
  cliente: { contacto: { nombre: string; empresa: string | null } } | null;
  pagos: { id: string; monto: string; fecha: string; metodo: string | null }[];
};
type Pendiente = {
  id: string;
  concepto: string;
  unidad: string;
  fechaVencimiento: string | null;
  monto: string;
  pagado: string;
  saldo: string;
  clienteId: string | null;
  cliente: { nombre: string; empresa: string | null } | null;
  responsableId: string;
};
type Datos = { mes: string; movimientos: Movimiento[]; porCobrar: Pendiente[]; cobradoEnMes: string };

function mesActual() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(new Date());
}

function moneda(valor: number) {
  return valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function fechaCorta(valor: string | null) {
  if (!valor) return "Sin vencimiento";
  return new Date(`${valor.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const unidadNombre = (unidad: string) => unidad === "refmex" ? "REFMEX" : "Despacho";

export function DespachoFinanzas({ usuarios, clientes }: { usuarios: Opcion[]; clientes: Opcion[] }) {
  const [mes, setMes] = useState(mesActual);
  const [unidad, setUnidad] = useState("despacho");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [cargando, setCargando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [movimientoPago, setMovimientoPago] = useState<Pendiente | null>(null);
  const [form, setForm] = useState({ tipo: "ingreso", concepto: "", monto: "", fecha: new Date().toISOString().slice(0, 10), fechaVencimiento: "", clienteId: "", responsableId: "" });
  const [pago, setPago] = useState({ monto: "", fecha: new Date().toISOString().slice(0, 10), metodo: "transferencia", nota: "" });

  const cargar = useCallback(async () => {
    setCargando(true); setError("");
    try {
      const respuesta = await fetch(`/api/despacho/finanzas?mes=${encodeURIComponent(mes)}&unidad=${unidad}`, { cache: "no-store" });
      const resultado = await respuesta.json();
      if (!respuesta.ok) throw new Error(resultado.error ?? "No se pudieron cargar las finanzas");
      setDatos(resultado);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No se pudieron cargar las finanzas");
    } finally {
      setCargando(false);
    }
  }, [mes, unidad]);

  useEffect(() => { void cargar(); }, [cargar]);

  const resumen = useMemo(() => {
    const lista = datos?.movimientos ?? [];
    const total = (tipo: string) => lista.filter((item) => item.tipo === tipo).reduce((suma, item) => suma + Number(item.monto), 0);
    return { ingresos: total("ingreso"), costos: total("costo"), gastos: total("gasto"), cobrado: Number(datos?.cobradoEnMes ?? 0) };
  }, [datos]);

  async function guardarMovimiento(evento: React.FormEvent) {
    evento.preventDefault(); setError(""); setAviso("");
    const respuesta = await fetch("/api/despacho/finanzas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, unidad }),
    });
    const resultado = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { setError(resultado.error ?? "No se pudo guardar el movimiento"); return; }
    setCreando(false);
    setForm({ ...form, concepto: "", monto: "", fechaVencimiento: "", clienteId: "" });
    setAviso("Movimiento guardado");
    await cargar();
  }

  async function registrarPago(evento: React.FormEvent) {
    evento.preventDefault();
    if (!movimientoPago) return;
    setError(""); setAviso("");
    const respuesta = await fetch(`/api/despacho/finanzas/${movimientoPago.id}/pagos`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pago),
    });
    const resultado = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { setError(resultado.error ?? "No se pudo registrar el pago"); return; }
    setMovimientoPago(null);
    setPago({ monto: "", fecha: new Date().toISOString().slice(0, 10), metodo: "transferencia", nota: "" });
    setAviso("Pago registrado");
    await cargar();
  }

  return (
    <section className="space-y-5">
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {aviso && <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{aviso}</p>}
      <div className="surface flex flex-wrap items-end gap-3 p-4 sm:p-5">
        <Selector label="Unidad financiera" value={unidad} onChange={(e) => setUnidad(e.target.value)}><option value="despacho">Finanzas de Despacho</option><option value="refmex">Finanzas REFMEX</option></Selector>
        <Campo label="Mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        <Boton variante="ghost" onClick={() => void cargar()} disabled={cargando}>{cargando ? "Cargando…" : "Actualizar"}</Boton>
        <Boton onClick={() => setCreando((valor) => !valor)}>{creando ? "Cerrar" : "Nuevo movimiento"}</Boton>
      </div>

      {creando && <form onSubmit={guardarMovimiento} className="surface grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
        <Selector label="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}><option value="ingreso">Ingreso / cuenta por cobrar</option><option value="costo">Costo</option><option value="gasto">Gasto</option></Selector>
        <Campo label="Concepto" required maxLength={200} value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
        <Campo label="Monto (MXN)" type="number" required min="0.01" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
        <Campo label="Fecha" type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
        {form.tipo === "ingreso" && <>
          <Selector label="Cliente" required value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}><option value="">Selecciona…</option>{clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>)}</Selector>
          <Campo label="Fecha de vencimiento" type="date" required value={form.fechaVencimiento} onChange={(e) => setForm({ ...form, fechaVencimiento: e.target.value })} />
        </>}
        <Selector label="Responsable" required value={form.responsableId} onChange={(e) => setForm({ ...form, responsableId: e.target.value })}><option value="">Selecciona…</option>{usuarios.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.nombre}</option>)}</Selector>
        <div className="sm:col-span-2 lg:col-span-3"><Boton type="submit">Guardar movimiento</Boton></div>
      </form>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <article className="surface p-4"><p className="text-sm text-muted-foreground">Ingresos registrados</p><strong className="mt-2 block text-2xl text-foreground tnum">{moneda(resumen.ingresos)}</strong></article>
        <article className="surface p-4"><p className="text-sm text-muted-foreground">Cobrado este mes</p><strong className="mt-2 block text-2xl text-success tnum">{moneda(resumen.cobrado)}</strong></article>
        <article className="surface p-4"><p className="text-sm text-muted-foreground">Costos</p><strong className="mt-2 block text-2xl text-foreground tnum">{moneda(resumen.costos)}</strong></article>
        <article className="surface p-4"><p className="text-sm text-muted-foreground">Gastos</p><strong className="mt-2 block text-2xl text-foreground tnum">{moneda(resumen.gastos)}</strong></article>
        <article className="surface p-4"><p className="text-sm text-muted-foreground">Saldo operativo</p><strong className={`mt-2 block text-2xl tnum ${resumen.cobrado - resumen.costos - resumen.gastos < 0 ? "text-destructive" : "text-success"}`}>{moneda(resumen.cobrado - resumen.costos - resumen.gastos)}</strong></article>
      </div>

      <section className="surface space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-lg font-semibold text-foreground">Clientes por cobrar</h2><p className="text-sm text-muted-foreground">Saldos pendientes de esta unidad financiera, sin importar el mes de origen.</p></div><Badge tono={(datos?.porCobrar.length ?? 0) ? "warning" : "success"}>{datos?.porCobrar.length ?? 0} pendientes</Badge></div>
        {!datos?.porCobrar.length ? <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No hay cuentas pendientes de cobro en {unidadNombre(unidad)}.</p> : <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Cliente / concepto</th><th className="px-3 py-2">Vencimiento</th><th className="px-3 py-2">Importe</th><th className="px-3 py-2">Pagado</th><th className="px-3 py-2">Saldo</th><th className="px-3 py-2">Acción</th></tr></thead><tbody>{datos.porCobrar.map((item) => <tr key={item.id} className="border-t border-border/60"><td className="px-3 py-3"><span className="block font-medium text-foreground">{item.cliente?.empresa ?? item.cliente?.nombre ?? "Cliente"}</span><span className="block text-xs text-muted-foreground">{item.concepto}</span></td><td className="px-3 py-3 text-muted-foreground">{fechaCorta(item.fechaVencimiento)}</td><td className="px-3 py-3 tnum">{moneda(Number(item.monto))}</td><td className="px-3 py-3 tnum">{moneda(Number(item.pagado))}</td><td className="px-3 py-3 font-semibold text-destructive tnum">{moneda(Number(item.saldo))}</td><td className="px-3 py-3"><Boton variante="ghost" onClick={() => { setMovimientoPago(item); setPago({ monto: item.saldo, fecha: new Date().toISOString().slice(0, 10), metodo: "transferencia", nota: "" }); }}>Registrar pago</Boton></td></tr>)}</tbody></table></div>}
      </section>

      {movimientoPago && <form onSubmit={registrarPago} className="surface grid gap-3 border-primary/30 p-4 sm:grid-cols-2 sm:p-5"><div className="sm:col-span-2"><h2 className="font-semibold text-foreground">Registrar pago · {movimientoPago.cliente?.empresa ?? movimientoPago.cliente?.nombre}</h2><p className="text-sm text-muted-foreground">Saldo disponible: {moneda(Number(movimientoPago.saldo))}</p></div><Campo label="Importe recibido" type="number" min="0.01" max={movimientoPago.saldo} step="0.01" required value={pago.monto} onChange={(e) => setPago({ ...pago, monto: e.target.value })} /><Campo label="Fecha de pago" type="date" required value={pago.fecha} onChange={(e) => setPago({ ...pago, fecha: e.target.value })} /><Selector label="Método" value={pago.metodo} onChange={(e) => setPago({ ...pago, metodo: e.target.value })}><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="otro">Otro</option></Selector><Campo label="Nota (opcional)" value={pago.nota} maxLength={500} onChange={(e) => setPago({ ...pago, nota: e.target.value })} /><div className="flex gap-2 sm:col-span-2"><Boton type="submit">Guardar pago</Boton><Boton type="button" variante="ghost" onClick={() => setMovimientoPago(null)}>Cancelar</Boton></div></form>}

      <section className="surface space-y-3 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-foreground">Movimientos de {unidadNombre(unidad)} · {mes}</h2>
        {!datos?.movimientos.length ? <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Sin movimientos para este mes.</p> : <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Fecha / concepto</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Responsable</th><th className="px-3 py-2">Importe</th><th className="px-3 py-2">Cobrado</th></tr></thead><tbody>{datos.movimientos.map((item) => { const pagado = item.pagos.reduce((suma, abono) => suma + Number(abono.monto), 0); return <tr key={item.id} className="border-t border-border/60"><td className="px-3 py-3"><span className="block font-medium text-foreground">{item.concepto}</span><span className="text-xs text-muted-foreground">{fechaCorta(item.fecha)}</span></td><td className="px-3 py-3 capitalize text-muted-foreground">{item.tipo}</td><td className="px-3 py-3 text-muted-foreground">{item.cliente?.contacto.empresa ?? item.cliente?.contacto.nombre ?? "—"}</td><td className="px-3 py-3 text-muted-foreground">{usuarios.find((usuario) => usuario.id === item.responsableId)?.nombre ?? "—"}</td><td className="px-3 py-3 font-semibold tnum">{moneda(Number(item.monto))}</td><td className="px-3 py-3 tnum">{item.tipo === "ingreso" ? moneda(pagado) : "—"}</td></tr>; })}</tbody></table></div>}
      </section>
    </section>
  );
}
