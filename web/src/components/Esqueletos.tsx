// Esqueletos de carga con la forma real de cada pantalla (encabezado + tarjetas/tabla).
// `animate-pulse` se apaga con prefers-reduced-motion (motion-reduce) y quedan bloques fijos.

/** Bloque gris con pulso suave; `className` fija su tamaño. */
export function Bloque({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-foreground/10 motion-reduce:animate-none ${className}`} />;
}

/** Contenedor accesible: anuncia "Cargando" a lectores de pantalla y oculta los bloques decorativos. */
export function Esqueleto({ children, className = "p-4 md:p-6" }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={`space-y-5 ${className}`}>
      <span className="sr-only">Cargando…</span>
      {children}
    </div>
  );
}

/** Título + descripción a la izquierda y botón de acción a la derecha (EncabezadoPagina). */
export function EsqueletoEncabezado({ accion = true }: { accion?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-2">
        <Bloque className="h-7 w-48 max-w-full" />
        <Bloque className="h-4 w-64 max-w-full" />
      </div>
      {accion && <Bloque className="h-9 w-32 rounded-lg" />}
    </div>
  );
}

/** Fila de botones secundarios bajo el encabezado. */
export function EsqueletoAcciones({ cantidad = 6 }: { cantidad?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: cantidad }, (_, i) => <Bloque key={i} className="h-9 w-28 rounded-lg" />)}
    </div>
  );
}

/** Tarjetas de métricas (etiqueta pequeña + cifra grande). */
export function EsqueletoMetricas({ cantidad = 4 }: { cantidad?: number }) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${cantidad === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
      {Array.from({ length: cantidad }, (_, i) => (
        <div key={i} className="surface space-y-3 p-4">
          <Bloque className="h-3 w-24 max-w-full" />
          <Bloque className="h-7 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Barra de búsqueda + filtro. */
export function EsqueletoFiltros() {
  return (
    <div className="flex flex-wrap gap-3">
      <Bloque className="h-10 min-w-0 flex-1 basis-56 rounded-lg" />
      <Bloque className="h-10 w-40 rounded-lg" />
    </div>
  );
}

/** Tabla con encabezado de columnas y filas. */
export function EsqueletoTabla({ filas = 6, columnas = 5 }: { filas?: number; columnas?: number }) {
  return (
    <div className="surface overflow-hidden">
      <div className="flex gap-4 border-b border-border/60 px-4 py-3">
        {Array.from({ length: columnas }, (_, i) => <Bloque key={i} className={`h-3 ${i === 0 ? "w-1/4" : "flex-1"}`} />)}
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: filas }, (_, f) => (
          <div key={f} className="flex items-center gap-4 px-4 py-4">
            {Array.from({ length: columnas }, (_, i) => <Bloque key={i} className={`h-4 ${i === 0 ? "w-1/4" : "flex-1"}`} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lista de filas con casilla/avatar a la izquierda y dos líneas de texto. */
export function EsqueletoLista({ filas = 5 }: { filas?: number }) {
  return (
    <div className="surface divide-y divide-border/60 overflow-hidden">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3.5">
          <Bloque className="mt-0.5 h-5 w-5 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Bloque className="h-4 w-2/3" />
            <Bloque className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Tarjeta de panel con título y bloque de contenido. */
export function EsqueletoPanel({ alto = "h-56" }: { alto?: string }) {
  return (
    <div className="surface space-y-4 p-4">
      <Bloque className="h-5 w-40" />
      <Bloque className={`w-full ${alto}`} />
    </div>
  );
}

/** Columnas de un tablero kanban con tarjetas. */
export function EsqueletoKanban({ columnas = 4 }: { columnas?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: columnas }, (_, c) => (
        <div key={c} className="surface w-72 shrink-0 space-y-3 p-3">
          <div className="flex items-center justify-between">
            <Bloque className="h-4 w-28" />
            <Bloque className="h-4 w-8 rounded-full" />
          </div>
          {Array.from({ length: 3 - (c % 2) }, (_, i) => <Bloque key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ))}
    </div>
  );
}

/** Tarjetas de registro (folio + estado, cliente, importe a la derecha), como en Ventas y pedidos. */
export function EsqueletoTarjetas({ cantidad = 3 }: { cantidad?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: cantidad }, (_, i) => (
        <div key={i} className="surface space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Bloque className="h-5 w-40 max-w-full" />
              <Bloque className="h-3 w-56 max-w-full" />
            </div>
            <div className="space-y-2">
              <Bloque className="ml-auto h-5 w-20" />
              <Bloque className="h-3 w-28" />
            </div>
          </div>
          <Bloque className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
