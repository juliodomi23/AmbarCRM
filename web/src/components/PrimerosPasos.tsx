import Link from "next/link";
import { IconoCheck } from "@/components/icons";

type Pasos = { whatsapp: boolean; embudo: boolean; equipo: boolean; contacto: boolean };

const PASOS: { clave: keyof Pasos; titulo: string; detalle: string; href: string; cta: string }[] = [
  {
    clave: "whatsapp",
    titulo: "Conecta tu WhatsApp",
    detalle: "Escanea el QR para que tus mensajes lleguen al CRM.",
    href: "/configuracion",
    cta: "Conectar"
  },
  {
    clave: "embudo",
    titulo: "Crea tu embudo de ventas",
    detalle: "Define las etapas por las que pasa un cliente (nuevo, negociación, ganado…).",
    href: "/configuracion",
    cta: "Crear embudo"
  },
  {
    clave: "equipo",
    titulo: "Invita a tu equipo",
    detalle: "Agrega a las personas que atenderán los chats.",
    href: "/configuracion",
    cta: "Invitar"
  },
  {
    clave: "contacto",
    titulo: "Registra tu primer contacto",
    detalle: "Se crea solo cuando alguien te escribe, o agrégalo a mano.",
    href: "/contactos",
    cta: "Agregar"
  }
];

/** Checklist de onboarding. Se muestra en Inicio (solo admin) hasta completar los 4 pasos. */
export function PrimerosPasos({ pasos }: { pasos: Pasos }) {
  const hechos = PASOS.filter((p) => pasos[p.clave]).length;
  if (hechos === PASOS.length) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-navy">Primeros pasos</h2>
          <p className="text-xs text-slate-500">Deja tu CRM listo en unos minutos.</p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ambar">
          {hechos} de {PASOS.length}
        </span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-amber-200/60">
        <div className="h-full rounded-full bg-ambar transition-all" style={{ width: `${(hechos / PASOS.length) * 100}%` }} />
      </div>
      <ol className="space-y-1">
        {PASOS.map((p) => {
          const hecho = pasos[p.clave];
          return (
            <li key={p.clave} className="flex items-center gap-3 rounded-lg px-2 py-2">
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                  hecho ? "bg-green-500 text-white" : "border-2 border-slate-300 bg-white"
                }`}
              >
                {hecho && <IconoCheck className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${hecho ? "text-slate-400 line-through" : "text-slate-700"}`}>
                  {p.titulo}
                </span>
                {!hecho && <span className="block text-xs text-slate-500">{p.detalle}</span>}
              </span>
              {!hecho && (
                <Link
                  href={p.href}
                  className="shrink-0 rounded-lg bg-navy px-3 py-1.5 text-xs font-medium text-white transition hover:bg-navy/90"
                >
                  {p.cta}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
