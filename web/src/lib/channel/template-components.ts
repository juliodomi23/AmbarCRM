import type { ParametrosPlantilla, PlantillaOficial } from "./types";

type ErrorPlantilla = { motivo: string; mensaje: string };
type ComponenteMeta = Record<string, unknown>;

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function tipoComponente(valor: unknown): string {
  return esObjeto(valor) && typeof valor.type === "string" ? valor.type.toUpperCase() : "";
}

export function contarVariables(texto: unknown): number {
  return typeof texto === "string" ? [...texto.matchAll(/\{\{\s*\d+\s*\}\}/g)].length : 0;
}

export function parsearParametrosPlantilla(
  encabezado: unknown,
  botones: unknown,
): { ok: true; parametros: ParametrosPlantilla } | { ok: false; error: ErrorPlantilla } {
  let encabezadoNormalizado: ParametrosPlantilla["encabezado"];
  if (encabezado !== undefined) {
    if (!esObjeto(encabezado)) return { ok: false, error: { motivo: "encabezado_invalido", mensaje: "header debe ser un objeto válido" } };
    if (encabezado.type === "text") {
      if (!Array.isArray(encabezado.variables) || encabezado.variables.length > 50 ||
        !encabezado.variables.every((valor) => typeof valor === "string" && valor.length <= 2000)) {
        return { ok: false, error: { motivo: "encabezado_invalido", mensaje: "header.variables debe contener hasta 50 textos de máximo 2000 caracteres" } };
      }
      encabezadoNormalizado = { type: "text", variables: encabezado.variables as string[] };
    } else if (["image", "document", "video"].includes(String(encabezado.type))) {
      if (typeof encabezado.link !== "string" || encabezado.link.length > 2048 || !/^https:\/\//i.test(encabezado.link)) {
        return { ok: false, error: { motivo: "encabezado_invalido", mensaje: "header.link debe ser una URL HTTPS válida de hasta 2048 caracteres" } };
      }
      encabezadoNormalizado = { type: encabezado.type as "image" | "document" | "video", link: encabezado.link };
    } else {
      return { ok: false, error: { motivo: "encabezado_invalido", mensaje: "header.type debe ser text, image, document o video" } };
    }
  }

  if (botones === undefined) return { ok: true, parametros: { encabezado: encabezadoNormalizado } };
  if (!Array.isArray(botones) || botones.length > 10) {
    return { ok: false, error: { motivo: "botones_invalidos", mensaje: "buttons debe contener hasta 10 botones" } };
  }
  const indices = new Set<number>();
  const botonesNormalizados: NonNullable<ParametrosPlantilla["botones"]> = [];
  for (const boton of botones) {
    if (!esObjeto(boton) || !Number.isInteger(boton.index) || (boton.index as number) < 0 || (boton.index as number) > 9 || indices.has(boton.index as number)) {
      return { ok: false, error: { motivo: "boton_invalido", mensaje: "Cada botón debe tener un índice único entre 0 y 9" } };
    }
    indices.add(boton.index as number);
    if (boton.type === "quick_reply") {
      if (typeof boton.payload !== "string" || boton.payload.length > 256) {
        return { ok: false, error: { motivo: "boton_invalido", mensaje: "El payload de respuesta rápida no debe exceder 256 caracteres" } };
      }
      botonesNormalizados.push({ index: boton.index as number, type: "quick_reply", payload: boton.payload });
    } else if (boton.type === "url") {
      if (typeof boton.text !== "string" || boton.text.length > 2000) {
        return { ok: false, error: { motivo: "boton_invalido", mensaje: "El parámetro del botón URL no debe exceder 2000 caracteres" } };
      }
      botonesNormalizados.push({ index: boton.index as number, type: "url", text: boton.text });
    } else {
      return { ok: false, error: { motivo: "boton_invalido", mensaje: "buttons.type debe ser quick_reply o url" } };
    }
  }
  return { ok: true, parametros: { encabezado: encabezadoNormalizado, botones: botonesNormalizados } };
}

function botonesDePlantilla(componentes: unknown[]): unknown[] {
  return componentes.flatMap((componente) => {
    if (!esObjeto(componente)) return [];
    if (tipoComponente(componente) === "BUTTONS" && Array.isArray(componente.buttons)) return componente.buttons;
    if (tipoComponente(componente) === "BUTTON") return [componente];
    return [];
  });
}

export function validarParametrosPlantilla(
  plantilla: PlantillaOficial,
  variables: string[],
  parametros: ParametrosPlantilla = {},
): ErrorPlantilla | null {
  const componentes = Array.isArray(plantilla.components) ? plantilla.components : [];
  const cuerpo = componentes.find((componente) => tipoComponente(componente) === "BODY");
  const variablesCuerpo = contarVariables(esObjeto(cuerpo) ? cuerpo.text : undefined);
  if (variables.length !== variablesCuerpo) {
    return { motivo: "variables_no_coinciden", mensaje: `El cuerpo requiere ${variablesCuerpo} variable(s) y se recibieron ${variables.length}` };
  }

  const encabezadoPlantilla = componentes.find((componente) => tipoComponente(componente) === "HEADER");
  const encabezado = parametros.encabezado;
  if (!encabezadoPlantilla && encabezado) {
    return { motivo: "encabezado_no_existe", mensaje: "La plantilla no tiene encabezado" };
  }
  if (esObjeto(encabezadoPlantilla)) {
    const formato = typeof encabezadoPlantilla.format === "string" ? encabezadoPlantilla.format.toUpperCase() : "";
    const variablesEncabezado = contarVariables(encabezadoPlantilla.text);
    if (formato === "TEXT") {
      if (encabezado && encabezado.type !== "text") {
        return { motivo: "encabezado_tipo_no_coincide", mensaje: "La plantilla requiere un encabezado de texto" };
      }
      const recibidas = encabezado?.type === "text" ? encabezado.variables.length : 0;
      if (recibidas !== variablesEncabezado) {
        return { motivo: "variables_no_coinciden", mensaje: `El encabezado requiere ${variablesEncabezado} variable(s) y se recibieron ${recibidas}` };
      }
    } else if (["IMAGE", "DOCUMENT", "VIDEO"].includes(formato)) {
      const tipoEsperado = formato.toLowerCase();
      if (!encabezado || encabezado.type !== tipoEsperado) {
        return { motivo: "encabezado_tipo_no_coincide", mensaje: `La plantilla requiere un encabezado de tipo ${tipoEsperado}` };
      }
    } else if (encabezado) {
      return { motivo: "encabezado_tipo_no_coincide", mensaje: "El tipo de encabezado no coincide con la plantilla" };
    }
  }

  const botonesPlantilla = botonesDePlantilla(componentes);
  for (const boton of parametros.botones ?? []) {
    const existente = botonesPlantilla[boton.index];
    if (!esObjeto(existente)) return { motivo: "boton_no_existe", mensaje: `La plantilla no tiene un botón en el índice ${boton.index}` };
    const tipoMeta = tipoComponente(existente);
    const tipoEsperado = boton.type === "quick_reply" ? "QUICK_REPLY" : "URL";
    if (tipoMeta !== tipoEsperado) {
      return { motivo: "boton_tipo_no_coincide", mensaje: `El botón ${boton.index} no es de tipo ${boton.type}` };
    }
    if (boton.type === "url" && contarVariables(existente.url) !== 1) {
      return { motivo: "variables_no_coinciden", mensaje: `El botón URL ${boton.index} no tiene exactamente un parámetro dinámico` };
    }
  }
  return null;
}

export function construirComponentesPlantilla(
  variables: string[] = [],
  parametros: ParametrosPlantilla = {},
): ComponenteMeta[] {
  const componentes: ComponenteMeta[] = [];
  const encabezado = parametros.encabezado;
  if (encabezado?.type === "text" && encabezado.variables.length) {
    componentes.push({ type: "header", parameters: encabezado.variables.map((text) => ({ type: "text", text })) });
  } else if (encabezado && encabezado.type !== "text") {
    componentes.push({ type: "header", parameters: [{ type: encabezado.type, [encabezado.type]: { link: encabezado.link } }] });
  }
  if (variables.length) {
    componentes.push({ type: "body", parameters: variables.map((text) => ({ type: "text", text })) });
  }
  for (const boton of parametros.botones ?? []) {
    componentes.push({
      type: "button",
      sub_type: boton.type,
      index: String(boton.index),
      parameters: [boton.type === "quick_reply" ? { type: "payload", payload: boton.payload } : { type: "text", text: boton.text }],
    });
  }
  return componentes;
}
