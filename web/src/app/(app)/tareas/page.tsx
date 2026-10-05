import { listarTareas } from "@/lib/services/tareas";
import { listarUsuariosActivos } from "@/lib/services/contactos";
import { serializar } from "@/lib/serialize";
import { TareasCliente } from "@/components/tareas/TareasCliente";

export const dynamic = "force-dynamic";

export default async function TareasPage() {
  const [tareas, usuarios] = await Promise.all([listarTareas(), listarUsuariosActivos()]);

  return (
    <TareasCliente
      tareas={serializar(tareas).map((t: any) => ({
        id: t.id,
        titulo: t.titulo,
        descripcion: t.descripcion,
        venceAt: t.venceAt,
        completada: t.completada,
        responsable: t.responsable?.nombre ?? null,
        oportunidad: t.oportunidad ? { id: t.oportunidad.id, titulo: t.oportunidad.titulo, contacto: t.oportunidad.contacto.nombre } : null
      }))}
      usuarios={serializar(usuarios).map((u: any) => ({ id: u.id, nombre: u.nombre }))}
    />
  );
}
