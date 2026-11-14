async function pantallaInicial() {
  try {
    const res = await fetch("/api/modulos");
    const datos = res.ok ? await res.json() : null;
    return datos?.modulos?.some((m: { clave: string; activo: boolean }) => m.clave === "taller" && m.activo) ? "/taller/ordenes" : "/embudos";
  } catch {
    return "/embudos";
  }
}

export { pantallaInicial };
