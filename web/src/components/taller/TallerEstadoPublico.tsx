import { monedaTallerTexto } from "@/lib/taller-mensajes";

const PASOS = [
  { clave: "recibido", texto: "Recibido" },
  { clave: "diagnostico", texto: "Diagnóstico" },
  { clave: "esperando_aprobacion", texto: "Aprobación" },
  { clave: "en_reparacion", texto: "Reparación" },
  { clave: "listo", texto: "Listo" },
  { clave: "entregado", texto: "Entregado" },
];

type Orden = {
  numero: string;
  estado: string;
  estadoTexto: string;
  vehiculo: { marca: string; modelo: string; anio: number | null; placa: string; color: string | null };
  fechaPromesa: string | null;
  saldo: number;
  entregadoEn: string | null;
  enlaceAprobacion: string | null;
};

function fecha(valor: string | null, conHora = false) {
  if (!valor) return null;
  return new Date(valor).toLocaleString("es-MX", {
    ...(conHora ? { dateStyle: "long", timeStyle: "short" } : { dateStyle: "long" }),
    timeZone: "America/Mexico_City",
  });
}

export function TallerEstadoPublico({
  marca,
  orden,
}: {
  marca: { nombre: string; logo: string | null };
  orden: Orden;
}) {
  const indice = Math.max(0, PASOS.findIndex((paso) => paso.clave === orden.estado));
  const activo = PASOS[indice];
  const promesa = fecha(orden.fechaPromesa, true);
  const entregado = fecha(orden.entregadoEn);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {marca.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={marca.logo} alt={marca.nombre} className="h-10 w-10 rounded-lg object-contain" />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
              {marca.nombre.slice(0, 1)}
            </span>
          )}
          <div>
            <p className="text-sm font-semibold">{marca.nombre}</p>
            <p className="text-xs text-muted-foreground">Seguimiento de tu servicio</p>
          </div>
        </div>
        <span className="tnum rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
          Orden #{orden.numero}
        </span>
      </header>

      <section className="surface space-y-3 p-5" aria-label="Estado del servicio">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Estado actual</p>
        <h1 className="text-2xl font-bold leading-tight">{activo?.texto ?? orden.estadoTexto}</h1>
        <p className="text-sm text-muted-foreground">
          {orden.estado === "listo"
            ? "Tu vehículo está listo. Puedes pasar por él en el horario del taller."
            : orden.estado === "entregado"
              ? "Servicio entregado. ¡Gracias por tu confianza!"
              : "Te avisaremos en cuanto haya un cambio en tu servicio."}
        </p>

        <div className="mt-4 flex gap-1.5" aria-hidden="true">
          {PASOS.map((paso, i) => (
            <span
              key={paso.clave}
              className={`h-2 flex-1 rounded-full ${i < indice ? "bg-success" : i === indice ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>
        <ol className="mt-2 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
          {PASOS.map((paso, i) => (
            <li
              key={paso.clave}
              aria-current={i === indice ? "step" : undefined}
              className={`text-center font-semibold ${i === indice ? "text-primary" : i < indice ? "text-success" : "text-muted-foreground"}`}
            >
              {paso.texto}
            </li>
          ))}
        </ol>
      </section>

      <section className="surface space-y-4 p-5" aria-label="Datos del vehículo">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vehículo</p>
          <p className="mt-1 text-lg font-semibold">
            {orden.vehiculo.marca} {orden.vehiculo.modelo}
            {orden.vehiculo.anio ? ` · ${orden.vehiculo.anio}` : ""}
          </p>
          <p className="mt-1 inline-flex rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-sm tracking-wide">
            {orden.vehiculo.placa}
          </p>
          {orden.vehiculo.color && <p className="mt-1 text-sm text-muted-foreground">Color: {orden.vehiculo.color}</p>}
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-muted/60 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Promesa de entrega</dt>
            <dd className="mt-1 text-sm font-semibold">{promesa ?? "Por confirmar"}</dd>
          </div>
          <div className={`rounded-xl p-3 ${orden.saldo > 0 ? "bg-warning/10" : "bg-success/10"}`}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saldo pendiente</dt>
            <dd className={`tnum mt-1 text-lg font-bold ${orden.saldo > 0 ? "text-warning" : "text-success"}`}>
              {monedaTallerTexto(orden.saldo)}
            </dd>
          </div>
        </dl>

        {entregado && <p className="text-xs text-muted-foreground">Entregado el {entregado}.</p>}
      </section>

      {orden.enlaceAprobacion && (
        <section className="surface space-y-2 border-warning/30 bg-warning/5 p-5">
          <p className="text-sm font-semibold">Tu autorización está pendiente</p>
          <p className="text-sm text-muted-foreground">
            Revisa el diagnóstico y la cotización para que podamos continuar con la reparación.
          </p>
          <a
            href={orden.enlaceAprobacion}
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Revisar y aprobar cotización
          </a>
        </section>
      )}

      <footer className="space-y-1 pb-4 text-center text-xs text-muted-foreground">
        <p>Este enlace es personal y deja de funcionar 30 días después de la entrega.</p>
        {orden.estado === "entregado" && orden.entregadoEn ? null : <p>Si algo no coincide, contacta directamente al taller.</p>}
      </footer>
    </div>
  );
}
