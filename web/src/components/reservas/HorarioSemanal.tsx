"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmar } from "@/components/Confirmador";
import { toast } from "@/components/Toaster";
import { IconoCerrar } from "@/components/icons";
import { FormularioModulo, type CampoFormulario } from "@/components/modulos/FormularioModulo";
import { horaTexto } from "@/lib/reservas/horarios";

type DoctorVista = {
  id: string;
  nombre: string;
  especialidad: string | null;
  color: string;
};

type HorarioVista = {
  id: string;
  doctorId: string;
  diaSemana: number;
  inicioMin: number;
  finMin: number;
};

type Opcion = { valor: string; etiqueta: string };

const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];
const NOMBRES_DIA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function colorSeguro(color: string) {
  return color?.startsWith("#") ? color : "#0ea5e9";
}

function BotonQuitar({ id, etiqueta }: { id: string; etiqueta: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function quitar() {
    const ok = await confirmar({
      titulo: "Quitar horario",
      mensaje: `Se quita el horario ${etiqueta}.`,
      confirmar: "Quitar",
    });
    if (!ok) return;
    setOcupado(true);
    const respuesta = await fetch(`/api/reservas/horarios/${id}`, { method: "DELETE" });
    const datos = await respuesta.json().catch(() => ({}));
    setOcupado(false);
    if (!respuesta.ok) {
      toast(datos.error ?? "No se pudo quitar el horario", "error");
      return;
    }
    toast("Horario eliminado");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={quitar}
      disabled={ocupado}
      aria-label={`Quitar horario ${etiqueta}`}
      title="Quitar horario"
      className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-card/90 text-muted-foreground opacity-100 shadow-sm transition hover:text-destructive disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
    >
      <IconoCerrar className="h-2.5 w-2.5" />
    </button>
  );
}

export function HorarioSemanal({
  doctores,
  horarios,
  esAdmin,
  opcionesDoctor,
}: {
  doctores: DoctorVista[];
  horarios: HorarioVista[];
  esAdmin: boolean;
  opcionesDoctor: Opcion[];
}) {
  const campos: CampoFormulario[] = [
    { nombre: "doctorId", etiqueta: "Especialista", tipo: "seleccion", requerido: true, opciones: opcionesDoctor },
    {
      nombre: "diaSemana",
      etiqueta: "Día",
      tipo: "seleccion",
      requerido: true,
      opciones: ORDEN_DIAS.map((dia) => ({ valor: String(dia), etiqueta: NOMBRES_DIA[dia] })),
    },
    { nombre: "inicio", etiqueta: "Desde", tipo: "hora", requerido: true, valorInicial: "09:00" },
    { nombre: "fin", etiqueta: "Hasta", tipo: "hora", requerido: true, valorInicial: "14:00" },
  ];

  if (doctores.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-3 py-5 text-sm text-muted-foreground">
        Agrega especialistas para configurar sus horarios.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {doctores.map((doctor) => {
        const color = colorSeguro(doctor.color);
        const turnos = horarios.filter((horario) => horario.doctorId === doctor.id);
        const horasSemana = turnos.reduce((total, horario) => total + horario.finMin - horario.inicioMin, 0) / 60;
        const horasTexto = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(horasSemana);

        return (
          <article key={doctor.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/40 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                  style={{ backgroundColor: `${color}18` }}
                  aria-hidden="true"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{doctor.nombre}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {doctor.especialidad || "Sin especialidad"} · {horasTexto} h/semana
                    {turnos.length === 0 ? " · sin horario" : ""}
                  </p>
                </div>
              </div>
              {esAdmin && (
                <FormularioModulo
                  discreto
                  boton="+ Agregar horario"
                  titulo={`Horario de ${doctor.nombre}`}
                  endpoint="/api/reservas/horarios"
                  campos={campos}
                  iniciales={{ doctorId: doctor.id }}
                />
              )}
            </header>

            <div className="overflow-x-auto p-2.5">
              <div className="grid min-w-[620px] grid-cols-7 gap-1.5">
                {ORDEN_DIAS.map((dia) => {
                  const delDia = turnos
                    .filter((horario) => horario.diaSemana === dia)
                    .sort((a, b) => a.inicioMin - b.inicioMin);
                  const finDeSemana = dia === 0 || dia === 6;
                  return (
                    <div
                      key={dia}
                      className={[
                        "min-h-[88px] rounded-lg border border-border/60 p-1.5",
                        finDeSemana ? "bg-muted/30" : "bg-background/40",
                      ].join(" ")}
                    >
                      <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {NOMBRES_DIA[dia]}
                      </p>
                      <div className="mt-1 space-y-1">
                        {delDia.length === 0 ? (
                          <p className="py-2 text-center text-[10px] text-muted-foreground/50">Libre</p>
                        ) : (
                          delDia.map((horario) => (
                            <div
                              key={horario.id}
                              className="group relative rounded-md border px-1 py-1 text-center"
                              style={{ backgroundColor: `${color}12`, borderColor: `${color}35` }}
                              title={`${doctor.nombre} · ${NOMBRES_DIA[dia]} ${horaTexto(horario.inicioMin)} a ${horaTexto(horario.finMin)}`}
                            >
                              <span className="block text-[10px] font-semibold leading-tight text-foreground">
                                {horaTexto(horario.inicioMin)}
                              </span>
                              <span className="block text-[9px] leading-tight text-muted-foreground">
                                a {horaTexto(horario.finMin)}
                              </span>
                              {esAdmin && (
                                <BotonQuitar
                                  id={horario.id}
                                  etiqueta={`${NOMBRES_DIA[dia]} ${horaTexto(horario.inicioMin)} a ${horaTexto(horario.finMin)}`}
                                />
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
