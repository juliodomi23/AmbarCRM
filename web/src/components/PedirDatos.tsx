"use client";

import { useEffect, useRef, useState } from "react";
import { Boton, CLASE_CAMPO } from "@/components/ui";

export type CampoPedido = {
  /** Clave con la que vuelve el valor en el resultado. */
  nombre: string;
  etiqueta: string;
  tipo?: "texto" | "numero" | "dinero" | "textarea" | "seleccion";
  /** Valor inicial; el resultado devuelve siempre el texto tal cual lo escribió la persona. */
  valor?: string;
  requerido?: boolean;
  placeholder?: string;
  ayuda?: string;
  opciones?: { valor: string; etiqueta: string }[];
  /** numero/dinero: exige > 0 (por defecto solo exige >= 0). */
  positivo?: boolean;
  /** numero/dinero: tope superior. */
  max?: number;
  /** Validación extra del cliente: devuelve el mensaje de error o null. */
  validar?: (valor: string) => string | null;
};

type Opciones = {
  titulo: string;
  mensaje?: string;
  campos: CampoPedido[];
  confirmar?: string;
  cancelar?: string;
};
type Pendiente = Opciones & { responder: (valores: Record<string, string> | null) => void };

// Mismo patrón que Confirmador/Toaster: `await pedirDatos(...)` y el <PedirDatos/> montado en AppShell lo pinta.
let abrir: ((p: Pendiente) => void) | null = null;

/** Reemplazo de window.prompt con campos. Resuelve con los valores (texto) o null si se cancela. */
export function pedirDatos(opciones: Opciones): Promise<Record<string, string> | null> {
  if (!abrir) return Promise.resolve(null);
  return new Promise((responder) => abrir!({ ...opciones, responder }));
}

function errorCampo(c: CampoPedido, valor: string): string | null {
  const tipo = c.tipo ?? "texto";
  if (tipo === "seleccion") return c.requerido && !valor ? "Elige una opción" : null;
  if (!valor.trim()) return c.requerido ? "Este campo es obligatorio" : null;
  if (tipo === "numero" || tipo === "dinero") {
    const v = valor.trim();
    if (!/^\d+(\.\d+)?$/.test(v)) return tipo === "dinero" ? "Escribe un monto válido, por ejemplo 150.50" : "Escribe un número válido";
    const n = Number(v);
    if (c.positivo && n <= 0) return "Debe ser mayor a cero";
    if (c.max !== undefined && n > c.max) return `No puede ser mayor a ${c.max}`;
  }
  return c.validar?.(valor) ?? null;
}

export function PedirDatos() {
  const [actual, setActual] = useState<Pendiente | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const primero = useRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>(null);

  useEffect(() => {
    abrir = (p) => {
      setValores(Object.fromEntries(p.campos.map((c) => [c.nombre, c.valor ?? c.opciones?.[0]?.valor ?? ""])));
      setErrores({});
      setActual(p);
    };
    return () => { abrir = null; };
  }, []);

  useEffect(() => {
    if (!actual) return;
    primero.current?.focus();
    primero.current?.select?.();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual]);

  function cerrar(resultado: Record<string, string> | null) {
    actual?.responder(resultado);
    setActual(null);
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!actual) return;
    const nuevos: Record<string, string> = {};
    for (const c of actual.campos) {
      const mensaje = errorCampo(c, valores[c.nombre] ?? "");
      if (mensaje) nuevos[c.nombre] = mensaje;
    }
    setErrores(nuevos);
    if (Object.keys(nuevos).length) return;
    cerrar(valores);
  }

  if (!actual) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="pedir-titulo">
      <div className="animate-fade-in absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" onClick={() => cerrar(null)} />
      <form onSubmit={enviar} noValidate className="surface surface-pop animate-pop relative max-h-[90vh] w-full max-w-md overflow-y-auto p-5 sm:p-6">
        <h2 id="pedir-titulo" className="text-base font-semibold text-foreground">{actual.titulo}</h2>
        {actual.mensaje && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{actual.mensaje}</p>}
        <div className="mt-4 space-y-3">
          {actual.campos.map((c, i) => {
            const tipo = c.tipo ?? "texto";
            const id = `pedir-${c.nombre}`;
            const comunes = {
              id,
              value: valores[c.nombre] ?? "",
              "aria-invalid": errores[c.nombre] ? true : undefined,
              "aria-describedby": errores[c.nombre] ? `${id}-error` : c.ayuda ? `${id}-ayuda` : undefined,
              className: `${CLASE_CAMPO} ${errores[c.nombre] ? "border-destructive focus:border-destructive focus:ring-destructive/30" : ""}`,
            };
            const cambiar = (v: string) => {
              setValores((a) => ({ ...a, [c.nombre]: v }));
              if (errores[c.nombre]) setErrores((a) => { const { [c.nombre]: _omitido, ...resto } = a; return resto; });
            };
            return (
              <div key={c.nombre} className="space-y-1">
                <label htmlFor={id} className="block text-sm font-medium text-muted-foreground">
                  {c.etiqueta}{c.requerido ? "" : <span className="font-normal"> (opcional)</span>}
                </label>
                {tipo === "textarea" ? (
                  <textarea {...comunes} ref={i === 0 ? primero : undefined} rows={5} placeholder={c.placeholder} onChange={(e) => cambiar(e.target.value)} />
                ) : tipo === "seleccion" ? (
                  <select {...comunes} ref={i === 0 ? primero : undefined} onChange={(e) => cambiar(e.target.value)}>
                    {c.opciones?.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                  </select>
                ) : (
                  <input
                    {...comunes}
                    ref={i === 0 ? primero : undefined}
                    type="text"
                    inputMode={tipo === "dinero" ? "decimal" : tipo === "numero" ? "decimal" : undefined}
                    placeholder={c.placeholder}
                    autoComplete="off"
                    onChange={(e) => cambiar(e.target.value)}
                  />
                )}
                {c.ayuda && !errores[c.nombre] && <p id={`${id}-ayuda`} className="text-xs text-muted-foreground">{c.ayuda}</p>}
                {errores[c.nombre] && <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">{errores[c.nombre]}</p>}
              </div>
            );
          })}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Boton type="button" variante="ghost" onClick={() => cerrar(null)}>{actual.cancelar ?? "Cancelar"}</Boton>
          <Boton type="submit">{actual.confirmar ?? "Aceptar"}</Boton>
        </div>
      </form>
    </div>
  );
}

export const OPCIONES_METODO_PAGO = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "tarjeta", etiqueta: "Tarjeta" },
  { valor: "transferencia", etiqueta: "Transferencia" },
];
