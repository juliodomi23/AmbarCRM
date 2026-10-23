import { db, dbRaw } from "@/lib/db";

export function tokenFcmValido(valor: unknown): valor is string {
  return typeof valor === "string" && valor.length >= 1 && valor.length <= 4096;
}

export async function registrarDispositivo(orgId: bigint, usuarioId: bigint, tokenFcm: string, plataforma: "ios" | "android") {
  await dbRaw.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.current_org', ${String(orgId)}, true)`;
    await tx.$queryRaw`SELECT registrar_dispositivo_push(${usuarioId}, ${tokenFcm}, ${plataforma})`;
  });
}

export async function borrarDispositivo(usuarioId: bigint, tokenFcm: string) {
  await db.dispositivoPush.deleteMany({ where: { usuarioId, tokenFcm } });
}
