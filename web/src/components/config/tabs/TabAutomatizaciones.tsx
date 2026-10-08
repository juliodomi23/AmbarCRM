"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui";
import { api } from "@/components/config/tabs/shared";

export function TabAutomatizaciones({ ajustes }: { ajustes: any }) {
  const router = useRouter();
  const [f, setF] = useState({
    autoAsignar: !!ajustes?.autoAsignar,
    bienvenidaActiva: !!ajustes?.bienvenidaActiva,
    bienvenidaTexto: ajustes?.bienvenidaTexto ?? "",
    crearLeadAuto: ajustes?.crearLeadAuto ?? true,
    csatActivo: !!ajustes?.csatActivo,
    csatTexto: ajustes?.csatTexto ?? "",
    horarioActivo: !!ajustes?.horarioActivo,
    horarioInicio: ajustes?.horarioInicio ?? "09:00",
    horarioFin: ajustes?.horarioFin ?? "18:00",
    horarioDias: ajustes?.horarioDias ?? "1,2,3,4,5",
    fueraHorarioTexto: ajustes?.fueraHorarioTexto ?? "",
    autoResolverActivo: !!ajustes?.autoResolverActivo,
    autoResolverHoras: ajustes?.autoResolverHoras ?? 24,
  });
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const ok = await api("/api/ajustes", "PATCH", {
      ...f,
      autoResolverHoras: Number(f.autoResolverHoras) || 24,
    });
    setGuardando(false);
    if (ok) router.refresh();
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={f.autoAsignar}
            onChange={(e) => setF({ ...f, autoAsignar: e.target.checked })}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Auto-asignar leads nuevos
            </span>
            <span className="block text-xs text-muted-foreground">
              Al entrar un WhatsApp de un número nuevo, lo asigna al agente
              activo con menos conversaciones (reparto parejo).
            </span>
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={f.crearLeadAuto}
            onChange={(e) => setF({ ...f, crearLeadAuto: e.target.checked })}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Crear lead en el embudo automáticamente
            </span>
            <span className="block text-xs text-muted-foreground">
              Cada contacto nuevo entra como oportunidad en la primera etapa del
              embudo principal. El bot o el agente lo van moviendo.
            </span>
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={f.bienvenidaActiva}
            onChange={(e) => setF({ ...f, bienvenidaActiva: e.target.checked })}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Mensaje de bienvenida automático
            </span>
            <span className="block text-xs text-muted-foreground">
              Se envía solo la primera vez que un contacto escribe.
            </span>
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">
            Texto de bienvenida
          </span>
          <textarea
            value={f.bienvenidaTexto}
            onChange={(e) => setF({ ...f, bienvenidaTexto: e.target.value })}
            rows={3}
            disabled={!f.bienvenidaActiva}
            className={[
              "w-full rounded-lg border border-input px-3 py-2 text-sm",
              "outline-none focus:ring-2 focus:ring-primary/30",
              "disabled:bg-muted",
            ].join(" ")}
          />
          <span className="text-xs text-muted-foreground">
            Variables: {"{{nombre}}"}, {"{{nombre_completo}}"}, {"{{telefono}}"}
            .
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={f.csatActivo}
            onChange={(e) => setF({ ...f, csatActivo: e.target.checked })}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Encuesta de satisfacción (CSAT)
            </span>
            <span className="block text-xs text-muted-foreground">
              Al cerrar una conversación se manda una pregunta 1-5 y se guarda
              la respuesta del cliente.
            </span>
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">
            Texto de la encuesta
          </span>
          <textarea
            value={f.csatTexto}
            onChange={(e) => setF({ ...f, csatTexto: e.target.value })}
            rows={2}
            disabled={!f.csatActivo}
            placeholder="¿Cómo calificarías nuestra atención del 1 al 5? Responde solo con el número 🙏"
            className={[
              "w-full rounded-lg border border-input px-3 py-2 text-sm",
              "outline-none focus:ring-2 focus:ring-primary/30",
              "disabled:bg-muted",
            ].join(" ")}
          />
        </label>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={f.horarioActivo}
            onChange={(e) => setF({ ...f, horarioActivo: e.target.checked })}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Mensaje fuera de horario
            </span>
            <span className="block text-xs text-muted-foreground">
              Si entra un mensaje fuera del horario de atención, se responde
              automáticamente (máx. una vez cada 4 h por chat).
            </span>
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Desde
            </span>
            <input
              type="time"
              value={f.horarioInicio}
              onChange={(e) => setF({ ...f, horarioInicio: e.target.value })}
              disabled={!f.horarioActivo}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm disabled:bg-muted"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Hasta
            </span>
            <input
              type="time"
              value={f.horarioFin}
              onChange={(e) => setF({ ...f, horarioFin: e.target.value })}
              disabled={!f.horarioActivo}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm disabled:bg-muted"
            />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Días hábiles (1=lunes … 7=domingo)
          </span>
          <input
            value={f.horarioDias}
            onChange={(e) => setF({ ...f, horarioDias: e.target.value })}
            disabled={!f.horarioActivo}
            placeholder="1,2,3,4,5"
            className="w-full rounded-lg border border-input px-3 py-2 text-sm disabled:bg-muted"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">
            Texto fuera de horario
          </span>
          <textarea
            value={f.fueraHorarioTexto}
            onChange={(e) => setF({ ...f, fueraHorarioTexto: e.target.value })}
            rows={2}
            disabled={!f.horarioActivo}
            placeholder="¡Gracias por escribir! Nuestro horario es de 9 a 18 h. Te respondemos en cuanto abramos 🙌"
            className={[
              "w-full rounded-lg border border-input px-3 py-2 text-sm",
              "outline-none focus:ring-2 focus:ring-primary/30",
              "disabled:bg-muted",
            ].join(" ")}
          />
        </label>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={f.autoResolverActivo}
            onChange={(e) =>
              setF({ ...f, autoResolverActivo: e.target.checked })
            }
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Auto-resolver chats inactivos
            </span>
            <span className="block text-xs text-muted-foreground">
              Cierra conversaciones sin actividad. Requiere llamar al endpoint
              cron desde n8n (ver INTEGRACION-BOTS.md).
            </span>
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Cerrar tras (horas sin actividad)
          </span>
          <input
            type="number"
            min={1}
            value={f.autoResolverHoras}
            onChange={(e) =>
              setF({ ...f, autoResolverHoras: e.target.value as any })
            }
            disabled={!f.autoResolverActivo}
            className="w-32 rounded-lg border border-input px-3 py-2 text-sm disabled:bg-muted"
          />
        </label>
      </div>

      <Boton onClick={guardar} disabled={guardando}>
        {guardando ? "Guardando…" : "Guardar"}
      </Boton>
    </div>
  );
}
