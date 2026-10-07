import { db } from "@/lib/db";
import {
  listarContactos,
  listarEtiquetas,
  listarUsuariosActivos,
} from "@/lib/services/contactos";
import { serializar } from "@/lib/serialize";
import { ContactosCliente } from "@/components/contactos/ContactosCliente";
import { moduloActivo } from "@/lib/modulos";

export const dynamic = "force-dynamic";

export default async function ContactosPage() {
  const [contactos, etiquetas, usuarios, campos, citasActivo] = await Promise.all([
    listarContactos(),
    listarEtiquetas(),
    listarUsuariosActivos(),
    db.campoPersonalizado.findMany({
      where: { entidad: "contacto", activo: true },
      orderBy: { orden: "asc" },
    }),
    moduloActivo("citas"),
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
        campos: c.campos,
        etiquetas: c.etiquetas.map((e: any) => ({
          id: e.etiqueta.id,
          nombre: e.etiqueta.nombre,
          color: e.etiqueta.color,
        })),
      }))}
      etiquetas={serializar(etiquetas)}
      usuarios={serializar(usuarios).map((u: any) => ({
        id: u.id,
        nombre: u.nombre,
      }))}
      camposPersonalizados={serializar(campos)}
      citasActivo={citasActivo}
    />
  );
}
