import { LegalPage } from "@/components/LegalPage";

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const email = process.env.PRIVACY_EMAIL || "privacidad@tudominio.com";
  return (
    <LegalPage title="Aviso de privacidad" updated="21 de octubre de 2026">
      <p>AmbarCRM procesa datos de contacto y conversaciones de WhatsApp, Facebook Messenger e Instagram únicamente para prestar las funciones contratadas por cada organización usuaria del servicio.</p>
      <section><h2 className="text-xl font-semibold text-foreground">Datos tratados</h2><p>Podemos tratar nombre, teléfono, el identificador de la persona en Messenger o Instagram, su nombre y foto de perfil públicos cuando Meta los proporciona, contenido de mensajes, archivos compartidos, estado de entrega, información de oportunidades comerciales y datos de los usuarios autorizados del CRM.</p></section>
      <section><h2 className="text-xl font-semibold text-foreground">Finalidades</h2><p>Los datos se utilizan para enviar y recibir mensajes solicitados, organizar la atención al cliente, ejecutar automatizaciones configuradas, generar reportes operativos y proteger la seguridad del servicio.</p></section>
      <section><h2 className="text-xl font-semibold text-foreground">WhatsApp, Messenger, Instagram y Meta</h2><p>La mensajería se presta mediante WhatsApp Cloud API y la plataforma de mensajería de Meta para Messenger e Instagram. Para conectar una página de Facebook o una cuenta profesional de Instagram, el administrador de la organización autoriza el acceso con Facebook Login; solo accedemos a los mensajes de esa página o cuenta y a la lista de páginas que el administrador elige. Los identificadores de acceso se guardan cifrados y se eliminan al desconectar el canal. El uso de estos servicios también está sujeto a los términos y políticas de Meta. AmbarCRM no vende datos personales ni los utiliza para crear perfiles publicitarios propios.</p></section>
      <section><h2 className="text-xl font-semibold text-foreground">Conservación y seguridad</h2><p>Conservamos la información mientras exista una relación de servicio o sea necesaria para cumplir obligaciones aplicables. Aplicamos aislamiento por organización, control de acceso y cifrado de credenciales de integración.</p></section>
      <section><h2 className="text-xl font-semibold text-foreground">Derechos y contacto</h2><p>Para solicitar acceso, corrección, oposición o eliminación de datos, escribe a <a className="text-primary underline" href={`mailto:${email}`}>{email}</a>.</p></section>
    </LegalPage>
  );
}
