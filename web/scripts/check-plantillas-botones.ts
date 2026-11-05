import assert from "node:assert/strict";
import {
  construirComponentesPlantilla,
  parsearParametrosPlantilla,
  validarParametrosPlantilla,
} from "../src/lib/channel/template-components.ts";
import type { PlantillaOficial } from "../src/lib/channel/types.ts";

const plantilla: PlantillaOficial = {
  name: "recordatorio_cita",
  language: "es_MX",
  status: "APPROVED",
  components: [
    { type: "HEADER", format: "TEXT", text: "Hola {{1}}" },
    { type: "BODY", text: "Tu cita es el {{1}} a las {{2}}" },
    { type: "BUTTONS", buttons: [
      { type: "QUICK_REPLY", text: "Confirmar" },
      { type: "QUICK_REPLY", text: "Cancelar" },
      { type: "URL", text: "Ver cita", url: "https://ambarcrm.mx/cita/{{1}}" },
    ] },
  ],
};

const entrada = parsearParametrosPlantilla(
  { type: "text", variables: ["Ana"] },
  [
    { index: 0, type: "quick_reply", payload: "confirmar-cita-42" },
    { index: 1, type: "quick_reply", payload: "cancelar-cita-42" },
  ],
);
if (!entrada.ok) throw new Error(entrada.error.mensaje);
assert.equal(validarParametrosPlantilla(plantilla, ["miércoles", "10:00"], entrada.parametros), null);
assert.deepEqual(construirComponentesPlantilla(["miércoles", "10:00"], entrada.parametros), [
  { type: "header", parameters: [{ type: "text", text: "Ana" }] },
  { type: "body", parameters: [{ type: "text", text: "miércoles" }, { type: "text", text: "10:00" }] },
  { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "confirmar-cita-42" }] },
  { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: "cancelar-cita-42" }] },
]);

const errorVariables = validarParametrosPlantilla(plantilla, ["miércoles"], entrada.parametros);
assert.equal(errorVariables?.motivo, "variables_no_coinciden");
const errorBoton = parsearParametrosPlantilla(
  { type: "text", variables: ["Ana"] },
  [{ index: 9, type: "quick_reply", payload: "confirmar" }],
);
if (!errorBoton.ok) throw new Error(errorBoton.error.mensaje);
assert.equal(validarParametrosPlantilla(plantilla, ["miércoles", "10:00"], errorBoton.parametros)?.motivo, "boton_no_existe");

const botonUrl = parsearParametrosPlantilla(
  { type: "text", variables: ["Ana"] },
  [{ index: 2, type: "url", text: "cita-42" }],
);
if (!botonUrl.ok) throw new Error(botonUrl.error.mensaje);
assert.equal(validarParametrosPlantilla(plantilla, ["miércoles", "10:00"], botonUrl.parametros), null);
assert.deepEqual(construirComponentesPlantilla(["miércoles", "10:00"], botonUrl.parametros).at(-1), {
  type: "button", sub_type: "url", index: "2", parameters: [{ type: "text", text: "cita-42" }],
});

const plantillaAnterior: PlantillaOficial = {
  name: "recordatorio_simple",
  language: "es_MX",
  components: [{ type: "BODY", text: "Hola {{1}}" }],
};
const bodyAnterior = parsearParametrosPlantilla(undefined, undefined);
if (!bodyAnterior.ok) throw new Error(bodyAnterior.error.mensaje);
assert.equal(validarParametrosPlantilla(plantillaAnterior, ["Ana"], bodyAnterior.parametros), null);
assert.deepEqual(construirComponentesPlantilla(["Ana"], bodyAnterior.parametros), [
  { type: "body", parameters: [{ type: "text", text: "Ana" }] },
]);

const plantillaImagen: PlantillaOficial = {
  name: "recordatorio_imagen",
  language: "es_MX",
  components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hola" }],
};
const encabezadoImagen = parsearParametrosPlantilla({ type: "image", link: "https://ambarcrm.mx/citas.png" }, undefined);
if (!encabezadoImagen.ok) throw new Error(encabezadoImagen.error.mensaje);
assert.equal(validarParametrosPlantilla(plantillaImagen, [], encabezadoImagen.parametros), null);
assert.deepEqual(construirComponentesPlantilla([], encabezadoImagen.parametros), [
  { type: "header", parameters: [{ type: "image", image: { link: "https://ambarcrm.mx/citas.png" } }] },
]);

console.log("check:plantillas-botones OK · payload, encabezado, botones, validación y compatibilidad anterior");
