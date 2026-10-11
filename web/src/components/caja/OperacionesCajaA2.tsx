"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/Toaster";
import { OPCIONES_METODO_PAGO, pedirDatos } from "@/components/PedirDatos";
import { Boton, formatoMoneda } from "@/components/ui";

type PartidaVenta = {
  id: string;
  cantidad: string;
  producto: { nombre: string; unidad: string };
  devoluciones: { cantidad: string }[];
};
type Venta = { id: string; folio: string; total: string; contacto: { nombre: string } | null; partidas: PartidaVenta[] };
type Apartado = { id: string; estado: string; saldo: string; venceAt: string; contacto: { nombre: string }; venta: { folio: string } };
type Cuenta = { limiteCredito: string; saldo: string; antiguedadDias: number; movimientos: { id: string; tipo: string; monto: string; createdAt: string }[] };

async function apiA2(url: string, method = "GET", body?: unknown) {
  const respuesta = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(data.error ?? "No se pudo completar la operación");
  return data;
}

export function OperacionesCajaA2({
  turnoId,
  contactoId,
  puedeConfigurarCredito,
}: {
  turnoId: string;
  contactoId: string;
  puedeConfigurarCredito: boolean;
}) {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [apartados, setApartados] = useState<Apartado[]>([]);
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);

  async function cargar() {
    const [datosVentas, datosApartados] = await Promise.all([
      apiA2("/api/caja/devoluciones"),
      apiA2("/api/caja/apartados"),
    ]);
    setVentas(datosVentas.ventas ?? []);
    setApartados(datosApartados.apartados ?? []);
  }

  useEffect(() => { void cargar().catch(() => undefined); }, []);
  useEffect(() => {
    if (!contactoId) { setCuenta(null); return; }
    apiA2(`/api/caja/credito/${contactoId}`)
      .then((data) => setCuenta(data.cuenta))
      .catch(() => setCuenta(null));
  }, [contactoId]);

  async function devolver(venta: Venta) {
    const disponibles = venta.partidas.flatMap((partida) => {
      const devuelto = partida.devoluciones.reduce((suma, item) => suma + Number(item.cantidad), 0);
      const disponible = Number(partida.cantidad) - devuelto;
      return disponible > 0 ? [{ partida, disponible }] : [];
    });
    if (!disponibles.length) return toast("Esta venta ya no tiene partidas por devolver", "error");
    const datos = await pedirDatos({
      titulo: `Devolución de ${venta.folio}`,
      mensaje: "Deja en blanco o en 0 lo que no se devuelve.",
      confirmar: "Registrar devolución",
      campos: [
        ...disponibles.map(({ partida, disponible }) => ({
          nombre: `cantidad-${partida.id}`,
          etiqueta: `${partida.producto.nombre} (máximo ${disponible} ${partida.producto.unidad})`,
          tipo: "numero" as const,
          valor: String(disponible),
          max: disponible,
        })),
        {
          nombre: "tipo",
          etiqueta: "Reembolso",
          tipo: "seleccion" as const,
          opciones: [{ valor: "efectivo", etiqueta: "Efectivo" }, { valor: "nota_credito", etiqueta: "Nota de crédito" }],
        },
        { nombre: "ventaCambioId", etiqueta: "Id de la nueva venta si es un cambio", valor: "" },
      ],
    });
    if (!datos) return;
    const partidas = disponibles.flatMap(({ partida }) => {
      const cantidad = datos[`cantidad-${partida.id}`];
      return cantidad && Number(cantidad) > 0 ? [{ ventaPartidaId: partida.id, cantidad }] : [];
    });
    if (!partidas.length) return toast("Indica la cantidad a devolver de al menos una partida", "error");
    const tipo = datos.tipo;
    const ventaCambioId = datos.ventaCambioId;
    try {
      await apiA2("/api/caja/devoluciones", "POST", { ventaId: venta.id, ventaCambioId: ventaCambioId || null, tipoReembolso: tipo, partidas });
      toast(`Devolución de ${venta.folio} registrada`); await cargar();
    } catch (error) { toast((error as Error).message, "error"); }
  }

  async function abonar(apartado: Apartado) {
    const datos = await pedirDatos({
      titulo: `Abono para ${apartado.venta.folio}`,
      mensaje: `Saldo pendiente: ${formatoMoneda(Number(apartado.saldo))}`,
      confirmar: "Registrar abono",
      campos: [
        { nombre: "monto", etiqueta: "Monto del abono", tipo: "dinero", valor: apartado.saldo, requerido: true, positivo: true },
        { nombre: "metodo", etiqueta: "Método de pago", tipo: "seleccion", opciones: OPCIONES_METODO_PAGO },
      ],
    });
    if (!datos) return;
    const { monto, metodo } = datos;
    try {
      await apiA2(`/api/caja/apartados/${apartado.id}`, "PATCH", { accion: "abonar", turnoId, monto, metodo });
      toast("Abono de apartado registrado"); await cargar();
    } catch (error) { toast((error as Error).message, "error"); }
  }

  async function cancelar(apartado: Apartado) {
    const datos = await pedirDatos({
      titulo: `Cancelar apartado ${apartado.venta.folio}`,
      mensaje: "La existencia separada se libera al cancelar.",
      confirmar: "Cancelar apartado",
      cancelar: "Volver",
      campos: [{
        nombre: "forma",
        etiqueta: "Devolver el anticipo",
        tipo: "seleccion",
        opciones: [
          { valor: "sin_reembolso", etiqueta: "Sin reembolso" },
          { valor: "efectivo", etiqueta: "En efectivo" },
          { valor: "nota_credito", etiqueta: "Como nota de crédito" },
        ],
      }],
    });
    if (!datos) return;
    const forma = datos.forma;
    try {
      await apiA2(`/api/caja/apartados/${apartado.id}`, "PATCH", { accion: "cancelar", forma });
      toast("Apartado cancelado y existencia liberada"); await cargar();
    } catch (error) { toast((error as Error).message, "error"); }
  }

  async function configurarLimite() {
    if (!contactoId) return;
    const datos = await pedirDatos({
      titulo: "Límite de crédito",
      campos: [{ nombre: "limiteCredito", etiqueta: "Límite de crédito", tipo: "dinero", valor: cuenta?.limiteCredito ?? "0", requerido: true }],
    });
    if (!datos) return;
    const limiteCredito = datos.limiteCredito;
    try {
      const data = await apiA2(`/api/caja/credito/${contactoId}`, "PATCH", { limiteCredito });
      setCuenta({ ...data.cuenta, antiguedadDias: 0, movimientos: data.cuenta.movimientos ?? [] });
      toast("Límite de crédito actualizado");
    } catch (error) { toast((error as Error).message, "error"); }
  }

  async function abonarCredito() {
    if (!contactoId) return;
    const datos = await pedirDatos({
      titulo: "Abono a crédito",
      confirmar: "Registrar abono",
      campos: [
        { nombre: "monto", etiqueta: "Monto del abono", tipo: "dinero", valor: cuenta?.saldo ?? "", requerido: true, positivo: true },
        { nombre: "metodo", etiqueta: "Método de pago", tipo: "seleccion", opciones: OPCIONES_METODO_PAGO },
      ],
    });
    if (!datos) return;
    const { monto, metodo } = datos;
    try {
      await apiA2("/api/caja/credito/abonos", "POST", { turnoId, contactoId, monto, metodo });
      const data = await apiA2(`/api/caja/credito/${contactoId}`); setCuenta(data.cuenta); toast("Abono a crédito registrado");
    } catch (error) { toast((error as Error).message, "error"); }
  }

  async function recordarSaldo() {
    if (!contactoId) return;
    try { await apiA2(`/api/caja/credito/${contactoId}/recordatorio`, "POST"); toast("Recordatorio enviado"); }
    catch (error) { toast((error as Error).message, "error"); }
  }

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <div className="surface p-4">
        <h2 className="font-bold">Devoluciones y cambios</h2>
        <p className="mb-3 text-xs text-muted-foreground">Parcial o total, siempre ligada a la venta original.</p>
        <div className="max-h-72 space-y-2 overflow-y-auto">{ventas.map((venta) => (
          <div key={venta.id} className="rounded border p-2 text-sm"><div className="flex items-center justify-between gap-2"><span><b>{venta.folio}</b><br />{venta.contacto?.nombre ?? "Público general"} · {formatoMoneda(Number(venta.total))}</span><Boton variante="ghost" onClick={() => devolver(venta)}>Devolver</Boton></div></div>
        ))}</div>
      </div>
      <div className="surface p-4">
        <div className="flex items-center justify-between"><h2 className="font-bold">Apartados</h2><button className="text-xs text-primary" onClick={() => apiA2("/api/caja/apartados/vencer", "POST").then(cargar)}>Liberar vencidos</button></div>
        <p className="mb-3 text-xs text-muted-foreground">Los productos permanecen separados hasta liquidar, cancelar o vencer.</p>
        <div className="max-h-72 space-y-2 overflow-y-auto">{apartados.filter((item) => item.estado === "activo").map((apartado) => (
          <div key={apartado.id} className="rounded border p-2 text-sm"><b>{apartado.venta.folio}</b><p>{apartado.contacto.nombre} · saldo {formatoMoneda(Number(apartado.saldo))}</p><p className="text-xs text-muted-foreground">Vence {new Date(apartado.venceAt).toLocaleDateString("es-MX")}</p><div className="mt-2 flex gap-2"><Boton variante="ghost" onClick={() => abonar(apartado)}>Abonar</Boton><Boton variante="danger" onClick={() => cancelar(apartado)}>Cancelar</Boton></div></div>
        ))}</div>
      </div>
      <div className="surface p-4">
        <h2 className="font-bold">Crédito del cliente</h2>
        {!contactoId && <p className="mt-2 text-sm text-muted-foreground">Selecciona un cliente en la venta actual.</p>}
        {contactoId && !cuenta && <p className="mt-2 text-sm">Este cliente aún no tiene límite configurado.</p>}
        {cuenta && <div className="mt-3 space-y-2 text-sm"><p className="flex justify-between"><span>Saldo</span><b>{formatoMoneda(Number(cuenta.saldo))}</b></p><p className="flex justify-between"><span>Límite</span><span>{formatoMoneda(Number(cuenta.limiteCredito))}</span></p><p className="flex justify-between"><span>Antigüedad</span><span>{cuenta.antiguedadDias} días</span></p><div className="flex flex-wrap gap-2"><Boton variante="ghost" onClick={abonarCredito}>Registrar abono</Boton><Boton variante="ghost" onClick={recordarSaldo}>Recordar por WhatsApp</Boton></div></div>}
        {contactoId && puedeConfigurarCredito && <button className="mt-3 text-xs text-primary" onClick={configurarLimite}>{cuenta ? "Cambiar límite" : "Configurar límite"}</button>}
      </div>
    </section>
  );
}
