import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { correoConfigurado, enviarCorreo } from "@/lib/correo";
import { normalizarMarca } from "@/lib/brand";
import { transaccionTenant } from "@/lib/retail-db";

export const MENSAJE_RECUPERAR = "Si los datos corresponden a una cuenta activa, recibirás un correo con las instrucciones para recuperar tu contraseña.";
export const ERROR_TOKEN = "El enlace no es válido o ya venció. Solicita uno nuevo.";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function escaparHtml(texto: string) {
  return texto.replace(/[&<>"']/g, (caracter) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[caracter]!);
}

export async function solicitarRestablecimiento(slug: string, email: string) {
  if (!correoConfigurado()) {
    console.info("[recuperar] SMTP sin configurar; solicitud omitida");
    return;
  }
  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
  if (!baseUrl) return;
  const org = await db.org.findUnique({ where: { slug } });
  if (!org?.activo) return;

  const resultado = await transaccionTenant(org.id, async (tx) => {
    const organizaciones = await tx.$queryRaw<Array<{ id: bigint }>>`SELECT id FROM orgs WHERE id = ${org.id} AND activo FOR SHARE`;
    if (!organizaciones[0]) return null;
    const usuarios = await tx.$queryRaw<Array<{ id: bigint; email: string }>>`
      SELECT id, email FROM usuarios
      WHERE lower(email) = ${email} AND activo
      ORDER BY id LIMIT 1 FOR UPDATE
    `;
    const usuario = usuarios[0];
    if (!usuario) return null;
    const token = randomBytes(32).toString("hex");
    const ahora = new Date();
    await tx.restablecimientoPassword.updateMany({ where: { usuarioId: usuario.id, usadoAt: null }, data: { usadoAt: ahora } });
    await tx.restablecimientoPassword.create({ data: { usuarioId: usuario.id, tokenHash: hashToken(token), venceAt: new Date(ahora.getTime() + 60 * 60_000) } });
    const ajustes = await tx.ajustes.findFirst();
    const marca = normalizarMarca(ajustes);
    return { usuario, token, nombre: ajustes?.marcaNombre?.trim() ? marca.nombre : org.nombre, color: marca.colorPrimario };
  });
  if (!resultado) return;
  const { usuario, token, nombre, color } = resultado;
  const enlace = `${baseUrl}/restablecer/${token}`;
  await enviarCorreo({
    para: usuario.email,
    asunto: `${nombre}: recupera tu contraseña`,
    texto: `${nombre}\n\nPara restablecer tu contraseña abre este enlace:\n${enlace}\n\nVence en 60 minutos y solo funciona una vez. Si no lo solicitaste, ignora este correo.`,
    html: `<h1 style="color:${color}">${escaparHtml(nombre)}</h1><p>Recibimos una solicitud para restablecer tu contraseña.</p><p><a href="${escaparHtml(enlace)}">Restablecer contraseña</a></p><p>El enlace vence en 60 minutos y solo funciona una vez. Si no lo solicitaste, ignora este correo.</p>`,
  });
}

export async function restablecerPassword(token: string, nueva: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = hashToken(token);
  const [resolucion] = await dbRaw.$queryRaw<Array<{ org_id: bigint | null }>>`
    SELECT resolve_org_by_password_hash(${tokenHash}) AS org_id
  `;
  if (!resolucion?.org_id) return null;
  const orgId = resolucion.org_id;
  const solicitud = await runWithOrg(orgId, () => db.restablecimientoPassword.findUnique({ where: { tokenHash } }));
  if (!solicitud) return null;
  const passwordHash = await bcrypt.hash(nueva, 10);

  return transaccionTenant(orgId, async (tx) => {
    const organizaciones = await tx.$queryRaw<Array<{ nombre: string }>>`SELECT nombre FROM orgs WHERE id = ${orgId} AND activo FOR SHARE`;
    if (!organizaciones[0]) return null;
    const usuarios = await tx.$queryRaw<Array<{ id: bigint; email: string }>>`SELECT id, email FROM usuarios WHERE id = ${solicitud.usuarioId} AND activo FOR UPDATE`;
    const usuario = usuarios[0];
    if (!usuario) return null;
    const ahora = new Date();
    const usado = await tx.restablecimientoPassword.updateMany({ where: { id: solicitud.id, tokenHash, usadoAt: null, venceAt: { gt: ahora } }, data: { usadoAt: ahora } });
    if (usado.count !== 1) return null;
    await tx.usuario.update({ where: { id: usuario.id }, data: { passwordHash, passwordCambiadaAt: ahora } });
    await tx.restablecimientoPassword.updateMany({ where: { usuarioId: usuario.id, usadoAt: null }, data: { usadoAt: ahora } });
    return { email: usuario.email, nombre: organizaciones[0].nombre };
  });
}

export async function avisarPasswordCambiada({ email, nombre }: { email: string; nombre: string }) {
  await enviarCorreo({
    para: email,
    asunto: `${nombre}: tu contraseña fue cambiada`,
    texto: `${nombre}\n\nTu contraseña fue cambiada. Si no hiciste este cambio, contacta al administrador de tu organización.`,
    html: `<h1>${escaparHtml(nombre)}</h1><p>Tu contraseña fue cambiada.</p><p>Si no hiciste este cambio, contacta al administrador de tu organización.</p>`,
  });
}
