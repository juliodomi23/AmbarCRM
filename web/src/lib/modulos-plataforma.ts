// La plataforma ya administra organizaciones desde id=1 en Configuración.
export const ORG_PLATAFORMA = 1n;

export function moduloVisibleEnOrg(modulo: { clave: string; soloPlataforma?: boolean }, orgId: string | bigint | null | undefined) {
  return !modulo.soloPlataforma || String(orgId) === String(ORG_PLATAFORMA);
}
