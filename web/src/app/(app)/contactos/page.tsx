import { listarContactos, listarEtiquetas, listarUsuariosActivos } from "@/lib/services/contactos";
import { serializar } from "@/lib/serialize";
import { ContactosCliente } from "@/components/contactos/ContactosCliente";

export const dynamic = "force-dynamic";

export default async function ContactosPage() {
  const [contactos, etiquetas, usuarios] = await Promise.all([
    listarContactos(),
    listarEtiquetas(),
    listarUsuariosActivos()
  ]);

  return (
    <ContactosCliente
      contactos={serializar(contactos).map((c: any) => ({
        id: c.id,
        nombre: c.nombre,
        telefono: c.telefono,
        email: c.email,
        empresa: c.empresa,
        fuente: c.fuente,
        responsableId: c.responsableId,
        responsable: c.responsable?.nombre ?? null,
        optOutDifusion: c.optOutDifusion,
        oportunidades: c._count.oportunidades,
        etiquetas: c.etiquetas.map((e: any) => ({ id: e.etiqueta.id, nombre: e.etiqueta.nombre, color: e.etiqueta.color }))
      }))}
      etiquetas={serializar(etiquetas)}
      usuarios={serializar(usuarios).map((u: any) => ({ id: u.id, nombre: u.nombre }))}
    />
  );
}
