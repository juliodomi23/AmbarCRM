export type Correo = { para: string; asunto: string; texto: string; html: string };
type Transporte = { sendMail: (correo: { from: string; to: string; subject: string; text: string; html: string }) => Promise<unknown> };
type Nodemailer = { createTransport: (opciones: Record<string, unknown>) => Transporte };
const cargar = process.getBuiltinModule("module").createRequire(`${process.cwd()}/package.json`);

function configuracion() {
  const { SMTP_HOST: host, SMTP_PORT, SMTP_SECURE, SMTP_USER: user, SMTP_PASSWORD: pass, SMTP_FROM: from } = process.env;
  const port = Number(SMTP_PORT);
  if (!host?.trim() || !user?.trim() || !pass || !from?.trim() || !Number.isInteger(port) || port < 1 || port > 65535 || !["true", "false"].includes(SMTP_SECURE ?? "")) return null;
  return { host, port, secure: SMTP_SECURE === "true", auth: { user, pass }, from };
}

export function correoConfigurado() {
  return configuracion() !== null;
}

export async function enviarCorreo({ para, asunto, texto, html }: Correo) {
  const config = configuracion();
  if (!config) {
    console.info("[correo] SMTP sin configurar; envío omitido");
    return false;
  }
  try {
    const { from, ...opciones } = config;
    const nodemailer = cargar("nodemailer") as Nodemailer;
    const transporte = nodemailer.createTransport({ ...opciones, requireTLS: !opciones.secure, connectionTimeout: 5_000, greetingTimeout: 5_000, socketTimeout: 5_000, logger: false, debug: false });
    await transporte.sendMail({ from, to: para, subject: asunto, text: texto, html });
    return true;
  } catch {
    console.error("[correo] No se pudo enviar el correo");
    return false;
  }
}
