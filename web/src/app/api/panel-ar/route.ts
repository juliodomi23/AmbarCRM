import { conModulo } from "@/lib/con-modulo";
import { panelAR } from "@/lib/panel-ar-db";
import { serializar } from "@/lib/serialize";

export const GET = conModulo("panel_ar", {}, async (sesion) => Response.json(serializar(await panelAR(sesion.orgId!))));
