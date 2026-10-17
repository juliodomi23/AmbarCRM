import { NextRequest } from "next/server";
import { ErrorRetail } from "@/lib/retail-db";

export async function leerObjeto(req: NextRequest) {
  if (Number(req.headers.get("content-length")) > 16384) throw new ErrorRetail("datos demasiado grandes", 413);
  const texto = await req.text();
  if (Buffer.byteLength(texto) > 16384) throw new ErrorRetail("datos demasiado grandes", 413);
  const body: unknown = JSON.parse(texto);
  return objetoEstricto(body);
}

export function objetoEstricto(valor: unknown, claves?: readonly string[]): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new ErrorRetail("objeto inválido");
  if (claves && Object.keys(valor).some((k) => !claves.includes(k))) throw new ErrorRetail("campo no permitido");
  return valor as Record<string, unknown>;
}

export function idIntegracion(valor: unknown): bigint {
  if (typeof valor !== "string" || !/^[1-9]\d{0,18}$/.test(valor)) throw new ErrorRetail("identificador inválido");
  return BigInt(valor);
}

