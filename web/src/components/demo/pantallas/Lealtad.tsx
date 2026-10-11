"use client";

// Lealtad: PanelListado real con las métricas de «Aurum» simulado (no hay conexión real).
import Link from "next/link";
import { PanelListado } from "@/components/modulos/PanelListado";
import { useDatos } from "@/lib/demo/usar-almacen";

export function PantallaLealtad() {
  const d = useDatos();
  const tarjetas = (d.extra.lealtad ?? []) as Array<{ contactoId: string; sellos: number; premiosGanados: number; premiosPendientes: number }>;
  const aurum = (d.modulos.lealtad?.config as { aurum?: { slug?: string } } | undefined)?.aurum;
  if (!aurum?.slug) {
    return (
      <div className="space-y-2 p-6">
        <h1 className="text-xl font-semibold">Lealtad</h1>
        <p className="text-sm text-muted-foreground">Conecta el negocio de Aurum para ver las tarjetas de tus clientes.</p>
        <Link href="/configuracion?tab=modulos" className="text-sm font-medium text-primary">Ir a Configuración → Módulos</Link>
      </div>
    );
  }
  const clientes = tarjetas.map((t) => ({ t, c: d.contactos.find((x) => x.id === t.contactoId) })).filter((x) => x.c);
  return (
    <PanelListado
      titulo="Lealtad"
      descripcion={`Tarjetas de sellos de Aurum · ${aurum.slug}`}
      metricas={[
        { etiqueta: "Clientes", valor: String(clientes.length) },
        { etiqueta: "Sellos activos", valor: String(tarjetas.reduce((s, t) => s + t.sellos, 0)) },
        { etiqueta: "Premios ganados", valor: String(tarjetas.reduce((s, t) => s + t.premiosGanados, 0)) },
        { etiqueta: "Por canjear", valor: String(tarjetas.reduce((s, t) => s + t.premiosPendientes, 0)) },
      ]}
      items={clientes.map(({ t, c }, i) => ({
        id: String(i),
        titulo: c!.nombre || c!.telefono || "",
        descripcion: c!.telefono ?? "",
        estado: t.premiosPendientes > 0 ? "premio pendiente" : "activo",
        dato: `${t.sellos} sello(s)`,
      }))}
    />
  );
}
