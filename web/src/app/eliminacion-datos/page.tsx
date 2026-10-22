import { LegalPage } from "@/components/LegalPage";

export const dynamic = "force-dynamic";

export default function DataDeletionPage() {
  const email = process.env.PRIVACY_EMAIL || "privacidad@tudominio.com";
  return (
    <LegalPage title="Eliminación de datos" updated="21 de octubre de 2026">
      <p>Una persona o negocio puede solicitar la eliminación de la información asociada con su uso de AmbarCRM.</p>
      <ol className="list-decimal space-y-2 pl-6">
        <li>Escribe a <a className="text-primary underline" href={`mailto:${email}`}>{email}</a> desde el correo asociado con tu cuenta.</li>
        <li>Incluye el nombre de la organización y el número de WhatsApp, la página de Facebook o la cuenta de Instagram relacionada.</li>
        <li>Indica si deseas eliminar una cuenta, una conversación específica o toda la información de la organización.</li>
        <li>Confirmaremos la identidad y responderemos con un folio de seguimiento.</li>
      </ol>
      <p>Las solicitudes verificadas se procesan normalmente dentro de 30 días. Podemos conservar únicamente la información necesaria para cumplir obligaciones legales, resolver disputas o prevenir abuso.</p>
      <p>Desconectar WhatsApp, Messenger o Instagram desde Configuración elimina la autorización de AmbarCRM sobre la cuenta conectada y cancela la suscripción a sus mensajes; el historial puede conservarse hasta que se solicite expresamente su eliminación.</p>
    </LegalPage>
  );
}
