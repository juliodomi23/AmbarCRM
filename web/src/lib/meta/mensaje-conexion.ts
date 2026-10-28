const MENSAJE_GENERICO = "No se pudo conectar. Vuelve a intentarlo o usa la conexión manual.";

export function mensajeConexionMeta(detalle: string, canal: "Instagram" | "Messenger") {
  const error = detalle.toLowerCase();
  if (/inicia sesión como administrador/.test(error)) {
    return "Inicia sesión como administrador y vuelve a conectar el canal.";
  }
  if (/cancelada o sin permisos/.test(error)) {
    return `No se completó la conexión con ${canal}. Si cancelaste el permiso, inténtalo de nuevo. Si tu cuenta no tiene acceso a la app de Meta, pide un rol de evaluador o tester, o usa la conexión manual.`;
  }
  if (/cancel|deneg|rechazó.*autorización/.test(error)) {
    return `Cancelaste la autorización de ${canal}. Vuelve a conectar cuando quieras.`;
  }
  if (/profesional|empresa o creador|business account/.test(error)) {
    return "Esta cuenta de Instagram debe ser profesional (Empresa o Creador). Cambia el tipo de cuenta e inténtalo de nuevo.";
  }
  if (/ya está conectada|ya.*conectad|otra conexión|canal actual/.test(error)) {
    return "Esta cuenta ya está conectada. Revisa los canales existentes o elige otra cuenta.";
  }
  if (/rol|evaluador|tester|permiso.*app|not authorized|not authorised/.test(error)) {
    return `Tu cuenta necesita acceso a la app de Meta para conectar ${canal}. Pide al administrador que te agregue como evaluador o tester, o usa la conexión manual.`;
  }
  if (/renovar|revocad|token.*venc/.test(error)) {
    return `El acceso de ${canal} venció o fue retirado. Vuelve a conectar el canal.`;
  }
  if (/sesión|sesion|venc|expir|estado de conexión|inicio de sesión ya fue utilizado/.test(error)) {
    return "La sesión de conexión venció. Inicia sesión de nuevo y vuelve a intentarlo.";
  }
  return MENSAJE_GENERICO;
}
