import { getProvider, type PlantillaOficial } from "@/lib/channel";
import { db } from "@/lib/db";
import { estadoVentana } from "@/lib/meta/ventana";
import { ErrorCajaA2 } from "@/lib/caja-a2-db";

type PlantillaSaldo = { name: string; language: string };

export function canalRecordatorioSaldo(ventanaAbierta: boolean, plantilla?: PlantillaSaldo | null) {
  if (ventanaAbierta) return "texto" as const;
  if (plantilla?.name && plantilla.language) return "plantilla" as const;
  return "sin_plantilla" as const;
}

export async function enviarRecordatorioSaldo(contactoId: bigint, usuarioId: bigint | null) {
  const cuenta = await db.cuentaCliente.findUnique({
    where: { contactoId },
    include: {
      contacto: {
        include: {
          conversaciones: {
            where: { canal: { activo: true, proveedor: "cloud_api" } },
            include: { canal: true },
            orderBy: { ultimoMensajeAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });
  if (!cuenta) throw new ErrorCajaA2("El cliente no tiene cuenta de crédito", 404);
  if (cuenta.saldo.lte(0)) throw new ErrorCajaA2("El cliente no tiene saldo pendiente", 409);
  const conversacion = cuenta.contacto.conversaciones[0];
  if (!cuenta.contacto.telefono || !conversacion?.canal) {
    throw new ErrorCajaA2("El cliente no tiene una conversación de WhatsApp oficial", 409);
  }
  const ultimoEntrante = await db.mensaje.findFirst({
    where: { conversacionId: conversacion.id, direccion: "entrante" },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "caja", activo: true }, select: { config: true } });
  const plantilla = (modulo?.config as { plantillaSaldo?: PlantillaSaldo } | null)?.plantillaSaldo;
  const forma = canalRecordatorioSaldo(estadoVentana(ultimoEntrante?.timestamp).abierta, plantilla);
  if (forma === "sin_plantilla") {
    throw new ErrorCajaA2("La ventana de 24 h está cerrada; configura una plantilla aprobada para saldo", 409);
  }
  const provider = getProvider("cloud_api", conversacion.canal.config, conversacion.canal.instancia);
  const saldo = cuenta.saldo.toFixed(2);
  const texto = `Hola ${cuenta.contacto.nombre}, te recordamos que tu saldo pendiente es $${saldo}.`;
  let resultado;
  if (forma === "plantilla") {
    if (!provider.enviarPlantilla || !provider.listarPlantillas) throw new ErrorCajaA2("El canal no admite plantillas", 409);
    const disponibles = await provider.listarPlantillas();
    const aprobada = disponibles.find((item: PlantillaOficial) => item.name === plantilla!.name && item.status === "APPROVED");
    if (!aprobada) throw new ErrorCajaA2("La plantilla de saldo no está aprobada en Meta", 409);
    resultado = await provider.enviarPlantilla(cuenta.contacto.telefono, plantilla!, [cuenta.contacto.nombre, saldo]);
  } else {
    resultado = await provider.enviarTexto(cuenta.contacto.telefono, texto);
  }
  const mensaje = await db.mensaje.create({
    data: {
      conversacionId: conversacion.id,
      direccion: "saliente",
      tipo: forma,
      contenido: forma === "plantilla" ? `[Plantilla ${plantilla!.name}] ${texto}` : texto,
      status: resultado.ok ? "enviado" : "fallido",
      errorDetalle: resultado.ok ? null : (resultado.error ?? "No se pudo enviar"),
      waMessageId: resultado.waMessageId,
      enviadoPor: usuarioId,
    },
  });
  if (!resultado.ok) throw new ErrorCajaA2(resultado.error ?? "No se pudo enviar el recordatorio", 502);
  return { forma, mensaje };
}
