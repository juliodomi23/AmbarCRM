import { conAdminIntegracion, leerObjeto, respuestaIntegracion } from "@/lib/integraciones-api";
import { guardarRegla, listarReglasConOpciones } from "@/lib/services/reglas-automatizacion";
export const dynamic = "force-dynamic";
export const GET = conAdminIntegracion(async () => respuestaIntegracion(await listarReglasConOpciones()));
export const POST = conAdminIntegracion(async (req, orgId) => respuestaIntegracion(await guardarRegla(orgId, await leerObjeto(req)), 201));
