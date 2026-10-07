import assert from "node:assert/strict";
import { validarCampos } from "../src/lib/campos-personalizados.ts";
const defs = [
  {
    clave: "alergias",
    tipo: "texto",
    opciones: [],
    obligatorio: true,
    activo: true,
  },
  {
    clave: "primera",
    tipo: "si_no",
    opciones: [],
    obligatorio: false,
    activo: true,
  },
  {
    clave: "tipo",
    tipo: "opcion",
    opciones: ["Limpieza"],
    obligatorio: false,
    activo: true,
  },
] as const;
assert.deepEqual(
  validarCampos([...defs], {
    alergias: "polen",
    primera: true,
    desconocida: "ignorar",
  }).campos,
  { alergias: "polen", primera: true },
);
assert.equal(
  validarCampos([...defs], { alergias: "", tipo: "Otro" }).errores.length,
  2,
);
console.log("campos-personalizados OK");
