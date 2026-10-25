"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Boton, CLASE_CAMPO, Modal, formatoMoneda, type TonoBadge } from "@/components/ui";
import { toast } from "@/components/Toaster";
import type { FacturaDetalleVista } from "@/components/facturacion/tipos";

const TONO_ESTADO: Record<string, TonoBadge> = {
  borrador: "warning",
  timbrando: "info",
  timbrada: "success",
  cancelada: "destructive",
  error: "destructive",
};

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: "Borrador",
  timbrando: "Timbrando",
  timbrada: "Timbrada",
  cancelada: "Cancelada",
  error: "Con error",
};

const MOTIVOS_CANCELACION = [
  { valor: "01 - Comprobante emitido con errores con relación", etiqueta: "01 · Errores con relación (sustitución)" },
  { valor: "02 - Comprobante emitido con errores sin relación", etiqueta: "02 · Errores sin relación" },
  { valor: "03 - No se llevó a cabo la operación", etiqueta: "03 · La operación no se realizó" },
  { valor: "04 - Operación nominativa relacionada en una factura global", etiqueta: "04 · Operación global" },
];

const ETIQUETA_EVENTO: Record<string, string> = {
  creada: "Factura creada",
  timbrada: "Factura timbrada",
  cancelada: "Factura cancelada",
  error: "Error de timbrado",
  error_cancelacion: "Error de cancelación",
};

function errorApi(payload: unknown, respaldo: string) {
  if (payload && typeof payload === "object" && "error" in payload) return String(payload.error);
  return respaldo;
}

function fecha(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function mensajeEvento(payload: unknown) {
  if (payload && typeof payload === "object" && "motivo" in payload) return `Motivo: ${String(payload.motivo)}`;
  if (payload && typeof payload === "object" && "mensaje" in payload) return String(payload.mensaje);
  if (payload && typeof payload === "object" && "uuid" in payload) return String(payload.uuid);
  return "";
}

export function FacturaDetalle({ factura, puedeOperar }: { factura: FacturaDetalleVista; puedeOperar: boolean }) {
  const router = useRouter();
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState(MOTIVOS_CANCELACION[0].valor);
  const [procesando, setProcesando] = useState(false);

  const folio = [factura.serie, factura.folio].filter(Boolean).join("-") || `#${factura.id}`;
  const puedeTimbrar = puedeOperar && (factura.estado === "borrador" || factura.estado === "error");
  const puedeCancelar = puedeOperar && factura.estado === "timbrada";
  const puedeDescargar = factura.estado === "timbrada" || factura.estado === "cancelada";

  async function timbrar() {
    if (procesando) return;
    setProcesando(true);
    try {
      const respuesta = await fetch(`/api/facturas/${factura.id}/timbrar`, { method: "POST" });
      const payload = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        toast(errorApi(payload, "No se pudo timbrar la factura"), "error");
        return;
      }
      toast("Factura timbrada");
      router.refresh();
    } catch {
      toast("No se pudo timbrar la factura. Revisa tu conexión.", "error");
    } finally {
      setProcesando(false);
    }
  }

  async function cancelar(evento: React.FormEvent) {
    evento.preventDefault();
    if (procesando) return;
    setProcesando(true);
    try {
      const respuesta = await fetch(`/api/facturas/${factura.id}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });
      const payload = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        toast(errorApi(payload, "No se pudo cancelar la factura"), "error");
        return;
      }
      toast("Factura cancelada");
      setCancelando(false);
      router.refresh();
    } catch {
      toast("No se pudo cancelar la factura. Revisa tu conexión.", "error");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Link href="/facturas" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-primary">
        ← Facturas
      </Link>

      <header className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{folio}</h1>
              <Badge tono={TONO_ESTADO[factura.estado] ?? "neutral"} punto>
                {ETIQUETA_ESTADO[factura.estado] ?? factura.estado}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {factura.contacto?.nombre ?? "Sin receptor"}
              {factura.venta ? ` · Venta ${factura.venta.folio}` : ""}
              {factura.pago ? ` · Pago ${factura.pago.referenciaExterna ?? factura.pago.id}` : ""}
            </p>
            <p className="mt-1 break-all text-xs text-muted-foreground">
              {factura.uuid ? `UUID ${factura.uuid}` : "Sin UUID"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {factura.estado === "timbrando" && (
              <Boton disabled>{procesando ? "Timbrando…" : "Timbrado en proceso"}</Boton>
            )}
            {puedeTimbrar && (
              <Boton onClick={() => void timbrar()} disabled={procesando}>
                {procesando ? "Timbrando…" : "Timbrar"}
              </Boton>
            )}
            {puedeCancelar && (
              <Boton variante="danger" onClick={() => setCancelando(true)}>
                Cancelar factura
              </Boton>
            )}
            {puedeDescargar && (
              <>
                <a href={`/api/facturas/${factura.id}/xml`} className="rounded-lg bg-muted px-3.5 py-2 text-sm font-medium">
                  XML
                </a>
                <a href={`/api/facturas/${factura.id}/pdf`} className="rounded-lg bg-muted px-3.5 py-2 text-sm font-medium">
                  PDF
                </a>
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-border bg-border/60 sm:grid-cols-4">
          <Dato etiqueta="Total" valor={formatoMoneda(Number(factura.total))} detalle={factura.moneda} />
          <Dato etiqueta="Subtotal" valor={formatoMoneda(Number(factura.subtotal))} detalle={`IVA ${formatoMoneda(Number(factura.impuestos))}`} />
          <Dato etiqueta="Creada" valor={fecha(factura.createdAt)} detalle={factura.proveedor} />
          <Dato etiqueta="Timbrada" valor={fecha(factura.timbradaAt)} detalle={factura.usoCfdi} />
        </div>
      </header>

      {factura.error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {factura.error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.6fr)]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-foreground">Conceptos</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2">Descripción</th>
                  <th className="pb-2 text-right">Cantidad</th>
                  <th className="pb-2 text-right">Unitario</th>
                  <th className="pb-2 text-right">IVA</th>
                  <th className="pb-2 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {factura.conceptos.map((concepto) => (
                  <tr key={concepto.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-foreground">{concepto.descripcion}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {concepto.claveProdServ ?? "Sin clave SAT"} · {concepto.claveUnidad ?? "Sin unidad"}
                      </p>
                    </td>
                    <td className="py-2 text-right tnum">{Number(concepto.cantidad)}</td>
                    <td className="py-2 text-right tnum">{formatoMoneda(Number(concepto.valorUnitario))}</td>
                    <td className="py-2 text-right tnum">{formatoMoneda(Number(concepto.iva))}</td>
                    <td className="py-2 text-right tnum">{formatoMoneda(Number(concepto.importe))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tnum">{formatoMoneda(Number(factura.subtotal))}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">IVA</dt>
              <dd className="tnum">{formatoMoneda(Number(factura.impuestos))}</dd>
            </div>
            {Number(factura.retenciones) > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Retenciones</dt>
                <dd className="tnum">{formatoMoneda(Number(factura.retenciones))}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd className="tnum">{formatoMoneda(Number(factura.total))}</dd>
            </div>
          </dl>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h2 className="text-sm font-semibold text-foreground">Receptor</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Fila etiqueta="Razón social" valor={factura.receptorRazonSocial ?? factura.contacto?.nombre ?? "—"} />
              <Fila etiqueta="RFC" valor={factura.receptorRfc ?? "—"} />
              <Fila etiqueta="Régimen" valor={factura.receptorRegimenFiscal ?? "—"} />
              <Fila etiqueta="Código postal" valor={factura.receptorCodigoPostal ?? "—"} />
              <Fila etiqueta="Correo" valor={factura.receptorCorreo ?? factura.contacto?.email ?? "—"} />
              <Fila etiqueta="Uso CFDI" valor={factura.receptorUsoCfdi ?? factura.usoCfdi} />
              <Fila etiqueta="Forma de pago" valor={factura.formaPago} />
              <Fila etiqueta="Método de pago" valor={factura.metodoPago} />
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h2 className="text-sm font-semibold text-foreground">Emisor</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Fila etiqueta="Razón social" valor={factura.emisorRazonSocial ?? "—"} />
              <Fila etiqueta="RFC" valor={factura.emisorRfc ?? "—"} />
              <Fila etiqueta="Régimen" valor={factura.emisorRegimenFiscal ?? "—"} />
              <Fila etiqueta="Código postal" valor={factura.emisorCodigoPostal ?? "—"} />
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h2 className="text-sm font-semibold text-foreground">Historial</h2>
            {factura.eventos.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">Sin eventos registrados.</p>
            ) : (
              <ol className="mt-3 space-y-3">
                {factura.eventos.map((evento) => (
                  <li key={evento.id} className="border-l-2 border-primary/40 pl-3">
                    <p className="text-xs font-semibold text-foreground">
                      {ETIQUETA_EVENTO[evento.tipo] ?? evento.tipo}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{fecha(evento.createdAt)}</p>
                    {mensajeEvento(evento.payload) && (
                      <p className="mt-0.5 break-words text-[11px] text-muted-foreground">{mensajeEvento(evento.payload)}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>

      <Modal abierto={cancelando} onClose={() => setCancelando(false)} titulo="Cancelar factura">
        <form onSubmit={cancelar} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            La cancelación se envía al PAC. No se puede deshacer.
          </p>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Motivo SAT</span>
            <select value={motivo} onChange={(evento) => setMotivo(evento.target.value)} className={CLASE_CAMPO}>
              {MOTIVOS_CANCELACION.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <Boton type="button" variante="ghost" onClick={() => setCancelando(false)}>Volver</Boton>
            <Boton type="submit" variante="danger" disabled={procesando}>
              {procesando ? "Cancelando…" : "Confirmar cancelación"}
            </Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Dato({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle: string }) {
  return (
    <div className="bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{etiqueta}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{valor}</p>
      <p className="text-[11px] text-muted-foreground">{detalle}</p>
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="text-right font-medium text-foreground">{valor}</dd>
    </div>
  );
}
