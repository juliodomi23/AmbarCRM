import { redirect } from "next/navigation";

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ conexion?: string }> }) {
  const { conexion } = await searchParams;
  redirect(conexion ? `/citas?conexion=${encodeURIComponent(conexion)}` : "/citas");
}
