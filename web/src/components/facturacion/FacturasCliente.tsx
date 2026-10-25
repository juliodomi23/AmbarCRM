"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Boton, CLASE_CAMPO, EncabezadoPagina, Modal, formatoMoneda, type TonoBadge } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { FORMAS_PAGO, METODOS_PAGO, REGIMENES_FISCALES, USOS_CFDI } from "@/lib/cfdi/validar";
import type { EmisorVista, FacturaResumen, VentaFacturable } from "@/components/facturacion/tipos";

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

function errorApi(payload: unknown, respaldo: string) {
  if (payload && typeof payload === "object" && "error" in payload) return String(payload.error);
  return respaldo;
}

function folio(factura: FacturaResumen) {
  return [factura.serie, factura.folio].filter(Boolean).join("-") || `#${factura.id}`;
}

function fecha(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function FacturasCliente({
  facturas,
  ventas,
  emisor,
  ventaIdInicial = "",
  puedeTimbrar,
  puedeConfigurarEmisor,
}: {
  facturas: FacturaResumen[];
  ventas: VentaFacturable[];
  emisor: EmisorVista | null;
  ventaIdInicial?: string;
  puedeTimbrar: boolean;
  puedeConfigurarEmisor: boolean;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("");
  const [modalEmisor, setModalEmisor] = useState(false);
  const [modalNueva, setModalNueva] = useState(false);

  const filtradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return facturas.filter((factura) => {
      if (estado && factura.estado !== estado) return false;
      if (!termino) return true;
      return [folio(factura), factura.uuid, factura.contacto?.nombre, factura.venta?.folio]
        .filter(Boolean)
        .some((valor) => String(valor).toLowerCase().includes(termino));
    });
  }, [busqueda, estado, facturas]);

  const timbradas = facturas.filter((factura) => factura.estado === "timbrada");
  const totalTimbrado = timbradas.reduce((total, factura) => total + Number(factura.total), 0);
  const borradores = facturas.filter((factura) => factura.estado === "borrador").length;
  const canceladas = facturas.filter((factura) => factura.estado === "cancelada").length;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <EncabezadoPagina
        titulo="Facturación CFDI"
        descripcion="Emite, descarga y cancela facturas de ventas y pagos."
        acciones={
          <>
            {puedeConfigurarEmisor && (
              <Boton variante="ghost" onClick={() => setModalEmisor(true)}>
                Configurar emisor
              </Boton>
            )}
            <Boton
              onClick={() => {
                if (!emisor) {
                  toast(
                    puedeConfigurarEmisor
                      ? "Configura el emisor antes de facturar"
                      : "Pide a un administrador que configure el emisor",
                    "error",
                  );
                  if (puedeConfigurarEmisor) setModalEmisor(true);
                  return;
                }
                setModalNueva(true);
              }}
            >
              + Nueva factura
            </Boton>
          </>
        }
      />

      {!emisor && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
          Aún no hay datos del emisor. Configura RFC, régimen fiscal y serie para poder timbrar.
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi etiqueta="Facturas timbradas" valor={String(timbradas.length)} />
        <Kpi etiqueta="Total facturado" valor={formatoMoneda(totalTimbrado)} />
        <Kpi etiqueta="Borradores" valor={String(borradores)} />
        <Kpi etiqueta="Canceladas" valor={String(canceladas)} />
      </section>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar folio, UUID o cliente…"
          className="min-w-64 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm"
        />
        <select
          value={estado}
          onChange={(evento) => setEstado(evento.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ETIQUETA_ESTADO).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>{etiqueta}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {filtradas.map((factura) => (
          <article key={factura.id} className="surface p-4 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/facturas/${factura.id}`} className="font-semibold hover:text-primary">
                    {folio(factura)}
                  </Link>
                  <Badge tono={TONO_ESTADO[factura.estado] ?? "neutral"} punto>
                    {ETIQUETA_ESTADO[factura.estado] ?? factura.estado}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {factura.contacto?.nombre ?? "Sin receptor"}
                  {factura.venta ? ` · Venta ${factura.venta.folio}` : ""}
                  {factura.pago ? ` · Pago ${factura.pago.referenciaExterna ?? factura.pago.id}` : ""}
                </p>
                <p className="mt-1 break-all text-[11px] text-muted-foreground">
                  {factura.uuid ? `UUID ${factura.uuid}` : "Sin UUID"}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-lg font-bold">{formatoMoneda(Number(factura.total))}</p>
                <p className="text-xs text-muted-foreground">{fecha(factura.createdAt)}</p>
              </div>
            </div>
            {factura.error && (
              <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{factura.error}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Link
                href={`/facturas/${factura.id}`}
                className="rounded-lg bg-muted px-3 py-2 text-xs font-medium"
              >
                Ver detalle
              </Link>
              {(factura.estado === "timbrada" || factura.estado === "cancelada") && (
                <>
                  <a href={`/api/facturas/${factura.id}/xml`} className="rounded-lg bg-muted px-3 py-2 text-xs font-medium">
                    XML
                  </a>
                  <a href={`/api/facturas/${factura.id}/pdf`} className="rounded-lg bg-muted px-3 py-2 text-xs font-medium">
                    PDF
                  </a>
                </>
              )}
            </div>
          </article>
        ))}
        {filtradas.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="font-semibold">No hay facturas con esos filtros</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea una factura a partir de una venta con datos fiscales completos.
            </p>
          </div>
        )}
      </div>

      <EmisorModal
        abierto={modalEmisor}
        emisor={emisor}
        onClose={() => setModalEmisor(false)}
        onGuardado={() => {
          setModalEmisor(false);
          router.refresh();
        }}
      />
      <NuevaFacturaModal
        abierto={modalNueva}
        ventas={ventas}
        ventaIdInicial={ventaIdInicial}
        puedeTimbrar={puedeTimbrar}
        onClose={() => setModalNueva(false)}
        onCreada={(id) => {
          setModalNueva(false);
          router.push(`/facturas/${id}`);
        }}
      />
    </div>
  );
}

function Kpi({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-soft">
      <span className="absolute inset-x-0 top-0 h-1 bg-brand-gradient" aria-hidden="true" />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{etiqueta}</p>
      <p className="mt-1 text-2xl font-bold tnum text-foreground">{valor}</p>
    </div>
  );
}

function EmisorModal({
  abierto,
  emisor,
  onClose,
  onGuardado,
}: {
  abierto: boolean;
  emisor: EmisorVista | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [formulario, setFormulario] = useState({
    rfc: emisor?.rfc ?? "",
    razonSocial: emisor?.razonSocial ?? "",
    regimenFiscal: emisor?.regimenFiscal ?? "601",
    codigoPostal: emisor?.codigoPostal ?? "",
    serie: emisor?.serie ?? "A",
    folioSiguiente: String(emisor?.folioSiguiente ?? 1),
    ambiente: emisor?.ambiente ?? "sandbox",
    proveedor: emisor?.proveedor ?? "mock",
  });
  const [guardando, setGuardando] = useState(false);

  function set(campo: keyof typeof formulario, valor: string) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (guardando) return;
    setGuardando(true);
    try {
      const respuesta = await fetch("/api/facturas/configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formulario, folioSiguiente: Number(formulario.folioSiguiente) }),
      });
      const payload = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        toast(errorApi(payload, "No se pudo guardar el emisor"), "error");
        return;
      }
      toast("Emisor guardado");
      onGuardado();
    } catch {
      toast("No se pudo guardar el emisor. Revisa tu conexión.", "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal abierto={abierto} onClose={onClose} titulo="Emisor de facturación">
      <form onSubmit={guardar} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">RFC</span>
          <input
            value={formulario.rfc}
            onChange={(evento) => set("rfc", evento.target.value.toUpperCase())}
            maxLength={13}
            required
            className={CLASE_CAMPO}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Razón social</span>
          <input
            value={formulario.razonSocial}
            onChange={(evento) => set("razonSocial", evento.target.value)}
            maxLength={254}
            required
            className={CLASE_CAMPO}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Régimen</span>
            <select
              value={formulario.regimenFiscal}
              onChange={(evento) => set("regimenFiscal", evento.target.value)}
              className={CLASE_CAMPO}
            >
              {REGIMENES_FISCALES.map((regimen) => (
                <option key={regimen} value={regimen}>{regimen}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Código postal</span>
            <input
              value={formulario.codigoPostal}
              onChange={(evento) => set("codigoPostal", evento.target.value.replace(/\D/gu, "").slice(0, 5))}
              inputMode="numeric"
              maxLength={5}
              required
              className={CLASE_CAMPO}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Serie</span>
            <input
              value={formulario.serie}
              onChange={(evento) => set("serie", evento.target.value.toUpperCase().slice(0, 10))}
              maxLength={10}
              required
              className={CLASE_CAMPO}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Folio siguiente</span>
            <input
              value={formulario.folioSiguiente}
              onChange={(evento) => set("folioSiguiente", evento.target.value.replace(/\D/gu, ""))}
              inputMode="numeric"
              required
              className={CLASE_CAMPO}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Ambiente</span>
            <select
              value={formulario.ambiente}
              onChange={(evento) => set("ambiente", evento.target.value)}
              className={CLASE_CAMPO}
            >
              <option value="sandbox">Pruebas</option>
              <option value="produccion">Producción</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Proveedor</span>
            <select
              value={formulario.proveedor}
              onChange={(evento) => set("proveedor", evento.target.value)}
              className={CLASE_CAMPO}
            >
              <option value="mock">Mock (Fase 2A.1)</option>
              <option value="facturama" disabled>Facturama (Fase 2B)</option>
              <option value="sw_sapien" disabled>SW Sapien (Fase 2B)</option>
            </select>
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground">
          No guardes CSD, llaves privadas ni contraseñas del PAC. Esos datos van en variables de entorno seguras.
        </p>
        <div className="flex justify-end gap-2">
          <Boton type="button" variante="ghost" onClick={onClose}>Cancelar</Boton>
          <Boton type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar emisor"}</Boton>
        </div>
      </form>
    </Modal>
  );
}

function NuevaFacturaModal({
  abierto,
  ventas,
  ventaIdInicial,
  puedeTimbrar,
  onClose,
  onCreada,
}: {
  abierto: boolean;
  ventas: VentaFacturable[];
  ventaIdInicial: string;
  puedeTimbrar: boolean;
  onClose: () => void;
  onCreada: (id: string) => void;
}) {
  const [ventaId, setVentaId] = useState(ventaIdInicial);
  const [usoCfdi, setUsoCfdi] = useState("G03");
  const [formaPago, setFormaPago] = useState("01");
  const [metodoPago, setMetodoPago] = useState("PUE");
  const [timbrar, setTimbrar] = useState(puedeTimbrar);
  const [creando, setCreando] = useState(false);

  const venta = ventas.find((item) => item.id === ventaId);
  const fiscal = venta?.contacto?.datosFiscales ?? null;

  function seleccionarVenta(id: string) {
    setVentaId(id);
    const elegida = ventas.find((item) => item.id === id);
    setUsoCfdi(elegida?.contacto?.datosFiscales?.usoCfdi ?? "G03");
  }

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    if (creando) return;
    if (!venta) {
      toast("Selecciona una venta", "error");
      return;
    }
    setCreando(true);
    try {
      const respuesta = await fetch("/api/facturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ventaId, usoCfdi, formaPago, metodoPago, timbrar }),
      });
      const payload = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        toast(errorApi(payload, "No se pudo crear la factura"), "error");
        return;
      }
      toast(payload?.duplicado ? "La factura ya existía" : timbrar ? "Factura timbrada" : "Borrador creado");
      onCreada(String(payload.factura.id));
    } catch {
      toast("No se pudo crear la factura. Revisa tu conexión.", "error");
    } finally {
      setCreando(false);
    }
  }

  return (
    <Modal abierto={abierto} onClose={onClose} titulo="Nueva factura">
      <form onSubmit={crear} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Venta a facturar</span>
          <select value={ventaId} onChange={(evento) => seleccionarVenta(evento.target.value)} required className={CLASE_CAMPO}>
            <option value="">Selecciona una venta</option>
            {ventas.map((item) => (
              <option key={item.id} value={item.id}>
                {item.folio} · {item.contacto?.nombre ?? "Sin cliente"} · {formatoMoneda(Number(item.total))}
              </option>
            ))}
          </select>
        </label>
        {venta && (
          <div className={`rounded-lg border p-3 text-xs ${fiscal ? "border-border bg-muted/40" : "border-warning/40 bg-warning/10"}`}>
            {fiscal ? (
              <>
                <p className="font-semibold text-foreground">{fiscal.razonSocial}</p>
                <p className="mt-0.5 text-muted-foreground">{fiscal.rfc} · CP {fiscal.codigoPostal}</p>
                <p className="mt-1 text-muted-foreground">Total con IVA incluido: {formatoMoneda(Number(venta.total))}</p>
              </>
            ) : (
              <p className="text-foreground">
                Esta venta no tiene datos fiscales. Captúralos en la ficha del cliente antes de facturar.
              </p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Uso de CFDI</span>
            <select value={usoCfdi} onChange={(evento) => setUsoCfdi(evento.target.value)} className={CLASE_CAMPO}>
              {USOS_CFDI.map((uso) => (
                <option key={uso} value={uso}>{uso}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Forma de pago</span>
            <select value={formaPago} onChange={(evento) => setFormaPago(evento.target.value)} className={CLASE_CAMPO}>
              {FORMAS_PAGO.map((forma) => (
                <option key={forma} value={forma}>{forma}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Método de pago</span>
          <select value={metodoPago} onChange={(evento) => setMetodoPago(evento.target.value)} className={CLASE_CAMPO}>
            {METODOS_PAGO.map((metodo) => (
              <option key={metodo} value={metodo}>{metodo}</option>
            ))}
          </select>
        </label>
        {puedeTimbrar && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={timbrar} onChange={(evento) => setTimbrar(evento.target.checked)} />
            Timbrar ahora
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Boton type="button" variante="ghost" onClick={onClose}>Cancelar</Boton>
          <Boton type="submit" disabled={creando || !venta || !fiscal}>
            {creando ? "Procesando…" : timbrar ? "Crear y timbrar" : "Guardar borrador"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
