import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { obtenerPerfilInstagram, listarMediaInstagram } from "@/lib/creador-ig/servicio";

export const dynamic = "force-dynamic";

export const GET = conModulo("creador_ig", {}, async (sesion, req: Request) => {
  if (!sesion.userId) return NextResponse.json({ error: "Sesión sin usuario" }, { status: 400 });
  const canalId = new URL(req.url).searchParams.get("canalId");
  if (!canalId || !/^\d+$/.test(canalId)) {
    return NextResponse.json({ error: "Falta canalId" }, { status: 400 });
  }
  const canalIdBigint = BigInt(canalId);
  const [perfil, media] = await Promise.all([
    obtenerPerfilInstagram(sesion.orgId!, canalIdBigint),
    listarMediaInstagram(sesion.orgId!, canalIdBigint, 25),
  ]);
  return NextResponse.json({ perfil, media });
});