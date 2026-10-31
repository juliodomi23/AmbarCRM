import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { guardarMediaBase64 } from "@/lib/storage";
import { aBigInt } from "@/lib/ids";

const MAX_BYTES = 8 * 1024 * 1024;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const POST = conModulo("taller", {}, async (sesion, req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  if (sesion.userId === null) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  const id = aBigInt((await props.params).id), body = await req.json().catch(() => null);
  if (!id || id <= 0n || !body || typeof body !== "object") return NextResponse.json({ error: "Datos de foto inválidos" }, { status: 400 });
  const mime = String(body.mime ?? "").toLowerCase(), tipo = String(body.tipo ?? "");
  const base64 = String(body.base64 ?? "").replace(/^data:[^,]+,/, "");
  if (!MIMES.has(mime) || !["ingreso", "danio", "evidencia"].includes(tipo) || !base64 || base64.length > Math.ceil(MAX_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return NextResponse.json({ error: "Foto inválida. Usa JPG, PNG o WebP de hasta 8 MB" }, { status: 400 });
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > MAX_BYTES) return NextResponse.json({ error: "La foto supera el límite de 8 MB" }, { status: 400 });
  const firma = mime === "image/jpeg" ? buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) : mime === "image/png" ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (!firma) return NextResponse.json({ error: "El contenido no coincide con el tipo de imagen" }, { status: 400 });
  if (!(await db.tallerOrden.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
  const url = await guardarMediaBase64(base64, mime);
  const foto = await db.tallerFoto.create({ data: { ordenId: id, url, tipo, userId: sesion.userId } });
  return NextResponse.json({ foto }, { status: 201 });
});
