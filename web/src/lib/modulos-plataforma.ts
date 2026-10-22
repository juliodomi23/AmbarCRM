// La plataforma ya administra organizaciones desde id=1 en Configuración.
export const ORG_PLATAFORMA = 1n;

export function moduloVisibleEnOrg(modulo: { clave: string; soloPlataforma?: boolean; soloOrgId?: number }, orgId: string | bigint | null | undefined) {
  if (modulo.soloOrgId !== undefined && String(orgId) !== String(modulo.soloOrgId)) return false;
  return !modulo.soloPlataforma || String(orgId) === String(ORG_PLATAFORMA);
}
