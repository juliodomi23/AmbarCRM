// Comprueba que todo `fetch("/api/…")` de los componentes que usa la demo tenga manejador en la API simulada
// (o esté en la lista de endpoints que la demo rechaza a propósito). Uso: npx tsx scripts/check-demo.ts
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolver } from "../src/lib/demo/api/ruteo";
import "../src/lib/demo/api";

const RAIZ = new URL("../src/", import.meta.url).pathname;
const CARPETAS = ["components/chat", "components/kanban", "components/contactos", "components/tareas", "components/citas", "components/caja", "components/retail", "components/cotizaciones", "components/pedidos", "components/config", "components/modulos", "components/lealtad"];
const ARCHIVOS = ["components/AppShell.tsx", "components/CommandPalette.tsx", "components/PushSetup.tsx", "components/EtiquetaNueva.tsx", "components/CamposPersonalizadosForm.tsx"];

// Pantallas que la demo no pinta (o sin sentido sin servidor): su `fetch` nunca se ejecuta en /demo.
const NO_USADOS = ["TiendaPublica", "RespuestaCotizacion", "ReservaPublica", "GestionCita", "MetaCanales", "EmbeddedSignup", "ConexionManual", "VentasCliente", "ComprasCliente", "PreciosCliente", "ReportesRetailCliente", "RevisionSinRed", "ExpedienteCliente", "TabClientes", "LealtadConfig", "CitasConfig", "TabBots", "TabCamposPersonalizados", "TabAutomatizaciones", "TabIA", "EnviarPlantilla"];
// Endpoints que la demo rechaza a propósito (error + toast «En la demo esto no se guarda»).
const RECHAZADOS = [/^\/api\/mensajes\/enviar$/, /^\/api\/(caja|wa|meta|canales|bots|ia)\//, /^\/api\/campos-personalizados\//, /^\/api\/(productos\/importar|ajustes)$/];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? archivos(join(dir, n)) : n.endsWith(".tsx") ? [join(dir, n)] : []));
}
const lista = [...CARPETAS.flatMap((c) => archivos(join(RAIZ, c))), ...ARCHIVOS.map((a) => join(RAIZ, a))].filter((f) => !NO_USADOS.some((n) => f.includes(`/${n}.tsx`)));

let revisados = 0;
const sinCubrir: string[] = [];
for (const archivo of lista) {
  const fuente = readFileSync(archivo, "utf8");
  for (const m of fuente.matchAll(/fetch\(\s*([`"'])(\/api\/[^`"']*)\1/g)) {
    const url = m[2].replace("${tipoFicha}", "pacientes").replace(/\$\{[^}]*\}/g, "1").split("?")[0];
    revisados++;
    const cubierto = ["GET", "POST", "PATCH", "PUT", "DELETE"].some((metodo) => resolver(metodo, url)) || RECHAZADOS.some((r) => r.test(url));
    if (!cubierto) sinCubrir.push(`${archivo.replace(RAIZ, "")}: ${m[2]}`);
  }
}
assert.deepEqual(sinCubrir, [], `Endpoints sin manejador en la demo:\n${sinCubrir.join("\n")}`);
console.log(`check-demo OK · ${revisados} llamadas fetch revisadas en ${lista.length} archivos`);
