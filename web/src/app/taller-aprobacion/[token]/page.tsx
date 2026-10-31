import { TallerAprobacionPublica } from "@/components/taller/TallerAprobacionPublica";
import { notFound } from "next/navigation";
import { db, runWithOrg } from "@/lib/db";

export default async function TallerAprobacionPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const match = /^(\d+)-([a-f0-9]{48})$/.exec(token);
  if (!match) notFound();
  const visible = await runWithOrg(BigInt(match[1]), async () => {
    const modulo = await db.moduloOrg.findFirst({ where: { clave: "taller", activo: true }, select: { id: true } });
    const orden = modulo ? await db.tallerOrden.findFirst({ where: { aprobacionToken: match[2], estado: "esperando_aprobacion" }, select: { id: true } }) : null;
    return Boolean(orden);
  });
  if (!visible) notFound();
  return <main className="mx-auto max-w-2xl p-6"><TallerAprobacionPublica token={token} /></main>;
}
