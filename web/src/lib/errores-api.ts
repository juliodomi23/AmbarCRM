import { Prisma } from "@prisma/client";

/** Errores de datos del cliente que no deben verse como 500 (id mal formado, registro inexistente). */
export function respuestaDeError(error: unknown): Response {
  if (error instanceof SyntaxError || error instanceof RangeError) {
    return Response.json({ error: "datos inválidos" }, { status: 400 });
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return Response.json({ error: "datos inválidos" }, { status: 400 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return Response.json({ error: "ya existe un registro con ese dato (clave, matrícula o código)" }, { status: 409 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return Response.json({ error: "registro inexistente" }, { status: 404 });
  }
  throw error;
}

/** Envuelve un handler de API para que esos errores respondan 400/404 en lugar de 500. */
export function conErrores<Argumentos extends unknown[]>(
  // `| undefined` solo por la inferencia de TypeScript sobre `requireSesion`; en la práctica siempre hay respuesta.
  handler: (...argumentos: Argumentos) => Response | undefined | Promise<Response | undefined>,
) {
  return async (...argumentos: Argumentos) => {
    try {
      return await handler(...argumentos);
    } catch (error) {
      return respuestaDeError(error);
    }
  };
}
