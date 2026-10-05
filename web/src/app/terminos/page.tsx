import { LegalPage } from "@/components/LegalPage";

export const dynamic = "force-dynamic";

export default function TermsPage() {
  return (
    <LegalPage title="Términos de servicio" updated="5 de octubre de 2026">
      <p>Estos términos regulan el uso de AmbarCRM, una plataforma de atención y gestión comercial conectada directamente con WhatsApp Cloud API.</p>
      <section><h2 className="text-xl font-semibold text-slate-900">Uso autorizado</h2><p>La organización usuaria debe contar con autorización para contactar a sus destinatarios, respetar las preferencias de baja y cumplir las políticas de WhatsApp Business y la legislación aplicable.</p></section>
      <section><h2 className="text-xl font-semibold text-slate-900">Responsabilidad sobre el contenido</h2><p>Cada organización es responsable de los mensajes, plantillas, archivos, automatizaciones y bases de contactos que utiliza dentro del servicio.</p></section>
      <section><h2 className="text-xl font-semibold text-slate-900">Disponibilidad</h2><p>El servicio depende parcialmente de Meta y de proveedores de infraestructura. Se realizarán esfuerzos razonables para mantenerlo disponible, sin garantizar operación ininterrumpida frente a fallos o restricciones externas.</p></section>
      <section><h2 className="text-xl font-semibold text-slate-900">Suspensión</h2><p>Podemos suspender accesos que comprometan la seguridad, infrinjan políticas de WhatsApp o utilicen la plataforma para mensajes no solicitados, fraude o actividades ilícitas.</p></section>
    </LegalPage>
  );
}
