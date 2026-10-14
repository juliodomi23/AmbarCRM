import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { crearServidor, listarServidores, validarServidor } from "@/lib/servidores-db";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const GET = conModulo("servidores", {}, async () => Response.json({ servidores: serializar(await listarServidores()) }, { headers: { "Cache-Control": "no-store" } }));
export const POST = conModulo("servidores", {}, async (sesion, req: NextRequest) => {
  const resultado = await crearServidor(sesion.orgId!, validarServidor(await req.json()));
  return Response.json(serializar(resultado), { status: 201, headers: { "Cache-Control": "no-store" } });
});
