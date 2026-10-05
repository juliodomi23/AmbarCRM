import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Parser CSV simple con soporte de comillas. Detecta delimitador , o ; */
function parseCSV(text: string): string[][] {
  const cabecera = text.split(/\r?\n/)[0] ?? "";
  const delim = cabecera.split(";").length > cabecera.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let enComillas = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (enComillas) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else enComillas = false;
      } else field += ch;
    } else if (ch === '"') {
      enComillas = true;
    } else if (ch === delim) {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const soloDigitos = (s: string) => s.replace(/\D/g, "");

/**
 * Importa contactos desde CSV. Body: { csv: string }
 * Cabeceras reconocidas (en cualquier orden): nombre, telefono, email, empresa.
 * Upsert por teléfono; sin teléfono se crea siempre.
 */
export async function POST(req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const { csv } = await req.json().catch(() => ({}));
  if (!csv || typeof csv !== "string") return NextResponse.json({ error: "falta el CSV" }, { status: 400 });

  const filas = parseCSV(csv).filter((r) => r.some((c) => c.trim() !== ""));
  if (filas.length < 2) return NextResponse.json({ error: "el CSV no tiene datos" }, { status: 400 });

  const headers = filas[0].map((h) => h.trim().toLowerCase());
  const idx = {
    nombre: headers.findIndex((h) => ["nombre", "name"].includes(h)),
    telefono: headers.findIndex((h) => ["telefono", "teléfono", "phone", "celular", "whatsapp"].includes(h)),
    email: headers.findIndex((h) => ["email", "correo", "e-mail"].includes(h)),
    empresa: headers.findIndex((h) => ["empresa", "company", "negocio"].includes(h))
  };
  if (idx.nombre === -1 && idx.telefono === -1) {
    return NextResponse.json({ error: "el CSV debe tener al menos columna 'nombre' o 'telefono'" }, { status: 400 });
  }

  let creados = 0;
  let actualizados = 0;
  let omitidos = 0;

  for (const fila of filas.slice(1)) {
    const get = (i: number) => (i >= 0 ? (fila[i] ?? "").trim() : "");
    const nombre = get(idx.nombre);
    const telefono = soloDigitos(get(idx.telefono));
    const email = get(idx.email) || null;
    const empresa = get(idx.empresa) || null;

    if (!nombre && !telefono) { omitidos++; continue; }

    if (telefono) {
      // Sin unique global por teléfono: el org lo acota RLS, así que buscamos y decidimos.
      const existe = await db.contacto.findFirst({ where: { telefono } });
      if (existe) {
        await db.contacto.update({
          where: { id: existe.id },
          data: { nombre: nombre || undefined, email, empresa }
        });
        actualizados++;
      } else {
        await db.contacto.create({
          data: { nombre: nombre || telefono, telefono, email, empresa, fuente: "manual" }
        });
        creados++;
      }
    } else {
      await db.contacto.create({ data: { nombre, email, empresa, fuente: "manual" } });
      creados++;
    }
  }

  return NextResponse.json({ ok: true, creados, actualizados, omitidos });
}
